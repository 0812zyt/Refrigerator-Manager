"""
使用者庫存 API 路由
提供庫存的 CRUD 操作，為系統最核心的 API。
對應報告 3-2-2 API 規範及 3-3-2 資料查詢與寫入流程。
"""

from fastapi import APIRouter, HTTPException, Query
from schemas.inventory import InventoryCreate, InventoryUpdate, InventoryResponse
from services.db_update_module import DBUpdateModule
from services.db_query_module import DBQueryModule
from typing import List, Optional

router = APIRouter(
    prefix="/api/v1/inventory",
    tags=["Inventory 庫存管理"]
)


# ----------------------------------------------------------------
# GET - 查詢庫存
# ----------------------------------------------------------------
@router.get("", response_model=List[InventoryResponse])
def get_inventory(
    user_id: Optional[str] = Query(None, description="依使用者篩選")
):
    """
    取得庫存列表
    可依 user_id 篩選特定使用者的庫存。

    TODO: ❷ 待確認使用者驗證機制後，user_id 應從 Token 中解析，
          而非由前端手動傳入。
    """
    query_module = DBQueryModule()
    data = query_module.query_inventory_all(user_id)
    return data


@router.get("/search")
def search_inventory(
    user_id: str = Query(..., description="使用者 ID"),
    keyword: str = Query(..., description="搜尋關鍵字")
):
    """
    搜尋使用者庫存中的食材
    對應報告 3-3-2 A：先查主庫，查無再查範本庫。
    """
    query_module = DBQueryModule()

    # A.2: 主庫查詢
    inventory_results = query_module.search_inventory(user_id, keyword)
    if inventory_results:
        return {
            "source": "inventory",
            "data": inventory_results
        }

    # A.3: 備用庫（範本）查詢
    template_results = query_module.query_template(keyword)
    if template_results:
        return {
            "source": "template",
            "message": "庫存中查無此食材，以下為範本建議",
            "data": template_results
        }

    # 查無結果，提示手動輸入
    raise HTTPException(
        status_code=404,
        detail="查無符合的食材，請手動輸入食材資訊"
    )


@router.get("/{inventory_id}", response_model=InventoryResponse)
def get_inventory_item(inventory_id: int):
    """取得單一庫存項目"""
    query_module = DBQueryModule()
    item = query_module.query_inventory_by_id(inventory_id)
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return item


# ----------------------------------------------------------------
# POST - 新增庫存
# ----------------------------------------------------------------
@router.post("", response_model=InventoryResponse, status_code=201)
def create_inventory(item: InventoryCreate):
    """
    新增庫存項目（食材放入冰箱）
    對應報告 3-3-2 B：資料更新與寫入邏輯

    自動處理：
    - 若未提供 added_date，自動填入今天日期
    - 若 custom_expire=False 且未提供 expire_date，
      自動以 added_date + default_expire_days 計算到期日
    """
    update_module = DBUpdateModule()
    result = update_module.create_inventory(item.model_dump())

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create inventory item")

    return result.data[0]


# ----------------------------------------------------------------
# PUT - 修改庫存
# ----------------------------------------------------------------
@router.put("/{inventory_id}", response_model=InventoryResponse)
def update_inventory(inventory_id: int, item: InventoryUpdate):
    """
    修改庫存項目（如修改數量、更新效期）
    對應報告 3-2-2：PUT 修改操作
    """
    # 檢查是否存在
    query_module = DBQueryModule()
    existing = query_module.query_inventory_by_id(inventory_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    update_module = DBUpdateModule()
    result = update_module.update_inventory(inventory_id, item.model_dump(exclude_none=True))

    # update_inventory 回傳 None 代表沒有欄位可更新
    if result is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update inventory item")

    return result.data[0]


# ----------------------------------------------------------------
# DELETE - 刪除庫存
# ----------------------------------------------------------------
@router.delete("/{inventory_id}")
def delete_inventory(inventory_id: int):
    """
    刪除庫存項目
    對應報告 3-2-2：DELETE 刪除操作
    """
    # 檢查是否存在
    query_module = DBQueryModule()
    existing = query_module.query_inventory_by_id(inventory_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    update_module = DBUpdateModule()
    update_module.delete_inventory(inventory_id)

    return {"message": "Inventory item deleted successfully"}
