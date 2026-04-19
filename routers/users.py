"""
使用者 API 路由
提供使用者資料的查詢功能。
對應資料庫 users 資料表。
"""

from fastapi import APIRouter, HTTPException
from schemas.user import UserResponse, UserCreate
from services.db_query_module import DBQueryModule
from database import get_db
from typing import List
import uuid

router = APIRouter(
    prefix="/api/v1/users",
    tags=["Users 使用者"]
)


@router.get("", response_model=List[UserResponse])
def get_users():
    """取得所有使用者"""
    query_module = DBQueryModule()
    return query_module.query_all_users()


@router.post("", response_model=UserResponse, status_code=201)
def create_user(data: UserCreate):
    """
    建立使用者（暫時版，不與 Supabase Auth 連動）
    之後改為真正的註冊/登入流程。
    """
    db = get_db()
    new_id = str(uuid.uuid4())
    result = db.table("users").insert({"user_id": new_id, "username": data.username}).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create user")
    return result.data[0]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: str):
    """取得單一使用者"""
    query_module = DBQueryModule()
    user = query_module.query_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
