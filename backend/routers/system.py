"""
系統控制 API 路由
對應報告 3-3-1：狀態控制與輸入處理（FSM 有限狀態機）

系統狀態：
  - sleep: 休眠模式（預設）
  - active: 喚醒模式（門感測器觸發）
"""

from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field
from services.expiry_module import ExpiryModule

class RecognizeRequest(BaseModel):
    image_base64: str

class Top5Item(BaseModel):
    label: str
    confidence: float

class RecognizeResponse(BaseModel):
    label: Optional[str] = None
    confidence: Optional[float] = None
    low_confidence: bool
    validated: bool
    closest_class: str
    similarity_score: float
    top5: List[Top5Item]

router = APIRouter(
    prefix="/api/v1/system",
    tags=["系統控制"]
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
@router.post("/recognize", response_model=RecognizeResponse)
def recognize_food(request: RecognizeRequest):
    """
    影像辨識 API
    對應報告 3-2-1：前端 -> 辨識模組 (Recognition API)
    
    支援組長提供的兩種最新回傳格式：
    1. 成功辨識 (Validated / High Confidence)
    2. 信心不足 (Low Confidence)，但提供 closest_class 及 top5 候選
    
    為了方便前端測試，利用 image_base64 的字串長度奇偶數來模擬兩種不同情境：
    - 長度為偶數：回傳「成功辨識 (Validated / High Confidence)」
    - 長度為奇數：回傳「信心不足 (Low Confidence)」
    """
    is_even = len(request.image_base64) % 2 == 0

    if is_even:
        # 成功辨識（高信心度）
        return RecognizeResponse(
            label="雞蛋",
            confidence=0.893653,
            low_confidence=False,
            validated=True,
            closest_class="雞蛋",
            similarity_score=0.893653,
            top5=[
                Top5Item(label="雞蛋", confidence=0.893653),
                Top5Item(label="皮蛋", confidence=0.6126),
                Top5Item(label="鵪鶉蛋", confidence=0.564489),
                Top5Item(label="茶葉蛋", confidence=0.510663),
                Top5Item(label="溫泉蛋", confidence=0.477136)
            ]
        )
    else:
        # 信心不足（低信心度）
        return RecognizeResponse(
            label=None,
            confidence=None,
            low_confidence=True,
            validated=False,
            closest_class="香蕉",
            similarity_score=0.691783,
            top5=[
                Top5Item(label="香蕉", confidence=0.691783),
                Top5Item(label="芭蕉", confidence=0.589211),
                Top5Item(label="鳳梨", confidence=0.313795),
                Top5Item(label="芒果", confidence=0.312855),
                Top5Item(label="起司", confidence=0.303018)
            ]
        )
