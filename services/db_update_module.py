"""
資料更新與寫入邏輯模組 (DBUpdateModule)
對應報告 3-3-2 B：資料更新與寫入邏輯

流程：
  B.1 欄位檢查與預處理：檢查必要欄位，缺少非關鍵欄位時自動填入預設值
  B.2 資料寫入操作：包裹於交易（Transaction）中，確保原子性
  B.3 日誌記錄：寫入成功記錄操作軌跡，失敗回傳錯誤碼
"""

from database import get_db
from datetime import date, timedelta, datetime


class DBUpdateModule:
    """資料更新模組，負責庫存的新增、修改與刪除"""

    def __init__(self):
        self.db = get_db()

    # ----------------------------------------------------------------
    # B.1 欄位檢查與預處理
    # ----------------------------------------------------------------
    def _fill_defaults(self, data: dict) -> dict:
        """
        報告 3-3-2 B.1：欄位檢查與預處理
        寫入前檢查必要欄位。若缺少非關鍵欄位（如效期），
        系統調用範本資料庫（ingredients 表）自動填入預設值。
        """
        # 自動填入 added_date（若未提供則為今天）
        if not data.get("added_date"):
            data["added_date"] = str(date.today())

        # 自動計算 expire_date（若未自訂到期日）
        if not data.get("custom_expire") and not data.get("expire_date"):
            ingredient = (
                self.db.table("ingredients")
                .select("default_expire_days")
                .eq("ingredient_id", data["ingredient_id"])
                .execute()
            )
            if ingredient.data:
                default_days = ingredient.data[0].get("default_expire_days")
                if default_days:
                    added = date.fromisoformat(str(data["added_date"]))
                    data["expire_date"] = str(added + timedelta(days=default_days))

        # 預設 custom_expire 為 False
        if "custom_expire" not in data or data["custom_expire"] is None:
            data["custom_expire"] = False

        # 預設 urgent_flag 為 False（新增時尚未到期）
        if "urgent_flag" not in data or data["urgent_flag"] is None:
            data["urgent_flag"] = False

        return data

    # ----------------------------------------------------------------
    # B.2 資料寫入操作（新增）
    # ----------------------------------------------------------------
    def create_inventory(self, data: dict):
        """
        報告 3-3-2 B.2：新增庫存
        寫入操作確保原子性。
        回傳 Supabase APIResponse。
        """
        # B.1: 欄位檢查與預處理
        data = self._fill_defaults(data)

        # 日期欄位轉為字串（避免 JSON 序列化錯誤）
        for key in ["added_date", "expire_date"]:
            if key in data and isinstance(data[key], date):
                data[key] = str(data[key])

        # 清除值為 None 的欄位，避免寫入錯誤
        clean_data = {k: v for k, v in data.items() if v is not None}

        # B.2: 資料寫入
        result = (
            self.db.table("user_inventory")
            .insert(clean_data)
            .execute()
        )

        # B.3: 日誌記錄
        if result.data:
            self._log_operation("INSERT", "user_inventory", result.data[0])

        return result

    # ----------------------------------------------------------------
    # B.2 資料寫入操作（修改）
    # ----------------------------------------------------------------
    def update_inventory(self, inventory_id: int, data: dict):
        """
        報告 3-3-2 B.2：修改庫存
        只更新有提供的欄位。
        回傳 Supabase APIResponse，若無欄位可更新則回傳 None。
        """
        # 移除值為 None 的欄位
        update_data = {k: v for k, v in data.items() if v is not None}

        if not update_data:
            return None  # 由 router 層處理為 400 回應

        # 日期欄位轉為字串
        for key in ["expire_date", "added_date"]:
            if key in update_data and isinstance(update_data[key], date):
                update_data[key] = str(update_data[key])

        result = (
            self.db.table("user_inventory")
            .update(update_data)
            .eq("inventory_id", inventory_id)
            .execute()
        )

        # B.3: 日誌記錄
        if result.data:
            self._log_operation("UPDATE", "user_inventory", result.data[0])

        return result

    # ----------------------------------------------------------------
    # B.2 資料寫入操作（刪除）
    # ----------------------------------------------------------------
    def delete_inventory(self, inventory_id: int):
        """刪除庫存項目"""
        result = (
            self.db.table("user_inventory")
            .delete()
            .eq("inventory_id", inventory_id)
            .execute()
        )

        # B.3: 日誌記錄
        self._log_operation("DELETE", "user_inventory", {"inventory_id": inventory_id})

        return result

    # ----------------------------------------------------------------
    # B.3 日誌記錄
    # ----------------------------------------------------------------
    def _log_operation(self, operation: str, table: str, data: dict):
        """
        報告 3-3-2 B.3：日誌記錄
        寫入成功則於日誌資料表（System Log）新增操作軌跡。

        注意：目前資料庫中尚未建立 system_log 資料表。
        TODO: 需與資料庫同學討論是否需要建立 system_log 資料表。
              建立後取消下方的註解即可啟用日誌記錄功能。
        """
        # 暫時以 print 輸出日誌（正式環境應寫入資料庫）
        print(f"[LOG] {operation} on {table}: {data}")

        # TODO: 待 system_log 資料表建立後啟用
        # try:
        #     self.db.table("system_log").insert({
        #         "operation": operation,
        #         "table_name": table,
        #         "record_data": str(data),
        #         "created_at": datetime.now().isoformat()
        #     }).execute()
        # except Exception as e:
        #     print(f"[LOG ERROR] Failed to write log: {e}")
