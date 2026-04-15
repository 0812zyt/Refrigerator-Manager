"""
排程器模組
對應報告 3-4-1：排程器設計

採用基於時間的排程器（APScheduler），設定固定時間間隔（每日凌晨）
自動喚醒執行掃描任務。
"""

from apscheduler.schedulers.background import BackgroundScheduler
from services.expiry_module import ExpiryModule

scheduler = BackgroundScheduler()


def start_scheduler():
    """
    啟動排程器
    報告 3-4-1：每日凌晨自動執行到期掃描。
    """
    expiry = ExpiryModule()

    # 每日凌晨 00:00 執行到期掃描
    scheduler.add_job(
        expiry.scan_and_update,
        trigger='cron',
        hour=0,
        minute=0,
        id='daily_expiry_check',
        name='每日到期檢查',
        replace_existing=True
    )

    scheduler.start()
    print("[Scheduler] 排程器已啟動 - 每日 00:00 執行到期掃描")


def stop_scheduler():
    """停止排程器"""
    if scheduler.running:
        scheduler.shutdown()
        print("[Scheduler] 排程器已停止")
