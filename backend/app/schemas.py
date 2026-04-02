from __future__ import annotations

from pydantic import BaseModel, Field


class OrderLineIn(BaseModel):
    menu_item_id: str
    quantity: int = Field(ge=1, le=50)
    modifier_option_ids: list[str] = Field(default_factory=list)


class CreateOrderIn(BaseModel):
    guest_email: str | None = None
    lines: list[OrderLineIn]


class CheckoutOut(BaseModel):
    order_id: str
    status: str
    payment_url: str


class MenuEditorModifierOptionIn(BaseModel):
    id: str
    name: str
    price_delta_cents: int = Field(ge=0)
    sort_order: int = Field(ge=0)


class MenuEditorModifierGroupIn(BaseModel):
    id: str
    name: str
    min_select: int = Field(ge=0)
    max_select: int = Field(ge=0)
    sort_order: int = Field(ge=0)
    options: list[MenuEditorModifierOptionIn] = Field(default_factory=list)


class MenuEditorItemIn(BaseModel):
    id: str
    name: str
    description: str | None = None
    image_url: str | None = None
    price_cents: int = Field(ge=0)
    is_available: bool = True
    sort_order: int = Field(ge=0)
    stock_qty: int | None = Field(default=None, ge=0)
    # Значения параметров позиции (по ключам из schema категории), напр. {"volume_ml": 300}
    item_params: dict = Field(default_factory=dict)
    modifier_groups: list[MenuEditorModifierGroupIn] = Field(default_factory=list)


class MenuEditorCategoryIn(BaseModel):
    id: str
    name: str
    sort_order: int = Field(ge=0)
    # Схема параметров позиций в категории (список полей, формат на фронте).
    item_params_schema: list[dict] = Field(default_factory=list)
    items: list[MenuEditorItemIn] = Field(default_factory=list)


class MenuEditorPut(BaseModel):
    categories: list[MenuEditorCategoryIn] = Field(default_factory=list)

