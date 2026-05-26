"""
使用者 Schema
對應資料庫 users 資料表。
"""

from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    """建立使用者的請求格式"""
    username: str
    user_id: str | None = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "username": "TestUser"
            }
        }
    }


class UserResponse(BaseModel):
    """使用者回應格式"""
    model_config = ConfigDict(extra="ignore")  # 忽略 Supabase 回傳的多餘欄位

    user_id: str
    username: str
