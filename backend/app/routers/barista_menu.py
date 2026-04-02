from __future__ import annotations

from collections import defaultdict
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import MenuEditorPut

router = APIRouter(tags=["barista"])


def _store_exists(db: Session, store_id: str) -> bool:
    row = db.execute(text("SELECT 1 FROM stores WHERE id = :id"), {"id": store_id}).first()
    return row is not None


@router.get("/stores/{store_id}/menu-editor")
def get_menu_editor(store_id: str, db: Session = Depends(get_db)) -> dict:
    if not _store_exists(db, store_id):
        raise HTTPException(status_code=404, detail="store_not_found")

    store_row = db.execute(
        text("SELECT id, slug, name FROM stores WHERE id = :id"),
        {"id": store_id},
    ).mappings().first()

    categories = db.execute(
        text(
            """
            SELECT id, name, sort_order, item_params_schema
            FROM menu_categories
            WHERE store_id = :store_id
              AND (
                EXISTS (
                  SELECT 1
                  FROM menu_items mi
                  WHERE mi.category_id = menu_categories.id
                    AND mi.is_available = true
                )
                OR NOT EXISTS (
                  SELECT 1
                  FROM menu_items mi2
                  WHERE mi2.category_id = menu_categories.id
                )
              )
            ORDER BY sort_order ASC, name ASC
            """
        ),
        {"store_id": store_id},
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
              mi.sort_order,
              mi.stock_qty,
              mi.item_params
            FROM menu_items mi
            WHERE mi.category_id IN (
              SELECT id FROM menu_categories WHERE store_id = :store_id
            )
              AND mi.is_available = true
            ORDER BY mi.sort_order ASC, mi.name ASC
            """
        ),
        {"store_id": store_id},
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
        {"store_id": store_id},
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
        {"store_id": store_id},
    ).mappings().all()

    options_by_group: dict[str, list[dict]] = defaultdict(list)
    for o in options:
        options_by_group[str(o["group_id"])].append(
            {
                "id": str(o["id"]),
                "name": o["name"],
                "price_delta_cents": o["price_delta_cents"],
                "sort_order": o["sort_order"],
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
                "sort_order": g["sort_order"],
                "options": options_by_group.get(str(g["id"]), []),
            }
        )

    items_by_category: dict[str, list[dict]] = defaultdict(list)
    for it in items:
        sq = it["stock_qty"]
        items_by_category[str(it["category_id"])].append(
            {
                "id": str(it["id"]),
                "name": it["name"],
                "description": it["description"],
                "image_url": it["image_url"],
                "price_cents": it["price_cents"],
                "is_available": it["is_available"],
                "sort_order": it["sort_order"],
                "stock_qty": int(sq) if sq is not None else None,
                "item_params": it.get("item_params") or {},
                "modifier_groups": groups_by_item.get(str(it["id"]), []),
            }
        )

    return {
        "store": {"id": str(store_row["id"]), "slug": store_row["slug"], "name": store_row["name"]},
        "categories": [
            {
                "id": str(c["id"]),
                "name": c["name"],
                "sort_order": c["sort_order"],
                "item_params_schema": c.get("item_params_schema") or [],
                "items": items_by_category.get(str(c["id"]), []),
            }
            for c in categories
        ],
    }


@router.put("/stores/{store_id}/menu-editor")
def put_menu_editor(store_id: str, payload: MenuEditorPut, db: Session = Depends(get_db)) -> dict:
    if not _store_exists(db, store_id):
        raise HTTPException(status_code=404, detail="store_not_found")

    payload_category_ids: list[str] = []
    payload_item_ids: list[str] = []
    for cat in payload.categories:
        payload_category_ids.append(cat.id)
        for it in cat.items:
            payload_item_ids.append(it.id)
            for g in it.modifier_groups:
                if g.max_select < g.min_select:
                    raise HTTPException(status_code=400, detail="invalid_modifier_group")

    # Позиции, которых нет в сохранённом дереве, скрываем (не удаляем — из-за order_lines).
    if payload_item_ids:
        placeholders = ", ".join(f":pid{i}" for i in range(len(payload_item_ids)))
        params: dict[str, Any] = {"store_id": store_id}
        params.update({f"pid{i}": v for i, v in enumerate(payload_item_ids)})
        db.execute(
            text(
                f"""
                UPDATE menu_items mi
                SET is_available = false
                FROM menu_categories mc
                WHERE mi.category_id = mc.id
                  AND mc.store_id = :store_id
                  AND mi.id NOT IN ({placeholders})
                """
            ),
            params,
        )
    else:
        db.execute(
            text(
                """
                UPDATE menu_items mi
                SET is_available = false
                FROM menu_categories mc
                WHERE mi.category_id = mc.id AND mc.store_id = :store_id
                """
            ),
            {"store_id": store_id},
        )

    for cat in payload.categories:
        existing = db.execute(
            text("SELECT store_id FROM menu_categories WHERE id = :id"),
            {"id": cat.id},
        ).first()
        if existing is not None and str(existing[0]) != store_id:
            raise HTTPException(status_code=400, detail="category_store_mismatch")

        db.execute(
            text(
                """
                INSERT INTO menu_categories (id, store_id, sort_order, name, item_params_schema)
                VALUES (:id, :store_id, :sort_order, :name, CAST(:item_params_schema AS jsonb))
                ON CONFLICT (id) DO UPDATE SET
                  store_id = EXCLUDED.store_id,
                  sort_order = EXCLUDED.sort_order,
                  name = EXCLUDED.name,
                  item_params_schema = EXCLUDED.item_params_schema
                """
            ),
            {
                "id": cat.id,
                "store_id": store_id,
                "sort_order": cat.sort_order,
                "name": cat.name,
                "item_params_schema": json.dumps(cat.item_params_schema or []),
            },
        )

        for it in cat.items:
            existing_item = db.execute(
                text(
                    """
                    SELECT mc.store_id
                    FROM menu_items mi
                    JOIN menu_categories mc ON mc.id = mi.category_id
                    WHERE mi.id = :id
                    """
                ),
                {"id": it.id},
            ).first()
            if existing_item is not None and str(existing_item[0]) != store_id:
                raise HTTPException(status_code=400, detail="menu_item_store_mismatch")

            db.execute(
                text(
                    """
                    INSERT INTO menu_items (
                      id, category_id, name, description, image_url,
                      price_cents, is_available, sort_order, stock_qty, item_params
                    )
                    VALUES (
                      :id, :category_id, :name, :description, :image_url,
                      :price_cents, :is_available, :sort_order, :stock_qty, CAST(:item_params AS jsonb)
                    )
                    ON CONFLICT (id) DO UPDATE SET
                      category_id = EXCLUDED.category_id,
                      name = EXCLUDED.name,
                      description = EXCLUDED.description,
                      image_url = EXCLUDED.image_url,
                      price_cents = EXCLUDED.price_cents,
                      is_available = EXCLUDED.is_available,
                      sort_order = EXCLUDED.sort_order,
                      stock_qty = EXCLUDED.stock_qty,
                      item_params = EXCLUDED.item_params
                    """
                ),
                {
                    "id": it.id,
                    "category_id": cat.id,
                    "name": it.name,
                    "description": it.description,
                    "image_url": it.image_url if it.image_url else None,
                    "price_cents": it.price_cents,
                    "is_available": it.is_available,
                    "sort_order": it.sort_order,
                    "stock_qty": it.stock_qty,
                    "item_params": json.dumps(it.item_params or {}),
                },
            )

            db.execute(
                text("DELETE FROM modifier_groups WHERE menu_item_id = :mid"),
                {"mid": it.id},
            )

            for g in it.modifier_groups:
                db.execute(
                    text(
                        """
                        INSERT INTO modifier_groups (id, menu_item_id, name, min_select, max_select, sort_order)
                        VALUES (:id, :menu_item_id, :name, :min_select, :max_select, :sort_order)
                        """
                    ),
                    {
                        "id": g.id,
                        "menu_item_id": it.id,
                        "name": g.name,
                        "min_select": g.min_select,
                        "max_select": g.max_select,
                        "sort_order": g.sort_order,
                    },
                )
                for o in g.options:
                    db.execute(
                        text(
                            """
                            INSERT INTO modifier_options (id, group_id, name, price_delta_cents, sort_order)
                            VALUES (:id, :group_id, :name, :price_delta_cents, :sort_order)
                            """
                        ),
                        {
                            "id": o.id,
                            "group_id": g.id,
                            "name": o.name,
                            "price_delta_cents": o.price_delta_cents,
                            "sort_order": o.sort_order,
                        },
                    )

    # Удаляем пустые категории, которые отсутствуют в сохраненном дереве.
    if payload_category_ids:
        cat_placeholders = ", ".join(f":cid{i}" for i in range(len(payload_category_ids)))
        cat_params: dict[str, Any] = {"store_id": store_id}
        cat_params.update({f"cid{i}": v for i, v in enumerate(payload_category_ids)})
        db.execute(
            text(
                f"""
                DELETE FROM menu_categories mc
                WHERE mc.store_id = :store_id
                  AND mc.id NOT IN ({cat_placeholders})
                  AND NOT EXISTS (
                    SELECT 1 FROM menu_items mi WHERE mi.category_id = mc.id
                  )
                """
            ),
            cat_params,
        )
    else:
        db.execute(
            text(
                """
                DELETE FROM menu_categories mc
                WHERE mc.store_id = :store_id
                  AND NOT EXISTS (
                    SELECT 1 FROM menu_items mi WHERE mi.category_id = mc.id
                  )
                """
            ),
            {"store_id": store_id},
        )

    db.commit()
    return {"ok": True}
