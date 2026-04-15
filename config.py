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

# 推播服務設定 (TODO ❸)
FCM_SERVER_KEY: str = os.getenv("FCM_SERVER_KEY", "")
LINE_NOTIFY_TOKEN: str = os.getenv("LINE_NOTIFY_TOKEN", "")

# 驗證必要的環境變數
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("請確認 .env 檔案中已設定 SUPABASE_URL 和 SUPABASE_KEY")
