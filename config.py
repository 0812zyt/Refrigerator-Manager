"""
設定管理模組
從 .env 檔案載入環境變數，供其他模組使用。
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Supabase 連線設定
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

# Web Push 推播設定（VAPID）
# 執行 python generate_vapid.py 產生金鑰後貼入 .env
VAPID_PUBLIC_KEY: str  = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_EMAIL: str       = os.getenv("VAPID_EMAIL", "admin@example.com")

# 驗證必要的環境變數
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("請確認 .env 檔案中已設定 SUPABASE_URL 和 SUPABASE_KEY")
