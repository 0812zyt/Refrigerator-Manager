"""
系統控制 API 路由
系統控制與輸入處理（FSM 有限狀態機）

系統狀態：
  - sleep: 休眠模式（預設）
  - active: 喚醒模式（門感測器觸發）
"""

import base64
import httpx
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.expiry_module import ExpiryModule
import config

RECOGNIZE_API = "https://lecturer-smartness-drudge.ngrok-free.app/api/v1/recognize"

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


# 系統狀態控制（保留相容性，不再阻塞後端）
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
    正式環境由 APScheduler 每日凌晨自動執行。
    """
    expiry = ExpiryModule()
    result = expiry.scan_and_update()
    return result


# ----------------------------------------------------------------
# 影像辨識相關端點 (串接真實影像辨識服務，拒絕虛假模擬備援)
# ----------------------------------------------------------------

@router.post("/recognize", response_model=RecognizeResponse)
def recognize_food(request: RecognizeRequest):
    """
    影像辨識 API
    將前端傳遞的圖片 Base64 資料轉發至外部影像辨識伺服器進行辨識。
    若辨識伺服器未設定、斷線或發生錯誤，將回傳標準 HTTP 錯誤，拒絕任何模擬備援數據。
    """
    rec_api_url = config.get_recognition_api_url()
    if not rec_api_url:
        raise HTTPException(
            status_code=503,
            detail="影像辨識服務未設定，請確認環境變數 RECOGNITION_API_URL 是否配置妥當"
        )

    try:
        # 1. 解碼前端傳遞過來的 base64 圖片，剔除 Data URL 前綴 (例如 data:image/jpeg;base64,)
        base64_str = request.image_base64
        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]
        image_data = base64.b64decode(base64_str)
        
        # 2. 以 Multipart/form-data 格式包裝成 file 上傳
        files = {"file": ("image.jpg", image_data, "image/jpeg")}
        
        # 3. 發送 POST 請求至外部影像辨識服務，限時 15 秒避免卡死後端
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
                print(f"[RECOGNITION ERROR] 影像辨識伺服器回傳錯誤狀態碼: {response.status_code}")
                raise HTTPException(
                    status_code=502,
                    detail=f"影像辨識伺服器異常，回傳狀態碼: {response.status_code}"
                )
    except httpx.RequestError as e:
        print(f"[RECOGNITION ERROR] 連線至辨識服務失敗: {e}")
        raise HTTPException(
            status_code=502,
            detail="無法連線至影像辨識服務，請確認辨識伺服器已啟動且網路正常"
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        print(f"[RECOGNITION ERROR] 影像辨識處理異常: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"影像辨識處理失敗: {str(e)}"
        )




