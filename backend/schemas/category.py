"""
食材分類 Schema
對應資料庫 categories 資料表。
"""

from pydantic import BaseModel, ConfigDict


class CategoryResponse(BaseModel):
    """分類回應格式"""
    model_config = ConfigDict(extra="ignore")  # 忽略 Supabase 回傳的多餘欄位

    category_id: int
    category_name: str
