"""
食材分類 API 路由
提供分類資料的查詢功能。
統一透過 DBQueryModule 存取資料庫。
"""

from fastapi import APIRouter, HTTPException
from schemas.category import CategoryResponse
from services.db_query_module import DBQueryModule
from typing import List

router = APIRouter(
    prefix="/api/v1/categories",
    tags=["Categories 食材分類"]
)


@router.get("", response_model=List[CategoryResponse])
def get_categories():
    """
    取得所有食材分類
    對應報告 3-2-2：GET 查詢操作
    """
    query_module = DBQueryModule()
    return query_module.query_all_categories()


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int):
    """取得單一分類"""
    query_module = DBQueryModule()
    item = query_module.query_category_by_id(category_id)
    if not item:
        raise HTTPException(status_code=404, detail="Category not found")
    return item
