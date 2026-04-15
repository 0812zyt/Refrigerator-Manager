"""
食材範本 Schema
對應資料庫 ingredients 資料表。
報告 3-3-2 A.3 所述之「範本資料庫 (Template Library)」。
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional


class IngredientResponse(BaseModel):
    """食材範本回應格式"""
    model_config = ConfigDict(extra="ignore")  # 忽略 Supabase 回傳的多餘欄位

    ingredient_id: int
    name: str
    category_id: Optional[int] = None
    default_expire_days: Optional[int] = None
