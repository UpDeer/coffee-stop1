from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(tags=["public"])


@router.get("/stores")
def list_stores(db: Session = Depends(get_db)) -> dict:
    rows = (
        db.execute(
            text("SELECT id, slug, name, accepting_orders FROM stores ORDER BY created_at DESC")
        )
        .mappings()
        .all()
    )

    return {
        "stores": [
            {
                "id": str(r["id"]),
                "slug": r["slug"],
                "name": r["name"],
                "accepting_orders": r["accepting_orders"],
            }
            for r in rows
        ]
    }

