"""
Web Push 推播通知 API
提供 VAPID 公鑰查詢、訂閱登錄與取消訂閱。
"""

from fastapi import APIRouter
from pydantic import BaseModel
from database import get_db
from config import VAPID_PUBLIC_KEY

router = APIRouter(prefix="/api/v1/push", tags=["Push 推播通知"])


class SubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class SubscriptionBody(BaseModel):
    user_id: str
    endpoint: str
    keys: SubscriptionKeys


@router.get("/vapid-key")
def get_vapid_key():
    """回傳 VAPID 公鑰，前端訂閱時需要"""
    return {"public_key": VAPID_PUBLIC_KEY}


@router.post("/subscribe", status_code=201)
def subscribe(body: SubscriptionBody):
    """儲存使用者的 Push 訂閱資訊（endpoint + 金鑰）"""
    db = get_db()
    db.table("push_subscriptions").upsert(
        {
            "user_id": body.user_id,
            "endpoint": body.endpoint,
            "p256dh": body.keys.p256dh,
            "auth": body.keys.auth,
        },
        on_conflict="endpoint",
    ).execute()
    return {"status": "subscribed"}


@router.delete("/unsubscribe")
def unsubscribe(endpoint: str):
    """移除指定 endpoint 的訂閱"""
    db = get_db()
    db.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()
    return {"status": "unsubscribed"}
