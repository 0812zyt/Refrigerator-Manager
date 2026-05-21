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

router = APIRouter(
    prefix="/api/v1/system",
    tags=["System 系統控制"]
)

# 報告 3-3-1: 系統狀態（保留相容性，不再阻塞後端）
system_state = {"status": "active"}


def get_system_state() -> dict:
    """取得系統狀態"""
    return system_state


def is_system_active() -> bool:
    """始終返回 True，避免阻塞任何請求"""
    return True


@router.post("/wake")
def wake_system():
    """
    喚醒系統（相容性端點）
    當門感測器偵測開啟訊號，Raspberry Pi 可呼叫此端點確認後端連線正常。
    """
    return {
        "status": "active",
        "message": "裝置喚醒成功（後端已就緒）"
    }


@router.post("/sleep")
def sleep_system():
    """
    系統進入休眠（相容性端點）
    當門感測器偵測關閉訊號，Raspberry Pi 可呼叫此端點。
    """
    return {
        "status": "sleep",
        "message": "裝置進入休眠（後端持續運作中）"
    }


@router.get("/status")
def get_system_status():
    """取得目前系統狀態"""
    return {
        "status": "active",
        "message": "後端服務正常運行中（無狀態模式）"
    }


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
    """

    # TODO: 真正實作時，這裡會把 request.image_base64 送給影像辨識模組
    # 這裡先套用組長給的回傳格式進行 Mock
    mock_response = {"label": "番茄", "confidence": 0.92}
    
    # 報告 3-5-4：信心門檻機制，初步設定為 0.85
    if mock_response["confidence"] >= 0.85:
        return {
            "status": "success",
            "message": "辨識成功",
            "data": mock_response
        }
    else:
        return {
            "status": "fail",
            "message": "辨識信心度不足，請手動輸入",
            "data": mock_response
        }



