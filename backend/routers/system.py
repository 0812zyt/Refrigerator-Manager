"""
系統控制 API 路由
對應報告 3-3-1：狀態控制與輸入處理（FSM 有限狀態機）

系統狀態：
  - sleep: 休眠模式（預設）
  - active: 喚醒模式（門感測器觸發）
"""

import base64
import httpx
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field
from services.expiry_module import ExpiryModule
import config

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
    closest_class: Optional[str] = None
    similarity_score: Optional[float] = None
    top5: List[Top5Item]

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
# 影像辨識相關端點 (含組長 API 轉發與 Fallback 機制)
# ----------------------------------------------------------------
class SetUrlRequest(BaseModel):
    url: str

@router.post("/set-recognition-url")
def set_recognition_url(body: SetUrlRequest):
    """
    動態更新影像辨識 API 網址
    當組長在本機重新啟動 ngrok 時，會產生新的 URL。前端或開發者可以透過此 API 
    更新後端所指向的辨識伺服器網址，免去修改環境變數和重啟 Render 的等待時間。
    """
    config.set_recognition_api_url(body.url)
    return {
        "status": "success",
        "current_url": config.get_recognition_api_url(),
        "message": "影像辨識 API 網址已成功動態更新！"
    }

@router.post("/recognize", response_model=RecognizeResponse)
def recognize_food(request: RecognizeRequest):
    """
    影像辨識 API
    對應報告 3-2-1：前端 -> 辨識模組 (Recognition API)
    
    具備轉發與降級功能：
    - 若設定了 RECOGNITION_API_URL，會將圖片二進位轉發至組長架設的辨識 API。
    - 若組長端未開啟、逾時或發生錯誤，將自動降級（Fallback）使用本機的模擬數據。
    """
    rec_api_url = config.get_recognition_api_url()
    if rec_api_url:
        try:
            # 1. 解碼前端傳遞過來的 base64 圖片，剔除 Data URL 前綴 (例如 data:image/jpeg;base64,)
            base64_str = request.image_base64
            if "," in base64_str:
                base64_str = base64_str.split(",", 1)[1]
            image_data = base64.b64decode(base64_str)
            
            # 2. 以 Multipart/form-data 格式包裝成 file 上傳
            files = {"file": ("image.jpg", image_data, "image/jpeg")}
            
            # 3. 發送 POST 請求至組長本機服務，限時 15 秒避免卡死後端
            with httpx.Client(timeout=15.0) as client:
                response = client.post(rec_api_url, files=files)
                if response.status_code == 200:
                    data = response.json()
                    
                    # 確保將資料對應回後端的 Pydantic Response 格式
                    return RecognizeResponse(
                        label=data.get("label"),
                        confidence=data.get("confidence"),
                        low_confidence=data.get("low_confidence", False),
                        validated=data.get("validated", False),
                        closest_class=data.get("closest_class"),
                        similarity_score=data.get("similarity_score"),
                        top5=[
                            Top5Item(label=cand.get("label"), confidence=cand.get("confidence"))
                            for cand in data.get("top5", [])
                        ]
                    )
                else:
                    print(f"[RECOGNITION WARNING] 影像辨識伺服器回傳狀態碼: {response.status_code}")
        except Exception as e:
            # 當連線失敗、超時、格式異常時，記錄警告並啟動 Fallback 降級處理
            print(f"[RECOGNITION WARNING] 無法連接至辨識 API，已啟動自動降級模擬備援邏輯: {e}")

    # ----------------------------------------------------------------
    # 自動降級 / 模擬數據 (原有的 Mock 邏輯，保留做為備援)
    # ----------------------------------------------------------------
    is_even = len(request.image_base64) % 2 == 0

    if is_even:
        # 成功辨識 (High Confidence)
        return RecognizeResponse(
            label="tacos",
            confidence=0.893653,
            low_confidence=False,
            validated=True,
            closest_class="tacos",
            similarity_score=0.893653,
            top5=[
                Top5Item(label="tacos", confidence=0.893653),
                Top5Item(label="chicken_quesadilla", confidence=0.6126),
                Top5Item(label="nachos", confidence=0.564489),
                Top5Item(label="huevos_rancheros", confidence=0.510663),
                Top5Item(label="falafel", confidence=0.477136)
            ]
        )
    else:
        # 信心不足 (Low Confidence)
        return RecognizeResponse(
            label=None,
            confidence=None,
            low_confidence=True,
            validated=False,
            closest_class="Banana",
            similarity_score=0.691783,
            top5=[
                Top5Item(label="Banana", confidence=0.691783),
                Top5Item(label="Banana Lady Finger", confidence=0.589211),
                Top5Item(label="Pineapple", confidence=0.313795),
                Top5Item(label="churros", confidence=0.312855),
                Top5Item(label="cheese_plate", confidence=0.303018)
            ]
        )




