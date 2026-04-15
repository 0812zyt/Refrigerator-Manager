"""
系統控制 API 路由
對應報告 3-3-1：狀態控制與輸入處理（FSM 有限狀態機）

系統狀態：
  - sleep: 休眠模式（預設）
  - active: 喚醒模式（門感測器觸發）
"""

from fastapi import APIRouter
from pydantic import BaseModel
from services.expiry_module import ExpiryModule

class RecognizeRequest(BaseModel):
    image_base64: str

class BarcodeRequest(BaseModel):
    barcode: str

router = APIRouter(
    prefix="/api/v1/system",
    tags=["System 系統控制"]
)

# 報告 3-3-1: 系統狀態（FSM 有限狀態機）
system_state = {"status": "sleep"}


def get_system_state() -> dict:
    """取得系統狀態（供其他模組使用）"""
    return system_state


def is_system_active() -> bool:
    """檢查系統是否處於 active 狀態"""
    return system_state["status"] == "active"


@router.post("/wake")
def wake_system():
    """
    喚醒系統
    對應報告 3-3-1：當門感測器偵測開啟訊號，發送此 API 喚醒後端。
    後端隨即建立資料庫連線池並載入快取。
    """
    system_state["status"] = "active"
    return {
        "status": "active",
        "message": "系統已喚醒，資料庫連線就緒"
    }


@router.post("/sleep")
def sleep_system():
    """
    系統進入休眠
    對應報告 3-3-1：系統預設為休眠模式。
    """
    system_state["status"] = "sleep"
    return {
        "status": "sleep",
        "message": "系統已進入休眠模式"
    }


@router.get("/status")
def get_system_status():
    """取得目前系統狀態"""
    return system_state


@router.post("/scan-expiry")
def manual_scan_expiry():
    """
    手動觸發到期掃描（用於測試）
    正式環境由 APScheduler 每日凌晨自動執行（報告 3-4-1）。
    """
    expiry = ExpiryModule()
    result = expiry.scan_and_update()
    return result


# ----------------------------------------------------------------
# 影像辨識相關端點
# ----------------------------------------------------------------
@router.post("/recognize")
def recognize_food(request: RecognizeRequest):
    """
    影像辨識 API
    對應報告 3-2-1：前端 -> 辨識模組 (Recognition API)

    TODO: ❹ 需與負責 AI/辨識模組的同學確認以下事項後才能實作：
      1. 影像辨識模組是獨立的服務還是整合在同一個 FastAPI 後端？
      2. 辨識模組的 API 格式（URL、Request/Response 格式）
      3. 回傳 JSON 格式的實際範例（Label、Confidence Score、邊框座標）

    報告描述的流程：
      - 前端將影像幀進行 Base64 編碼，封裝於 HTTP POST 請求
      - 辨識模組使用 NoisyViT 模型進行推論
      - 回傳食材標籤、信心分數及邊框座標
      - 信心門檻設定為 0.85
    """
    return {
        "status": "NOT_IMPLEMENTED",
        "message": "影像辨識功能尚未實作，需先與 AI 模組同學確認接口規格"
    }


# ----------------------------------------------------------------
# 條碼掃描相關端點
# ----------------------------------------------------------------
@router.post("/barcode")
def barcode_lookup(request: BarcodeRequest):
    """
    條碼查詢 API
    對應報告 3-3-1：Barcode 輸入視為精確查詢

    TODO: ❻ 需與資料庫及硬體同學確認：
      1. ingredients 表是否需要新增 barcode 欄位
      2. 條碼對應食材的資料從何而來
    """
    return {
        "status": "NOT_IMPLEMENTED",
        "message": "條碼查詢功能尚未實作，需先確認資料庫是否有 barcode 欄位"
    }
