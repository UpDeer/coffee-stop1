from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(tags=["public"])


@router.get("/stores/{slug}/menu")
def get_store_menu(slug: str, t: str | None = None, db: Session = Depends(get_db)) -> dict:
    store_row = db.execute(
        text("SELECT id, slug, name, accepting_orders FROM stores WHERE slug = :slug"),
        {"slug": slug},
    ).mappings().first()

    if not store_row:
        raise HTTPException(status_code=404, detail="store_not_found")

    # QR MVP: `t` может быть UUID точки (stores.id). Проверяем, что slug и id совпадают.
    # Позже заменим на подписанный/истекающий токен (HMAC/JWT), как по плану.
    if t is not None:
        if str(store_row["id"]) != t:
            raise HTTPException(status_code=404, detail="store_not_found")
    if not store_row["accepting_orders"]:
        raise HTTPException(status_code=403, detail="store_closed")

    categories = db.execute(
        text(
            """
            SELECT id, name, sort_order
            FROM menu_categories
            WHERE store_id = :store_id
            ORDER BY sort_order ASC, name ASC
            """
        ),
        {"store_id": store_row["id"]},
    ).mappings().all()

    items = db.execute(
        text(
            """
            SELECT
              mi.id,
              mi.category_id,
              mi.name,
              mi.description,
              mi.image_url,
              mi.price_cents,
              mi.is_available,
              mi.sort_order
            FROM menu_items mi
            WHERE mi.category_id IN (
              SELECT id FROM menu_categories WHERE store_id = :store_id
            )
              AND mi.is_available = true
              AND (mi.stock_qty IS NULL OR mi.stock_qty > 0)
            ORDER BY mi.sort_order ASC, mi.name ASC
            """
        ),
        {"store_id": store_row["id"]},
    ).mappings().all()

    groups = db.execute(
        text(
            """
            SELECT
              mg.id,
              mg.menu_item_id,
              mg.name,
              mg.min_select,
              mg.max_select,
              mg.sort_order
            FROM modifier_groups mg
            WHERE mg.menu_item_id IN (
              SELECT mi.id FROM menu_items mi
              WHERE mi.category_id IN (
                SELECT id FROM menu_categories WHERE store_id = :store_id
              )
            )
            ORDER BY mg.sort_order ASC, mg.name ASC
            """
        ),
        {"store_id": store_row["id"]},
    ).mappings().all()

    options = db.execute(
        text(
            """
            SELECT
              mo.id,
              mo.group_id,
              mo.name,
              mo.price_delta_cents,
              mo.sort_order
            FROM modifier_options mo
            WHERE mo.group_id IN (
              SELECT mg.id FROM modifier_groups mg
              WHERE mg.menu_item_id IN (
                SELECT mi.id FROM menu_items mi
                WHERE mi.category_id IN (
                  SELECT id FROM menu_categories WHERE store_id = :store_id
                )
              )
            )
            ORDER BY mo.sort_order ASC, mo.name ASC
            """
        ),
        {"store_id": store_row["id"]},
    ).mappings().all()

    options_by_group: dict[str, list[dict]] = defaultdict(list)
    for o in options:
        options_by_group[str(o["group_id"])].append(
            {
                "id": str(o["id"]),
                "name": o["name"],
                "price_delta_cents": o["price_delta_cents"],
            }
        )

    groups_by_item: dict[str, list[dict]] = defaultdict(list)
    for g in groups:
        groups_by_item[str(g["menu_item_id"])].append(
            {
                "id": str(g["id"]),
                "name": g["name"],
                "min_select": g["min_select"],
                "max_select": g["max_select"],
                "options": options_by_group.get(str(g["id"]), []),
            }
        )

    items_by_category: dict[str, list[dict]] = defaultdict(list)
    for it in items:
        items_by_category[str(it["category_id"])].append(
            {
                "id": str(it["id"]),
                "name": it["name"],
                "description": it["description"],
                "image_url": it["image_url"],
                "price_cents": it["price_cents"],
                "is_available": it["is_available"],
                "modifier_groups": groups_by_item.get(str(it["id"]), []),
            }
        )

    return {
        "store": {"id": str(store_row["id"]), "slug": store_row["slug"], "name": store_row["name"]},
        "categories": [
            {
                "id": str(c["id"]),
                "name": c["name"],
                "items": items_by_category.get(str(c["id"]), []),
            }
            for c in categories
        ],
    }

