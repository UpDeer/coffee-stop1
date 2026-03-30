from __future__ import annotations

import datetime as dt
import json
import uuid
from decimal import Decimal
from typing import Any
from urllib import request as url_request

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.schemas import CheckoutOut, CreateOrderIn, OrderLineIn

router = APIRouter(tags=["public"])


def _uuid() -> str:
    return str(uuid.uuid4())


def _store_by_slug(db: Session, slug: str) -> dict:
    row = (
        db.execute(
            text("SELECT id, slug, name, accepting_orders FROM stores WHERE slug = :slug"),
            {"slug": slug},
        )
        .mappings()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="store_not_found")
    if not row["accepting_orders"]:
        raise HTTPException(status_code=403, detail="store_closed")
    return dict(row)


def _load_item_and_validate(db: Session, menu_item_id: str, store_id: str) -> dict:
    row = (
        db.execute(
            text(
                """
                SELECT mi.id, mi.name, mi.price_cents, mi.is_available, mi.stock_qty
                FROM menu_items mi
                JOIN menu_categories mc ON mc.id = mi.category_id
                WHERE mi.id = :id AND mc.store_id = :store_id
                """
            ),
            {"id": menu_item_id, "store_id": store_id},
        )
        .mappings()
        .first()
    )
    if not row:
        raise HTTPException(status_code=400, detail="menu_item_not_found")
    if not row["is_available"]:
        raise HTTPException(status_code=400, detail="menu_item_unavailable")
    stock = row.get("stock_qty")
    if stock is not None and int(stock) <= 0:
        raise HTTPException(status_code=400, detail="menu_item_out_of_stock")
    return dict(row)


def _load_modifier_options(db: Session, option_ids: list[str], menu_item_id: str) -> list[dict]:
    if not option_ids:
        return []
    rows = (
        db.execute(
            text(
                """
                SELECT mo.id, mo.name, mo.price_delta_cents
                FROM modifier_options mo
                JOIN modifier_groups mg ON mg.id = mo.group_id
                WHERE mo.id = ANY(:ids) AND mg.menu_item_id = :menu_item_id
                """
            ),
            {"ids": option_ids, "menu_item_id": menu_item_id},
        )
        .mappings()
        .all()
    )
    if len(rows) != len(set(option_ids)):
        raise HTTPException(status_code=400, detail="invalid_modifier_option")
    return [dict(r) for r in rows]


def _recalc_totals(lines_calc: list[dict]) -> tuple[int, int]:
    subtotal = sum(l["line_total_cents"] for l in lines_calc)
    total = subtotal
    return subtotal, total


@router.post("/stores/{slug}/orders")
def create_order(slug: str, payload: CreateOrderIn, db: Session = Depends(get_db)) -> dict:
    store = _store_by_slug(db, slug)

    if not payload.lines:
        raise HTTPException(status_code=400, detail="empty_order")

    order_id = _uuid()
    order_lines: list[dict] = []

    for line in payload.lines:
        item = _load_item_and_validate(db, line.menu_item_id, store_id=store["id"])
        stock = item.get("stock_qty")
        if stock is not None and int(line.quantity) > int(stock):
            raise HTTPException(status_code=400, detail="insufficient_stock")
        mods = _load_modifier_options(db, line.modifier_option_ids, menu_item_id=item["id"])
        unit = int(item["price_cents"]) + sum(int(m["price_delta_cents"]) for m in mods)
        line_total = unit * int(line.quantity)

        order_line_id = _uuid()
        order_lines.append(
            {
                "id": order_line_id,
                "menu_item_id": item["id"],
                "menu_item_name_snapshot": item["name"],
                "unit_price_cents": unit,
                "quantity": int(line.quantity),
                "line_total_cents": line_total,
                "modifiers": mods,
            }
        )

    subtotal, total = _recalc_totals(order_lines)

    db.execute(
        text(
            """
            INSERT INTO orders (id, store_id, status, guest_email, subtotal_cents, total_cents)
            VALUES (:id, :store_id, 'draft', :guest_email, :subtotal, :total)
            """
        ),
        {
            "id": order_id,
            "store_id": store["id"],
            "guest_email": payload.guest_email,
            "subtotal": subtotal,
            "total": total,
        },
    )

    for ol in order_lines:
        db.execute(
            text(
                """
                INSERT INTO order_lines (id, order_id, menu_item_id, menu_item_name_snapshot, unit_price_cents, quantity, line_total_cents)
                VALUES (:id, :order_id, :menu_item_id, :name, :unit, :qty, :total)
                """
            ),
            {
                "id": ol["id"],
                "order_id": order_id,
                "menu_item_id": ol["menu_item_id"],
                "name": ol["menu_item_name_snapshot"],
                "unit": ol["unit_price_cents"],
                "qty": ol["quantity"],
                "total": ol["line_total_cents"],
            },
        )

        for m in ol["modifiers"]:
            db.execute(
                text(
                    """
                    INSERT INTO order_line_modifiers (id, order_line_id, modifier_option_id, name_snapshot, price_delta_cents)
                    VALUES (:id, :line_id, :opt_id, :name, :delta)
                    """
                ),
                {
                    "id": _uuid(),
                    "line_id": ol["id"],
                    "opt_id": m["id"],
                    "name": m["name"],
                    "delta": m["price_delta_cents"],
                },
            )

    db.execute(
        text(
            "INSERT INTO order_events (order_id, event_type, payload, actor) VALUES (:oid, 'order_created', CAST(:p AS jsonb), 'system')"
        ),
        {"oid": order_id, "p": "{}"},
    )

    db.commit()

    return {
        "order_id": order_id,
        "status": "draft",
        "store": {"id": str(store["id"]), "slug": store["slug"], "name": store["name"]},
        "subtotal_cents": subtotal,
        "total_cents": total,
    }


@router.get("/orders/{order_id}/status")
def order_status(order_id: str, db: Session = Depends(get_db)) -> dict:
    row = (
        db.execute(
            text(
                """
                SELECT
                  id,
                  status,
                  store_id,
                  public_number,
                  ready_at,
                  created_at,
                  total_cents
                FROM orders
                WHERE id = :id
                """
            ),
            {"id": order_id},
        )
        .mappings()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="order_not_found")

    status = row["status"]
    estimated_wait_minutes: int | None = None
    lines: list[dict] = []
    modifiers_by_line_id: dict[str, list[dict]] = {}

    # Approximate wait time (MVP):
    # - only for `paid` orders
    # - compute queue position among `paid` orders in the same store
    # - estimate assumes average time per position (config can be added later)
    if status == "paid" and row.get("created_at") is not None:
        queue_position = (
            db.execute(
                text(
                    """
                    SELECT COUNT(*) AS cnt
                    FROM orders
                    WHERE store_id = :sid
                      AND status = 'paid'
                      AND created_at <= :created_at
                    """
                ),
                {"sid": row["store_id"], "created_at": row["created_at"]},
            )
            .mappings()
            .first()
        )
        cnt = int(queue_position["cnt"]) if queue_position and queue_position.get("cnt") is not None else 1
        avg_minutes_per_paid_position = 6
        estimated_wait_minutes = max(1, cnt * avg_minutes_per_paid_position)

    # Performance optimization:
    # In payment_pending (and other non-final states) we avoid loading order_lines/modifiers.
    # This reduces DB load for polling on the guest status screen.
    if status in ("paid", "ready"):
        lines = (
            db.execute(
                text(
                    """
                    SELECT
                      ol.id,
                      ol.menu_item_name_snapshot,
                      ol.quantity,
                      ol.unit_price_cents,
                      ol.line_total_cents
                    FROM order_lines ol
                    WHERE ol.order_id = :oid
                    ORDER BY ol.id ASC
                    """
                ),
                {"oid": order_id},
            )
            .mappings()
            .all()
        )

        line_ids = [str(l["id"]) for l in lines]
        if line_ids:
            mods = (
                db.execute(
                    text(
                        """
                        SELECT
                          olm.order_line_id,
                          olm.name_snapshot,
                          olm.price_delta_cents
                        FROM order_line_modifiers olm
                        WHERE olm.order_line_id = ANY(:lids)
                        ORDER BY olm.order_line_id, olm.id
                        """
                    ),
                    {"lids": line_ids},
                )
                .mappings()
                .all()
            )
            for m in mods:
                modifiers_by_line_id.setdefault(str(m["order_line_id"]), []).append(
                    {"name": m["name_snapshot"], "price_delta_cents": m["price_delta_cents"]}
                )

    return {
        "order_id": str(row["id"]),
        "status": status,
        "public_number": row["public_number"],
        "ready_at": row["ready_at"].isoformat() if row["ready_at"] else None,
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "total_cents": row["total_cents"],
        "estimated_wait_minutes": estimated_wait_minutes,
        "lines": [
            {
                "id": str(l["id"]),
                "name": l["menu_item_name_snapshot"],
                "quantity": l["quantity"],
                "unit_price_cents": l["unit_price_cents"],
                "line_total_cents": l["line_total_cents"],
                "modifiers": modifiers_by_line_id.get(str(l["id"]), []),
            }
            for l in lines
        ],
    }


@router.post("/orders/{order_id}/checkout", response_model=CheckoutOut)
def checkout(order_id: str, db: Session = Depends(get_db)) -> CheckoutOut:
    order = (
        db.execute(
            text("SELECT id, status, total_cents FROM orders WHERE id = :id"),
            {"id": order_id},
        )
        .mappings()
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order_not_found")
    if order["status"] != "draft":
        raise HTTPException(status_code=409, detail="invalid_status")

    payment_id = _uuid()
    db.execute(
        text(
            """
            INSERT INTO payments (order_id, provider, provider_payment_id, amount_cents, status)
            VALUES (:oid, 'mock', :pid, :amount, 'pending')
            """
        ),
        {"oid": order_id, "pid": payment_id, "amount": int(order["total_cents"])},
    )
    db.execute(
        text(
            """
            UPDATE orders
            SET status = 'payment_pending',
                payment_provider = 'mock',
                payment_provider_id = :pid,
                updated_at = now()
            WHERE id = :oid
            """
        ),
        {"oid": order_id, "pid": payment_id},
    )
    db.execute(
        text(
            "INSERT INTO order_events (order_id, event_type, payload, actor) VALUES (:oid, 'checkout_started', CAST(:p AS jsonb), 'system')"
        ),
        {"oid": order_id, "p": "{}"},
    )
    db.commit()

    # В проде тут будет URL провайдера (ЮKassa/Эватор). Для локальной разработки — mock.
    return CheckoutOut(order_id=order_id, status="payment_pending", payment_url=dev_only_payment_url(order_id))


def _mark_paid_and_assign_number(order_id: str, db: Session) -> dict:
    order = (
        db.execute(
            text("SELECT id, store_id, status, public_number FROM orders WHERE id = :id"),
            {"id": order_id},
        )
        .mappings()
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order_not_found")
    if order["status"] == "paid":
        # Idempotency: webhook may arrive twice.
        return {"status": "paid", "public_number": int(order["public_number"]) if order["public_number"] else None}
    if order["status"] != "payment_pending":
        raise HTTPException(status_code=409, detail="invalid_status")

    # Выделяем следующий номер заказа в рамках точки и дня (атомарно)
    today = dt.date.today()
    new_number = db.execute(
        text(
            """
            INSERT INTO store_order_sequences (store_id, seq_date, last_number)
            VALUES (:store_id, :d, 1)
            ON CONFLICT (store_id, seq_date)
            DO UPDATE SET last_number = store_order_sequences.last_number + 1
            RETURNING last_number
            """
        ),
        {"store_id": order["store_id"], "d": today},
    ).scalar_one()

    db.execute(
        text("UPDATE payments SET status = 'succeeded' WHERE order_id = :oid"),
        {"oid": order_id},
    )
    db.execute(
        text(
            """
            UPDATE orders
            SET status = 'paid',
                public_number = :n,
                public_number_date = :d,
                updated_at = now()
            WHERE id = :oid
            """
        ),
        {"oid": order_id, "n": int(new_number), "d": today},
    )
    db.execute(
        text(
            "INSERT INTO order_events (order_id, event_type, payload, actor) VALUES (:oid, 'payment_succeeded', CAST(:p AS jsonb), 'system')"
        ),
        {"oid": order_id, "p": "{}"},
    )
    db.commit()
    return {"status": "paid", "public_number": int(new_number)}


def dev_only_payment_url(order_id: str) -> str:
    return f"/api/v1/webhooks/payments/mock/succeed/{order_id}"


def _extract_first_str(data: Any, *keys: str) -> str | None:
    if not isinstance(data, dict):
        return None
    for k in keys:
        v = data.get(k)
        if isinstance(v, str) and v.strip():
            return v
    return None


def _extract_first_amount_url(data: Any) -> str | None:
    # Tochka response shape can vary; we try multiple common keys.
    if not isinstance(data, dict):
        return None
    return _extract_first_str(data, "paymentUrl", "payment_url", "payment_link_url", "paymentLinkUrl", "paymentLinkURL", "paymentLink")


def _extract_first_operation_id(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None
    return _extract_first_str(data, "operationId", "operation_id", "operationID", "operation")


def _require_tochka_config(settings) -> tuple[str, str, str, str | None, str | None]:
    if not settings.tochka_api_bearer_token:
        raise HTTPException(status_code=500, detail="tochka_not_configured:missing_token")
    if not settings.tochka_customer_code:
        raise HTTPException(status_code=500, detail="tochka_not_configured:missing_customer_code")
    if not settings.tochka_payment_redirect_url:
        raise HTTPException(status_code=500, detail="tochka_not_configured:missing_redirect_url")
    if not settings.tochka_payment_fail_redirect_url:
        raise HTTPException(status_code=500, detail="tochka_not_configured:missing_fail_redirect_url")
    api_base = settings.tochka_api_base_url.rstrip("/")
    token = settings.tochka_api_bearer_token
    customer_code = settings.tochka_customer_code
    merchant_id = settings.tochka_merchant_id
    ttl = settings.tochka_payment_ttl_minutes
    return api_base, token, customer_code, merchant_id, ttl


def _create_tochka_payment_operation(*, order_id: str, amount_rubles: str, settings) -> dict[str, Any]:
    api_base, token, customer_code, merchant_id, ttl = _require_tochka_config(settings)

    payment_modes = [m.strip() for m in settings.tochka_payment_modes.split(",") if m.strip()]
    if not payment_modes:
        payment_modes = ["card", "sbp"]

    body: dict[str, Any] = {
        "amount": amount_rubles,
        "customerCode": customer_code,
        "purpose": f"{settings.tochka_payment_purpose} ({order_id})",
        "paymentMode": payment_modes,
        "paymentLinkId": order_id,
        "redirectUrl": settings.tochka_payment_redirect_url,
        "failRedirectUrl": settings.tochka_payment_fail_redirect_url,
        "ttl": ttl,
    }
    if merchant_id:
        body["merchantId"] = merchant_id

    req = url_request.Request(
        url=f"{api_base}/acquiring/v1.0/payments",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with url_request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
            return payload
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"tochka_create_payment_failed: {e}")


@router.post("/orders/{order_id}/checkout/tochka", response_model=CheckoutOut)
def checkout_tochka(order_id: str, db: Session = Depends(get_db)) -> CheckoutOut:
    """
    Production endpoint: creates Tochka payment link.
    Right now we rely on env-based Tochka configuration; Evotor fiscalization is executed later.
    """
    order = (
        db.execute(
            text("SELECT id, status, total_cents FROM orders WHERE id = :id"),
            {"id": order_id},
        )
        .mappings()
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="order_not_found")

    # Idempotency: if already created and still pending, reuse last payment record.
    if order["status"] in ("payment_pending", "paid"):
        existing = (
            db.execute(
                text(
                    """
                    SELECT status, raw_payload
                    FROM payments
                    WHERE order_id = :oid AND provider = 'tochka_payment_links'
                    ORDER BY created_at DESC
                    LIMIT 1
                    """
                ),
                {"oid": order_id},
            )
            .mappings()
            .first()
        )
        if existing:
            url = _extract_first_amount_url(existing.get("raw_payload"))
            if url and existing["status"] in ("pending", "succeeded") and order["status"] in ("payment_pending", "paid"):
                return CheckoutOut(order_id=order_id, status="payment_pending", payment_url=url)

        raise HTTPException(status_code=409, detail="invalid_status")

    if order["status"] != "draft":
        raise HTTPException(status_code=409, detail="invalid_status")

    settings = get_settings()
    amount_cents = int(order["total_cents"])
    amount_rubles = str((Decimal(amount_cents) / Decimal(100)).quantize(Decimal("0.01")))

    payload = _create_tochka_payment_operation(order_id=order_id, amount_rubles=amount_rubles, settings=settings)
    payment_url = _extract_first_amount_url(payload)
    operation_id = _extract_first_operation_id(payload)
    if not payment_url or not operation_id:
        raise HTTPException(status_code=502, detail="tochka_response_unrecognized")

    db.execute(
        text(
            """
            INSERT INTO payments (order_id, provider, provider_payment_id, amount_cents, status, raw_payload)
            VALUES (:oid, 'tochka_payment_links', :opid, :amount, 'pending', CAST(:raw AS jsonb))
            """
        ),
        {"oid": order_id, "opid": operation_id, "amount": amount_cents, "raw": json.dumps(payload)},
    )
    db.execute(
        text(
            """
            UPDATE orders
            SET status = 'payment_pending',
                payment_provider = 'tochka_payment_links',
                payment_provider_id = :pid,
                updated_at = now()
            WHERE id = :oid
            """
        ),
        {"oid": order_id, "pid": operation_id},
    )
    db.execute(
        text(
            """
            INSERT INTO order_events (order_id, event_type, payload, actor)
            VALUES (:oid, 'checkout_started_tochka', CAST(:p AS jsonb), 'system')
            """
        ),
        {"oid": order_id, "p": "{}"},
    )
    db.commit()
    return CheckoutOut(order_id=order_id, status="payment_pending", payment_url=payment_url)

