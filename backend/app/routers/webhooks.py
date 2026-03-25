from __future__ import annotations

import json
import time
import uuid

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_db
from app.routers.public_orders import _mark_paid_and_assign_number

router = APIRouter(tags=["webhooks"])


def _decode_tochka_webhook_jwt(*, jwt_text: str, settings) -> dict:
    if not settings.tochka_webhook_public_jwk_json:
        raise HTTPException(status_code=500, detail="tochka_not_configured:missing_webhook_public_jwk")
    jwk = json.loads(settings.tochka_webhook_public_jwk_json)
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
    decoded = jwt.decode(jwt_text, key=public_key, algorithms=["RS256"], options={"verify_aud": False})
    if not isinstance(decoded, dict):
        raise HTTPException(status_code=400, detail="tochka_webhook_invalid_payload")
    return decoded


def _evotor_fiscalize_in_background(order_id: str) -> None:
    """
    Placeholder for Evotor fiscalization (Digital Cashbox / ATOL-compatible).

    Safety rule:
    - if real Evotor integration is not enabled, mark payments.fiscal_status='failed'
      so barista cannot move paid -> ready.
    """
    settings = get_settings()
    bg_db: Session = SessionLocal()
    try:
        payment = (
            bg_db.execute(
                text(
                    """
                SELECT id, fiscal_status
                FROM payments
                WHERE order_id = :oid
                ORDER BY created_at DESC
                LIMIT 1
                """
                ),
                {"oid": order_id},
            )
            .mappings()
            .first()
        )
        if not payment:
            return
        if payment.get("fiscal_status") == "done":
            return

        bg_db.execute(
            text(
                """
            UPDATE payments
            SET fiscal_provider = 'evotor_digital_cashbox',
                fiscal_status = 'pending',
                fiscal_attempts = fiscal_attempts + 1,
                fiscal_uuid = NULL,
                fiscal_last_error = NULL
            WHERE id = :pid
            """
            ),
            {"pid": payment["id"]},
        )
        bg_db.commit()

        mode = settings.evotor_integration_mode
        if mode == "mock_done":
            time.sleep(0.2)
            fiscal_uuid = str(uuid.uuid4())
            bg_db.execute(
                text(
                    """
                UPDATE payments
                SET fiscal_status = 'done',
                    fiscal_uuid = :fu,
                    fiscal_last_error = NULL,
                    fiscal_result_payload = COALESCE(fiscal_result_payload, '{}'::jsonb)
                WHERE id = :pid
                """
                ),
                {"pid": payment["id"], "fu": fiscal_uuid},
            )
            bg_db.execute(
                text(
                    """
                INSERT INTO order_events (order_id, event_type, payload, actor)
                VALUES (:oid, 'fiscalization_mock_done', CAST(:p AS jsonb), 'system')
                """
                ),
                {"oid": order_id, "p": json.dumps({"fiscal_uuid": fiscal_uuid})},
            )
            bg_db.commit()
            return

        bg_db.execute(
            text(
                """
            UPDATE payments
            SET fiscal_status = 'failed',
                fiscal_last_error = :err,
                fiscal_result_payload = COALESCE(fiscal_result_payload, '{}'::jsonb)
            WHERE id = :pid
            """
            ),
            {
                "pid": payment["id"],
                "err": f"evotor_fiscalization_not_implemented_or_disabled (mode={mode})",
            },
        )
        bg_db.execute(
            text(
                """
            INSERT INTO order_events (order_id, event_type, payload, actor)
            VALUES (:oid, 'fiscalization_failed', CAST(:p AS jsonb), 'system')
            """
            ),
            {"oid": order_id, "p": json.dumps({"mode": mode})},
        )
        bg_db.commit()
    finally:
        bg_db.close()


@router.post("/payments/mock/succeed/{order_id}")
def mock_payment_succeed(order_id: str, db: Session = Depends(get_db)) -> dict:
    """
    DEV ONLY.
    Эмулирует успешную оплату: payment_pending -> paid + выдача public_number.
    Также выставляет `payments.fiscal_status=done`, чтобы бариста мог перевести paid -> ready.
    """
    res = _mark_paid_and_assign_number(order_id, db)
    db.execute(
        text(
            """
        UPDATE payments
        SET fiscal_provider = 'evotor_digital_cashbox',
            fiscal_status = 'done',
            fiscal_uuid = COALESCE(fiscal_uuid, :fu),
            fiscal_last_error = NULL
        WHERE order_id = :oid
        """
        ),
        {"oid": order_id, "fu": str(uuid.uuid4())},
    )
    db.commit()
    return res


@router.post("/tochka/acquiring-internet-payment")
async def tochka_acquiring_internet_payment(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    """
    Tochka webhook: body is JWT signed by Tochka (RS256).

    На статусе APPROVED:
    - payment_pending -> paid (idempotent, public_number назначается один раз)
    - payments.fiscal_status -> pending
    - запускаем фискализацию в фоне (Evotor placeholder)
    """
    settings = get_settings()
    raw_jwt = (await request.body()).decode("utf-8").strip()
    if not raw_jwt:
        return {"ok": True}

    try:
        decoded = _decode_tochka_webhook_jwt(jwt_text=raw_jwt, settings=settings)
    except Exception:
        # 200, чтобы Tochka продолжал ретраи/не блокировал нас.
        return {"ok": True}

    webhook_type = decoded.get("webhookType")
    status = decoded.get("status")
    operation_id = decoded.get("operationId")

    if webhook_type != "acquiringInternetPayment":
        return {"ok": True}
    if status != "APPROVED":
        return {"ok": True}
    if not operation_id or not isinstance(operation_id, str):
        return {"ok": True}

    payment = (
        db.execute(
            text(
                """
            SELECT id, order_id, fiscal_status
            FROM payments
            WHERE provider = 'tochka_payment_links'
              AND provider_payment_id = :opid
            ORDER BY created_at DESC
            LIMIT 1
            """
            ),
            {"opid": operation_id},
        )
        .mappings()
        .first()
    )
    if not payment:
        return {"ok": True}

    order_id = str(payment["order_id"])

    db.execute(
        text(
            """
        UPDATE payments
        SET status = 'succeeded'
        WHERE id = :pid
        """
        ),
        {"pid": payment["id"]},
    )
    _mark_paid_and_assign_number(order_id, db)

    db.execute(
        text(
            """
        UPDATE payments
        SET fiscal_provider = 'evotor_digital_cashbox',
            fiscal_status = CASE
                WHEN fiscal_status = 'done' THEN 'done'
                ELSE 'pending'
            END
        WHERE order_id = :oid
          AND provider = 'tochka_payment_links'
        """
        ),
        {"oid": order_id},
    )
    db.execute(
        text(
            """
        INSERT INTO order_events (order_id, event_type, payload, actor)
        VALUES (:oid, 'tochka_webhook_approved', CAST(:p AS jsonb), 'system')
        """
        ),
        {"oid": order_id, "p": json.dumps({"operationId": operation_id})},
    )
    db.commit()

    background_tasks.add_task(_evotor_fiscalize_in_background, order_id)
    return {"ok": True, "order_id": order_id}

