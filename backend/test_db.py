import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)
print("--- [TEST] Database Connectivity Test ---")

# Test 1
try:
    print("\n[TEST 1] Searching for 'Egg' in ingredients...")
    res1 = supabase.table("ingredients").select("*").ilike("name", "*Egg*").execute()
    if len(res1.data) > 0:
        print(f"SUCCESS: Found {len(res1.data)} records.")
        for item in res1.data:
            print(f"   - {item['name']} (ID: {item['ingredient_id']})")
    else:
        print("FAIL: Search result is empty")
except Exception as e:
    print(f"CRITICAL ERROR: Exception occurred: {e}")

# Test 2
try:
    print("\n[TEST 2] Verifying categories table read...")
    res2 = supabase.table("categories").select("*").execute()
    print(f"SUCCESS: Categories connection okay. Count = {len(res2.data)}")
except Exception as e:
    print(f"FAIL: Connection issue: {e}")

print("\n--- [TEST] All tests completed! ---")