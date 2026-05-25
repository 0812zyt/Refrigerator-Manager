"""
設定管理模組
從 .env 檔案載入環境變數，供其他模組使用。
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# 取得當前檔案所在的目錄絕對路徑，確保不論在哪啟動都能精準讀取到 .env
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

# Supabase 連線設定
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

# Web Push 推播設定（VAPID）
# 執行 python generate_vapid.py 產生金鑰後貼入 .env
VAPID_PUBLIC_KEY: str  = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_EMAIL: str       = os.getenv("VAPID_EMAIL", "admin@example.com")

# 影像辨識服務 API 網址設定 (外部影像辨識伺服器的 ngrok 網址)
_RECOGNITION_API_URL: str = os.getenv("RECOGNITION_API_URL", "")

def get_recognition_api_url() -> str:
    """動態取得影像辨識服務 API 網址"""
    global _RECOGNITION_API_URL
    return _RECOGNITION_API_URL

def set_recognition_api_url(url: str):
    """動態更新影像辨識服務 API 網址"""
    global _RECOGNITION_API_URL
    _RECOGNITION_API_URL = url.strip()


# 驗證必要的環境變數
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("請確認 .env 檔案中已設定 SUPABASE_URL 和 SUPABASE_KEY")

