"""
使用者 API 路由
提供使用者資料的查詢功能。
對應資料庫 users 資料表。
"""

from fastapi import APIRouter, HTTPException
from schemas.user import UserCreate, UserResponse
from services.db_query_module import DBQueryModule
from services.db_update_module import DBUpdateModule
from typing import List

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
def create_user(body: UserCreate):
    """建立新使用者"""
    update_module = DBUpdateModule()
    user = update_module.create_user(body.username)
    if not user:
        raise HTTPException(status_code=500, detail="建立使用者失敗")
    return user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: str):
    """取得單一使用者"""
    query_module = DBQueryModule()
    user = query_module.query_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
