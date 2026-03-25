from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.config import get_settings


def send_ready_email(*, to_email: str, public_number: int, store_name: str) -> None:
    """
    Синхронная отправка email (для локальной разработки через MailHog и простого запуска).
    Для production позже вынесем в фоновые задачи/очередь.
    """
    settings = get_settings()

    msg = EmailMessage()
    msg["From"] = settings.mail_from
    msg["To"] = to_email
    msg["Subject"] = f"Заказ №{public_number} готов — можно забирать"
    msg.set_content(
        "\n".join(
            [
                f"Ваш заказ №{public_number} готов.",
                "Можно забирать на столе выдачи по номеру на чеке.",
                "",
                f"Точка: {store_name}",
            ]
        )
    )

    with smtplib.SMTP(settings.mail_host, settings.mail_port, timeout=10) as smtp:
        if settings.mail_use_tls:
            smtp.starttls()
        if settings.mail_user and settings.mail_password:
            smtp.login(settings.mail_user, settings.mail_password)
        smtp.send_message(msg)

