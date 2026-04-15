"""
資料庫連線模組
負責建立與管理 Supabase Client 連線。
對應報告 3-2-1：後端主程式 -> 資料庫 (Database) 的連線層。
"""

from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

# 建立 Supabase Client（使用 secret key，可繞過 RLS）
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_db() -> Client:
    """取得 Supabase Client 實例"""
    return supabase
