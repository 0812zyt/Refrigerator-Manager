"""
資料查詢邏輯模組 (DBQueryModule)
對應報告 3-3-2 A：資料查詢邏輯

流程：
  A.1 標準化前處理：去除空白、統一大小寫及進行同義詞對照
  A.2 主庫查詢：查詢 user_inventory，命中則回傳完整庫存物件
  A.3 備用庫查詢：查詢 ingredients（範本資料庫），進行匹配或類別映射
"""

from database import get_db

# ----------------------------------------------------------------
# 報告 3-3-2 A.1：同義詞對照表
# 將不同的稱呼統一對應到標準名稱，提升搜尋命中率。
# ----------------------------------------------------------------
SYNONYM_MAP = {
    # 蛋類
    "蛋": "雞蛋",
    "鷄蛋": "雞蛋",
    "egg": "雞蛋",
    "eggs": "雞蛋",
    # 番茄
    "西紅柿": "番茄",
    "tomato": "番茄",
    # 馬鈴薯
    "土豆": "馬鈴薯",
    "洋芋": "馬鈴薯",
    "potato": "馬鈴薯",
    # 玉米
    "包穀": "玉米",
    "corn": "玉米",
    # 高麗菜
    "包菜": "高麗菜",
    "捲心菜": "高麗菜",
    "cabbage": "高麗菜",
    # 豬肉
    "pork": "豬肉",
    # 雞肉
    "chicken": "雞肉",
    # 牛肉
    "beef": "牛肉",
    # 牛奶
    "鮮奶": "牛奶",
    "milk": "牛奶",
    # 豆腐
    "tofu": "豆腐",
    # 蘋果
    "apple": "蘋果",
    # 香蕉
    "banana": "香蕉",
}


class DBQueryModule:
    """資料查詢模組，負責庫存與食材範本的查詢邏輯"""

    def __init__(self):
        self.db = get_db()

    # ----------------------------------------------------------------
    # A.1 標準化前處理
    # ----------------------------------------------------------------
    def standardize_query(self, query: str) -> str:
        """
        報告 3-3-2 A.1：標準化前處理
        目前暫時關閉同義詞轉換，直接回傳小寫去空白後的字串，
        以確保能搜到資料庫中的英文名稱 (例如 Egg, Coffee)。
        """
        if not query:
            return ""
        return query.strip().lower()

    # ----------------------------------------------------------------
    # A.2 主庫查詢（Inventory）
    # ----------------------------------------------------------------
    def query_inventory_all(self, user_id: str = None):
        """查詢庫存列表，JOIN ingredients 取得食材名稱"""
        query = self.db.table("user_inventory").select("*, ingredients(name)")
        if user_id is not None:
            query = query.eq("user_id", user_id)
        result = query.execute()
        items = []
        for item in result.data:
            ing = item.pop("ingredients", None)
            if ing:
                item["ingredient_name"] = ing.get("name")
            items.append(item)
        return items

    def query_inventory_by_id(self, inventory_id: int):
        """查詢單一庫存項目"""
        result = (
            self.db.table("user_inventory")
            .select("*")
            .eq("inventory_id", inventory_id)
            .execute()
        )
        return result.data[0] if result.data else None

    def search_inventory(self, user_id: str, keyword: str):
        """
        報告 3-3-2 A.2：主庫查詢
        先在使用者庫存中搜尋符合關鍵字的食材。
        透過 ingredient_id 關聯到 ingredients 表的 name 欄位進行比對。
        """
        keyword = self.standardize_query(keyword)

        # 取得使用者所有庫存，並關聯 ingredients 表取得食材名稱
        all_inventory = (
            self.db.table("user_inventory")
            .select("*, ingredients(name, category_id, default_expire_days)")
            .eq("user_id", user_id)
            .execute()
        )

        # 在結果中篩選符合關鍵字的項目
        matched = []
        for item in all_inventory.data:
            ingredient_info = item.get("ingredients")
            if ingredient_info and keyword in ingredient_info.get("name", "").lower():
                matched.append(item)

        return matched

    # ----------------------------------------------------------------
    # A.3 備用庫查詢（Template Library = ingredients 表）
    # ----------------------------------------------------------------
    def query_template(self, keyword: str):
        """
        報告 3-3-2 A.3：備用庫查詢
        若主庫查無資料，轉向範本資料庫（ingredients 表）進行模糊匹配。
        若找到範本則回傳建議資料，否則回傳空列表（提示手動輸入）。
        """
        keyword = self.standardize_query(keyword)
        result = (
            self.db.table("ingredients")
            .select("*")
            .ilike("name", f"*{keyword}*")
            .execute()
        )
        return result.data

    def query_template_by_id(self, ingredient_id: int):
        """透過 ID 查詢食材範本"""
        result = (
            self.db.table("ingredients")
            .select("*")
            .eq("ingredient_id", ingredient_id)
            .execute()
        )
        return result.data[0] if result.data else None

    # ----------------------------------------------------------------
    # ingredients(範本) 一般查詢
    # ----------------------------------------------------------------
    def query_all_ingredients(self, category_id: int = None):
        query = self.db.table("ingredients").select("*")
        if category_id is not None:
            query = query.eq("category_id", category_id)
        result = query.execute()
        return result.data

    def query_ingredient_by_id(self, ingredient_id: int):
        result = (
            self.db.table("ingredients")
            .select("*")
            .eq("ingredient_id", ingredient_id)
            .execute()
        )
        return result.data[0] if result.data else None

    # ----------------------------------------------------------------
    # Categories 查詢
    # ----------------------------------------------------------------
    def query_all_categories(self):
        """查詢所有食材分類"""
        result = self.db.table("categories").select("*").execute()
        return result.data

    def query_category_by_id(self, category_id: int):
        """查詢單一分類"""
        result = (
            self.db.table("categories")
            .select("*")
            .eq("category_id", category_id)
            .execute()
        )
        return result.data[0] if result.data else None

    # ----------------------------------------------------------------
    # Users 查詢
    # ----------------------------------------------------------------
    def query_all_users(self):
        """查詢所有使用者"""
        result = self.db.table("users").select("*").execute()
        return result.data

    def query_user_by_id(self, user_id: str):
        """透過 ID 查詢使用者"""
        result = (
            self.db.table("users")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data[0] if result.data else None
