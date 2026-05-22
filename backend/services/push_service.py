"""
Web Push 推播服務
使用 VAPID 協議透過瀏覽器 Push API 發送通知到使用者裝置。
"""

import json
import logging
from pywebpush import webpush, WebPushException
from config import VAPID_PRIVATE_KEY, VAPID_EMAIL

logger = logging.getLogger(__name__)


class PushService:
    def send(self, subscription_info: dict, title: str, body: str) -> bool:
        """
        發送單一 Web Push 通知。
        subscription_info 格式：{"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}}
        """
        if not VAPID_PRIVATE_KEY:
            logger.warning("[Push] VAPID_PRIVATE_KEY 未設定，跳過推播")
            return False
        try:
            webpush(
                subscription_info=subscription_info,
                data=json.dumps({"title": title, "body": body}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{VAPID_EMAIL}"},
            )
            return True
        except WebPushException as ex:
            # 410 Gone = 訂閱已失效，應從資料庫移除
            logger.warning(f"[Push] 推播失敗 (endpoint={subscription_info.get('endpoint', '')[:40]}…): {ex}")
            return False
        except Exception as ex:
            logger.error(f"[Push] 未預期錯誤: {ex}")
            return False
