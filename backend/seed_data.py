import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase = create_client(url, key)

# 根據你的 schema/ingredient.py 修正欄位名稱
test_ingredients = [
    {"name": "Milk (鮮乳)", "default_expire_days": 7},
    {"name": "Eggs (雞蛋)", "default_expire_days": 15},
    {"name": "Beef (牛肉)", "default_expire_days": 3},
    {"name": "Broccoli (花椰菜)", "default_expire_days": 5}
]

print("正在寫入測試數據到 ingredients 表格...")
try:
    res = supabase.table("ingredients").insert(test_ingredients).execute()
    print("✅ 成功！現在去 Supabase 重新整理頁面就能看到資料了。")
except Exception as e:
    print(f"❌ 依然失敗：{e}")
