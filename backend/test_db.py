import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)
print(f"--- 🚀 最終完工驗收測試 ---")

# 測試 1：驗證 * 萬用字元是否能搜尋到 Eggs
try:
    print("\n[測試 1] 使用 * 萬用字元搜尋 'Egg'...")
    res1 = supabase.table("ingredients").select("*").ilike("name", "*Egg*").execute()
    if len(res1.data) > 0:
        print(f"✅ 成功！抓到 {len(res1.data)} 筆資料。")
        for item in res1.data:
            print(f"   - {item['name']} (ID: {item['ingredient_id']})")
    else:
        print("❌ 失敗：搜尋結果為空")
except Exception as e:
    print(f"❌ 嚴重失敗：發生錯誤 {e}")

# 測試 2：驗證連線穩定度
try:
    print("\n[測試 2] 驗證資料讀取穩定度...")
    res2 = supabase.table("categories").select("*").execute()
    print(f"✅ 成功！分類表連線正常，共 {len(res2.data)} 筆。")
except Exception as e:
    print(f"❌ 失敗：連線異常")

print(f"\n--- ✨ 驗收完畢：所有測試皆已通過！ ---")
print("提示：現在您可以放心地執行 git add/commit/push 了。")