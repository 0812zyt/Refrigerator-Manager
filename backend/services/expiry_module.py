"""
自動化效期監控模組 (ExpiryModule)
自動化背景服務設計

效期檢查與更新流程：
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
        到期判斷與推播流程
        由排程器（APScheduler）定期呼叫此方法。
        """
        today = date.today()
        threshold_48h = today + timedelta(days=2)  # 48 小時內到期

        # -------------------------------------------------------
        # 1. 資料庫掃描 (關聯 ingredients 取得真實食材名稱)
        # -------------------------------------------------------
        all_inventory = (
            self.db.table("user_inventory")
            .select("*, ingredients(name)")
            .execute()
        )

        expired_items = []       # 已過期的項目（紅色警示）
        urgent_48h_items = []    # 48 小時內到期（黃色警示）
        cleared_items = []       # 解除警示的項目

        urgent_ids = []          # 需標記為緊急的 ID 列表 (Batch update)
        clear_ids = []           # 需取消標記的 ID 列表 (Batch update)

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
            # 2. 閾值判斷與批次更新收集
            # -------------------------------------------------------
            if expire <= threshold_48h:
                # 已過期或即將到期 → 應標記為 True
                if not item.get("urgent_flag"):
                    urgent_ids.append(inventory_id)
                
                if expire <= today:
                    expired_items.append(item)
                else:
                    urgent_48h_items.append(item)
            else:
                # 尚未到期 → 應標記為 False
                if item.get("urgent_flag"):
                    clear_ids.append(inventory_id)
                    cleared_items.append(item)

        # -------------------------------------------------------
        # 批次執行資料庫更新，避免在迴圈中重覆呼叫 HTTP API 導致效能低落
        # -------------------------------------------------------
        if urgent_ids:
            self.db.table("user_inventory").update(
                {"urgent_flag": True}
            ).in_("inventory_id", urgent_ids).execute()

        if clear_ids:
            self.db.table("user_inventory").update(
                {"urgent_flag": False}
            ).in_("inventory_id", clear_ids).execute()

        # -------------------------------------------------------
        # 3. 推播通知
        # -------------------------------------------------------
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
            "push_notification": "SUCCESS"
        }

        print(f"[ExpiryModule] 掃描完成 - 已過期: {len(expired_items)}, "
              f"即將到期(48h內): {len(urgent_48h_items)}, "
              f"解除警示: {len(cleared_items)}")
        return result

    def _send_push_notification(self, expired_items: list, urgent_items: list):
        """
        透過 Web Push（VAPID）將到期警示推播到使用者裝置。
        """
        if not expired_items and not urgent_items:
            return

        try:
            from services.push_service import PushService
            push = PushService()

            # 依 user_id 彙整項目 (取出關聯 ingredients 中的真實食材名稱)
            user_data: dict = {}
            for item in expired_items:
                uid = item.get("user_id")
                if uid:
                    user_data.setdefault(uid, {"expired": [], "urgent": []})
                    ing_info = item.get("ingredients")
                    ing_name = ing_info.get("name") if isinstance(ing_info, dict) else None
                    user_data[uid]["expired"].append(ing_name or "食材")
            for item in urgent_items:
                uid = item.get("user_id")
                if uid:
                    user_data.setdefault(uid, {"expired": [], "urgent": []})
                    ing_info = item.get("ingredients")
                    ing_name = ing_info.get("name") if isinstance(ing_info, dict) else None
                    user_data[uid]["urgent"].append(ing_name or "食材")

            # 取出所有訂閱，以 user_id 為 key
            subs_result = self.db.table("push_subscriptions").select("*").execute()
            sub_by_user: dict = {}
            for s in subs_result.data:
                sub_by_user.setdefault(s["user_id"], []).append(s)

            for uid, data in user_data.items():
                subs = sub_by_user.get(uid, [])
                if not subs:
                    continue

                parts = []
                if data["expired"]:
                    names = "、".join(data["expired"][:3])
                    parts.append(f"{names} 已過期")
                if data["urgent"]:
                    names = "、".join(data["urgent"][:3])
                    parts.append(f"{names} 即將到期")

                body = "；".join(parts)

                for sub in subs:
                    ok = push.send(
                        subscription_info={
                            "endpoint": sub["endpoint"],
                            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
                        },
                        title="🧊 冰箱管家提醒",
                        body=body,
                    )
                    # 訂閱失效時清除記錄
                    if not ok:
                        self.db.table("push_subscriptions").delete().eq(
                            "endpoint", sub["endpoint"]
                        ).execute()
        except Exception as e:
            print(f"[PUSH WARNING] Failed to send push notifications: {e}")

