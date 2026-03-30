from __future__ import annotations

import uuid

from sqlalchemy import create_engine, text

from app.config import get_settings


def _uuid() -> str:
    return str(uuid.uuid4())


def main() -> None:
    settings = get_settings()
    engine = create_engine(settings.database_url, pool_pre_ping=True)

    store_id = _uuid()
    coffee_cat_id = _uuid()
    food_cat_id = _uuid()

    cappuccino_id = _uuid()
    latte_id = _uuid()
    croissant_id = _uuid()

    milk_group_id = _uuid()
    milk_cow_id = _uuid()
    milk_oat_id = _uuid()

    syrup_group_id = _uuid()
    syrup_vanilla_id = _uuid()
    syrup_caramel_id = _uuid()

    latte_milk_group_id = _uuid()
    latte_milk_cow_id = _uuid()
    latte_milk_oat_id = _uuid()

    latte_syrup_group_id = _uuid()
    latte_syrup_vanilla_id = _uuid()
    latte_syrup_caramel_id = _uuid()

    with engine.begin() as conn:
        # Store
        conn.execute(
            text(
                """
                INSERT INTO stores (id, slug, name, timezone, accepting_orders)
                VALUES (:id, :slug, :name, :tz, true)
                ON CONFLICT (slug) DO UPDATE
                  SET name = EXCLUDED.name,
                      timezone = EXCLUDED.timezone,
                      accepting_orders = true
                RETURNING id
                """
            ),
            {"id": store_id, "slug": "demo", "name": "Coffee Stop", "tz": "Europe/Moscow"},
        )
        store_id = conn.execute(text("SELECT id FROM stores WHERE slug='demo'")).scalar_one()

        # Categories
        conn.execute(
            text(
                """
                INSERT INTO menu_categories (id, store_id, sort_order, name)
                VALUES
                  (:c1, :store, 10, 'Напитки'),
                  (:c2, :store, 20, 'Еда')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"c1": coffee_cat_id, "c2": food_cat_id, "store": store_id},
        )

        # Items
        conn.execute(
            text(
                """
                INSERT INTO menu_items (id, category_id, name, description, image_url, price_cents, is_available, sort_order)
                VALUES
                  (:i1, :c1, 'Капучино', 'Эспрессо + молоко', 'https://picsum.photos/seed/cappuccino/512/512', 19900, true, 10),
                  (:i2, :c1, 'Латте', 'Мягкий кофе с молоком', 'https://picsum.photos/seed/latte/512/512', 21900, true, 20),
                  (:i3, :c2, 'Круассан', 'Сливочный, свежий', 'https://picsum.photos/seed/croissant/512/512', 15900, true, 10)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"i1": cappuccino_id, "i2": latte_id, "i3": croissant_id, "c1": coffee_cat_id, "c2": food_cat_id},
        )

        # Modifier groups (for coffee items)
        conn.execute(
            text(
                """
                INSERT INTO modifier_groups (id, menu_item_id, name, min_select, max_select, sort_order)
                VALUES
                  (:mg1, :cap, 'Молоко', 1, 1, 10),
                  (:mg2, :cap, 'Сироп', 0, 1, 20),
                  (:mg3, :lat, 'Молоко', 1, 1, 10),
                  (:mg4, :lat, 'Сироп', 0, 1, 20)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "mg1": milk_group_id,
                "mg2": syrup_group_id,
                "mg3": latte_milk_group_id,
                "mg4": latte_syrup_group_id,
                "cap": cappuccino_id,
                "lat": latte_id,
            },
        )

        # Options for cappuccino + latte groups.
        conn.execute(
            text(
                """
                INSERT INTO modifier_options (id, group_id, name, price_delta_cents, sort_order)
                VALUES
                  (:o1, :g1, 'Коровье', 0, 10),
                  (:o2, :g1, 'Овсяное', 4000, 20),
                  (:o3, :g2, 'Ваниль', 3000, 10),
                  (:o4, :g2, 'Карамель', 3000, 20),
                  (:o5, :g3, 'Коровье', 0, 10),
                  (:o6, :g3, 'Овсяное', 4000, 20),
                  (:o7, :g4, 'Ваниль', 3000, 10),
                  (:o8, :g4, 'Карамель', 3000, 20)
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {
                "o1": milk_cow_id,
                "o2": milk_oat_id,
                "o3": syrup_vanilla_id,
                "o4": syrup_caramel_id,
                "g1": milk_group_id,
                "g2": syrup_group_id,
                "o5": latte_milk_cow_id,
                "o6": latte_milk_oat_id,
                "o7": latte_syrup_vanilla_id,
                "o8": latte_syrup_caramel_id,
                "g3": latte_milk_group_id,
                "g4": latte_syrup_group_id,
            },
        )

    print("Seed complete. Store slug=demo")


if __name__ == "__main__":
    main()

