"""
使用者庫存 Schema
對應資料庫 user_inventory 資料表。
涵蓋新增、修改、回應三種格式，符合報告 3-2-2 之 Pydantic Schema 規範。
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date


class InventoryCreate(BaseModel):
    """
    新增庫存請求格式
    對應報告 3-3-2 B: 資料更新與寫入邏輯

    - added_date: 若未提供，後端自動填入今天日期
    - expire_date: 若未提供且 custom_expire=False，
                   後端自動以 added_date + default_expire_days 計算
    - custom_expire: 是否為使用者自訂到期日
    """
    user_id: int
    ingredient_id: int
    quantity: int = 1
    added_date: Optional[date] = None
    expire_date: Optional[date] = None
    custom_expire: bool = False


class InventoryUpdate(BaseModel):
    """
    修改庫存請求格式
    只需傳入要修改的欄位即可。
    """
    quantity: Optional[int] = None
    expire_date: Optional[date] = None
    custom_expire: Optional[bool] = None


class InventoryResponse(BaseModel):
    """庫存回應格式"""
    model_config = ConfigDict(extra="ignore")  # 忽略 Supabase 回傳的多餘欄位

    inventory_id: int
    user_id: int
    ingredient_id: int
    ingredient_name: Optional[str] = None
    quantity: int
    added_date: date
    expire_date: date
    custom_expire: bool
    urgent_flag: bool
