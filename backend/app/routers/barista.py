from __future__ import annotations

import time
import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.emailer import send_ready_email

router = APIRouter(tags=["barista"])


@router.get("/stores/{store_id}/orders")
def list_orders(
    store_id: str,
    status: str = Query(..., pattern="^(paid|ready)$"),
    db: Session = Depends(get_db),
) -> dict:
    orders = (
        db.execute(
            text(
                """
                SELECT
                  o.id,
                  o.status,
                  o.public_number,
                  o.created_at,
                  o.total_cents,
                  COALESCE(p.fiscal_status, 'pending') AS fiscal_status,
                  p.fiscal_last_error AS fiscal_last_error
                FROM orders o
                LEFT JOIN LATERAL (
                  SELECT fiscal_status, fiscal_last_error
                  FROM payments p
                  WHERE p.order_id = o.id
                  ORDER BY p.created_at DESC
                  LIMIT 1
                ) p ON true
                WHERE o.store_id = :sid AND o.status = :st
                ORDER BY created_at ASC
                """
            ),
            {"sid": store_id, "st": status},
        )
        .mappings()
        .all()
    )

    order_ids = [str(o["id"]) for o in orders]
    if not order_ids:
        return {"orders": []}

    lines = (
        db.execute(
            text(
                """
                SELECT ol.id, ol.order_id, ol.menu_item_name_snapshot, ol.quantity, ol.unit_price_cents, ol.line_total_cents
                FROM order_lines ol
                WHERE ol.order_id = ANY(:oids)
                ORDER BY ol.order_id, ol.id
                """
            ),
            {"oids": order_ids},
        )
        .mappings()
        .all()
    )

    lines_by_order: dict[str, list[dict]] = {}
    for l in lines:
        lines_by_order.setdefault(str(l["order_id"]), []).append(
            {
                "name": l["menu_item_name_snapshot"],
                "quantity": l["quantity"],
                "unit_price_cents": l["unit_price_cents"],
                "line_total_cents": l["line_total_cents"],
                # Modifiers are not displayed in current Barista UI.
                # Returning empty array reduces DB work significantly.
                "modifiers": [],
            }
        )

    return {
        "orders": [
            {
                "order_id": str(o["id"]),
                "status": o["status"],
                "public_number": o["public_number"],
                "created_at": o["created_at"].isoformat() if o["created_at"] else None,
                "total_cents": o["total_cents"],
                "fiscal_status": o["fiscal_status"],
                "fiscal_last_error": o["fiscal_last_error"],
                "lines": lines_by_order.get(str(o["id"]), []),
            }
            for o in orders
        ]
    }


@router.post("/orders/{order_id}/ready")
def mark_ready(order_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    order = (
        db.execute(
            text(
                """
                SELECT o.id, o.status, o.public_number, o.guest_email, o.store_id, s.name AS store_name
                , COALESCE(p.fiscal_status, 'pending') AS fiscal_status
                , p.fiscal_last_error AS fiscal_last_error
                FROM orders o
                JOIN stores s ON s.id = o.store_id
                LEFT JOIN LATERAL (
                  SELECT fiscal_status, fiscal_last_error
                  FROM payments p
                  WHERE p.order_id = o.id
                  ORDER BY p.created_at DESC
                  LIMIT 1
                ) p ON true
                WHERE o.id = :id
                """
            ),
            {"id": order_id},
        )
        .mappings()
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order_not_found")
    # Idempotency: if already ready, just return current state.
    if order["status"] != "paid":
        if order["status"] == "ready":
            return {"status": "ready"}
        raise HTTPException(status_code=409, detail="invalid_status")

    if order.get("fiscal_status") != "done":
        fiscal_status = order.get("fiscal_status")
        if fiscal_status == "failed":
            raise HTTPException(status_code=409, detail="fiscalization_failed")
        raise HTTPException(status_code=409, detail="fiscalization_not_done")

    db.execute(
        text(
            """
            UPDATE orders
            SET status = 'ready',
                ready_at = now(),
                updated_at = now()
            WHERE id = :id
            """
        ),
        {"id": order_id},
    )

    queued_ready_at = db.execute(
        text("SELECT ready_at FROM orders WHERE id = :id"),
        {"id": order_id},
    ).scalar_one()

    def add_event(event_type: str, payload: dict, actor: str) -> None:
        db.execute(
            text(
                """
                INSERT INTO order_events (order_id, event_type, payload, actor)
                VALUES (:oid, :event_type, CAST(:payload AS jsonb), :actor)
                """
            ),
            {"oid": order_id, "event_type": event_type, "payload": json.dumps(payload), "actor": actor},
        )

    # События: заказ готов
    db.execute(
        text(
            "INSERT INTO order_events (order_id, event_type, payload, actor) VALUES (:oid, 'order_ready', CAST(:p AS jsonb), 'barista')"
        ),
        {"oid": order_id, "p": "{}"},
    )

    # Уведомление по email (если указан)
    if order.get("guest_email") and order.get("public_number"):
        add_event(
            "ready_notification_queued",
            {"channel": "email", "to": order["guest_email"]},
            "system",
        )
        ready_at_iso = queued_ready_at.isoformat() if queued_ready_at else None

        def delayed_send() -> None:
            # Выполняется после ответа API.
            # Если бариста успел откатить заказ обратно в paid за 5 сек — письмо не отправляем.
            time.sleep(5)

            bg_db: Session = SessionLocal()
            try:
                current = (
                    bg_db.execute(
                        text("SELECT status, ready_at FROM orders WHERE id = :id"),
                        {"id": order_id},
                    )
                    .mappings()
                    .first()
                )
                if not current:
                    return

                if current["status"] != "ready":
                    bg_db.execute(
                        text(
                            """
                            INSERT INTO order_events (order_id, event_type, payload, actor)
                            VALUES (:oid, 'ready_notification_skipped', CAST(:p AS jsonb), 'system')
                            """
                        ),
                        {
                            "oid": order_id,
                            "p": json.dumps(
                                {
                                    "channel": "email",
                                    "to": order["guest_email"],
                                    "reason": "order_status_changed",
                                }
                            ),
                        },
                    )
                    bg_db.commit()
                    return

                current_ready_at = current["ready_at"]
                if ready_at_iso and current_ready_at and current_ready_at.isoformat() != ready_at_iso:
                    bg_db.execute(
                        text(
                            """
                            INSERT INTO order_events (order_id, event_type, payload, actor)
                            VALUES (:oid, 'ready_notification_skipped', CAST(:p AS jsonb), 'system')
                            """
                        ),
                        {
                            "oid": order_id,
                            "p": json.dumps(
                                {
                                    "channel": "email",
                                    "to": order["guest_email"],
                                    "reason": "ready_at_changed",
                                }
                            ),
                        },
                    )
                    bg_db.commit()
                    return

                send_ready_email(
                    to_email=order["guest_email"],
                    public_number=int(order["public_number"]),
                    store_name=order["store_name"],
                )
                bg_db.execute(
                    text(
                        """
                        INSERT INTO order_events (order_id, event_type, payload, actor)
                        VALUES (:oid, 'ready_notification_sent', CAST(:p AS jsonb), 'system')
                        """
                    ),
                    {
                        "oid": order_id,
                        "p": json.dumps({"channel": "email", "to": order["guest_email"]}),
                    },
                )
                bg_db.commit()
            except Exception as e:  # noqa: BLE001
                bg_db.execute(
                    text(
                        """
                        INSERT INTO order_events (order_id, event_type, payload, actor)
                        VALUES (:oid, 'ready_notification_failed', CAST(:p AS jsonb), 'system')
                        """
                    ),
                    {
                        "oid": order_id,
                        "p": json.dumps(
                            {"channel": "email", "to": order["guest_email"], "error": str(e)}
                        ),
                    },
                )
                bg_db.commit()
            finally:
                bg_db.close()

        background_tasks.add_task(delayed_send)
    else:
        add_event(
            "ready_notification_skipped",
            {"reason": "guest_email_missing_or_public_number_missing"},
            "system",
        )

    db.commit()
    return {"status": "ready"}


@router.post("/orders/{order_id}/paid")
def mark_paid(order_id: str, db: Session = Depends(get_db)) -> dict:
    order = (
        db.execute(
            text("SELECT id, status FROM orders WHERE id = :id"),
            {"id": order_id},
        )
        .mappings()
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order_not_found")
    # Idempotency: if already paid, just return current state.
    if order["status"] != "ready":
        if order["status"] == "paid":
            return {"status": "paid"}
        raise HTTPException(status_code=409, detail="invalid_status")

    db.execute(
        text(
            """
            UPDATE orders
            SET status = 'paid',
                ready_at = NULL,
                updated_at = now()
            WHERE id = :id
            """
        ),
        {"id": order_id},
    )

    db.execute(
        text(
            """
            INSERT INTO order_events (order_id, event_type, payload, actor)
            VALUES (:oid, 'order_unready', CAST(:p AS jsonb), 'barista')
            """
        ),
        {"oid": order_id, "p": "{}"},
    )
    db.commit()
    return {"status": "paid"}

