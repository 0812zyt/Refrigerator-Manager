"""
使用者 Schema
對應資料庫 users 資料表。
"""

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    """使用者回應格式"""
    model_config = ConfigDict(extra="ignore")  # 忽略 Supabase 回傳的多餘欄位

    user_id: int
    name: str
