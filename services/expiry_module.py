"""
自動化效期監控模組 (ExpiryModule)
對應報告 3-4：自動化背景服務

流程（報告 3-4-2）：
  1. 資料庫掃描：對 user_inventory 進行掃描，針對 expire_date 進行範圍查詢
  2. 閾值判斷：
     - 即將過期（24~48 小時內）→ 標記 urgent_flag = True（黃色警示）
     - 已過期（expire_date < 當前時間）→ 標記 urgent_flag = True（紅色警示）
  3. 推播通知：將篩選項目發送至使用者裝置
"""

from database import get_db
from datetime import date, timedelta, datetime


class ExpiryModule:
    """效期監控模組，負責自動化效期檢查與推播"""

    def __init__(self):
        self.db = get_db()

    def scan_and_update(self) -> dict:
        """
        報告 3-4-2：到期判斷與推播流程
        由排程器（APScheduler）定期呼叫此方法。
        """
        today = date.today()
        threshold_48h = today + timedelta(days=2)  # 48 小時內到期

        # -------------------------------------------------------
        # 1. 資料庫掃描
        # -------------------------------------------------------
        all_inventory = (
            self.db.table("user_inventory")
            .select("*")
            .execute()
        )

        expired_items = []       # 已過期的項目（紅色警示）
        urgent_48h_items = []    # 48 小時內到期（黃色警示）
        cleared_items = []       # 解除警示的項目

        for item in all_inventory.data:
            expire_str = item.get("expire_date")
            if not expire_str:
                continue

            try:
                expire = date.fromisoformat(str(expire_str))
            except (ValueError, TypeError):
                continue

            inventory_id = item["inventory_id"]

            # -------------------------------------------------------
            # 2. 閾值判斷根據報告 3-4-2
            # -------------------------------------------------------
            if expire <= today:
                # 已過期 → 紅色警示
                self.db.table("user_inventory").update(
                    {"urgent_flag": True}
                ).eq("inventory_id", inventory_id).execute()
                expired_items.append(item)

            elif today < expire <= threshold_48h:
                # 24~48 小時內（即將到期） → 黃色警示
                self.db.table("user_inventory").update(
                    {"urgent_flag": True}
                ).eq("inventory_id", inventory_id).execute()
                urgent_48h_items.append(item)

            else:
                # 尚未到期（> 48 小時） → 解除標記
                if item.get("urgent_flag"):
                    self.db.table("user_inventory").update(
                        {"urgent_flag": False}
                    ).eq("inventory_id", inventory_id).execute()
                    cleared_items.append(item)

        # -------------------------------------------------------
        # 3. 推播通知
        # -------------------------------------------------------
        # 呼叫推播服務 API，將各級別警示項目發送給使用者
        self._send_push_notification(expired_items, urgent_48h_items)

        result = {
            "status": "scan_completed",
            "scan_date": str(today),
            "total_scanned": len(all_inventory.data),
            "expired": {
                "count": len(expired_items),
                "items": [
                    {"inventory_id": i["inventory_id"], "expire_date": i.get("expire_date")}
                    for i in expired_items
                ],
                "level": "red"
            },
            "urgent": {
                "count": len(urgent_48h_items),
                "items": [
                    {"inventory_id": i["inventory_id"], "expire_date": i.get("expire_date")}
                    for i in urgent_48h_items
                ],
                "level": "yellow"
            },
            "cleared_count": len(cleared_items),
            "push_notification": "NOT_IMPLEMENTED - 待實作 _send_push_notification"
        }

        print(f"[ExpiryModule] 掃描完成 - 已過期: {len(expired_items)}, "
              f"即將到期(48h內): {len(urgent_48h_items)}, "
              f"解除警示: {len(cleared_items)}")
        return result

    def _send_push_notification(self, expired_items: list, urgent_items: list):
        """
        TODO: ❸ 需與組員討論推播服務方案後實作
        可能的方案：LINE Notify、Firebase Cloud Messaging (FCM)、或其他推播服務
        此方法應根據傳入的 expired_items 和 urgent_items 觸發推播 API
        """
        pass
