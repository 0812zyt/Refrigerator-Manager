"""
食材範本 API 路由
提供食材範本（Template Library）的查詢與搜尋功能。
對應報告 3-3-2 A.3：備用庫查詢。
"""

from fastapi import APIRouter, HTTPException, Query
from database import get_db
from schemas.ingredient import IngredientResponse, IngredientCreate
from services.db_query_module import DBQueryModule
from typing import List, Optional

router = APIRouter(
    prefix="/api/v1/ingredients",
    tags=["Ingredients 食材範本"]
)


@router.get("", response_model=List[IngredientResponse])
def get_ingredients(category_id: Optional[int] = Query(None, description="依分類篩選")):
    """
    取得食材範本列表
    可選擇依 category_id 篩選特定分類的食材。
    """
    query_module = DBQueryModule()
    return query_module.query_all_ingredients(category_id)


@router.post("", response_model=IngredientResponse, status_code=201)
def create_ingredient(data: IngredientCreate):
    """新增自訂食材範本（找不到現有食材時使用）"""
    db = get_db()
    result = db.table("ingredients").insert(data.model_dump(exclude_none=True)).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create ingredient")
    return result.data[0]


# 注意：/search/{keyword} 必須定義在 /{ingredient_id} 之前，否則 "search" 會被當成 ID 解析導致 422 錯誤
@router.get("/search/{keyword}")
def search_ingredients(keyword: str):
    """
    搜尋食材範本（模糊比對）
    對應報告 3-3-2 A.3：備用庫查詢
    若查無則回傳 404，提示使用者手動輸入。
    """
    query_module = DBQueryModule()
    result = query_module.query_template(keyword)
    if not result:
        raise HTTPException(
            status_code=404,
            detail="查無符合的食材範本，請手動輸入食材資訊"
        )
    return result


@router.get("/{ingredient_id}", response_model=IngredientResponse)
def get_ingredient(ingredient_id: int):
    """取得單一食材範本"""
    query_module = DBQueryModule()
    item = query_module.query_ingredient_by_id(ingredient_id)
    if not item:
        raise HTTPException(status_code=404, detail="Ingredient not found")
    return item
