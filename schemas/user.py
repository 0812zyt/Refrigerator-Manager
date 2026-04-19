"""
使用者 Schema
對應資料庫 users 資料表。
"""

from pydantic import BaseModel, ConfigDict


class UserResponse(BaseModel):
    """使用者回應格式"""
    model_config = ConfigDict(extra="ignore")

    user_id: str
    username: str


class UserCreate(BaseModel):
    """建立使用者請求（暫時不與 Supabase Auth 連動，之後再改）"""
    username: str
