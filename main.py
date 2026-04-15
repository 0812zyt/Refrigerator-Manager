"""
智慧冰箱食材辨識與管理系統 - 後端 API
The Design and Implementation of a Smart Refrigerator Food Identification and Managing System

技術選型（報告 3-1-2）：
  - Backend Language: Python 3.9+
  - Web Framework:   FastAPI（支援 ASGI 與 async/await）
  - Database:        PostgreSQL（Supabase）
  - Task Scheduler:  APScheduler
  - API Protocol:    RESTful（HTTP/1.1, JSON）

系統架構（報告 3-1-1）：
  - Client-Server 架構
  - RESTful API 設計，所有資源透過 URI 定位（/api/v1/...）
  - 無狀態通訊
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from routers import categories, ingredients, inventory, system
from routers import users
from scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    應用程式生命週期管理
    - 啟動時：啟動 APScheduler 排程器（報告 3-4-1）
    - 關閉時：停止排程器
    """
    # Startup
    start_scheduler()
    print("[App] 智慧冰箱後端 API 已啟動")
    yield
    # Shutdown
    stop_scheduler()
    print("[App] 智慧冰箱後端 API 已關閉")


app = FastAPI(
    title="智慧冰箱食材管理系統 API",
    description=(
        "Smart Refrigerator Food Identification and Managing System\n\n"
        "提供食材庫存管理、到期監控與影像辨識等功能的 RESTful API。\n\n"
        "## 功能模組\n"
        "- **Users**: 使用者資訊查詢\n"
        "- **Categories**: 食材分類管理\n"
        "- **Ingredients**: 食材範本（Template Library）查詢\n"
        "- **Inventory**: 使用者庫存 CRUD 操作\n"
        "- **System**: 系統控制（喚醒/休眠/到期掃描/辨識）\n\n"
        "## 待實作功能（需與組員討論）\n"
        "- ❷ 使用者驗證機制\n"
        "- ❸ 推播通知服務\n"
        "- ❹ 影像辨識 API 整合\n"
        "- ❻ 條碼掃描對應"
    ),
    version="1.0.0",
    lifespan=lifespan
)

# ----------------------------------------------------------------
# CORS 設定（報告 3-7：前端需透過 API 與後端通訊）
# ----------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: 正式環境應限制為前端的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------
# 全域錯誤處理（報告 3-2-2：統一 HTTP 狀態碼回應格式）
# - 200 OK / 201 Created：成功
# - 400 Bad Request：格式錯誤
# - 404 Not Found：查無資料
# - 500 Internal Server Error：伺服器錯誤
# ----------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    捕捉所有未處理的例外，回傳統一格式的 500 錯誤。
    避免向前端暴露系統內部錯誤細節。
    """
    print(f"[Error] Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "status_code": 500,
            "message": "伺服器內部錯誤，請稍後再試"
        }
    )


# ----------------------------------------------------------------
# FSM 中間件（報告 3-3-1：狀態控制）
# 在休眠狀態下，僅允許系統控制 API 和根路徑通過。
# 其他 API 需先透過 /api/v1/system/wake 喚醒後才能使用。
# ----------------------------------------------------------------
@app.middleware("http")
async def fsm_middleware(request: Request, call_next):
    """
    報告 3-3-1：系統休眠保護中間件
    當系統處於 sleep 狀態時，僅允許存取系統控制端點。
    """
    path = request.url.path

    # 允許通過的路徑：根路徑、健康檢查、API 文件、系統控制 API
    allowed_prefixes = [
        "/",
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/api/v1/system",
    ]

    # 檢查是否為允許通過的路徑
    is_allowed = any(
        path == prefix or path.startswith(prefix + "/")
        for prefix in allowed_prefixes
    )

    # 根路徑精確比對
    if path == "/":
        is_allowed = True

    if not is_allowed and not system.is_system_active():
        return JSONResponse(
            status_code=503,
            content={
                "error": True,
                "status_code": 503,
                "message": "系統處於休眠模式，請先呼叫 POST /api/v1/system/wake 喚醒系統"
            }
        )

    response = await call_next(request)
    return response


# ----------------------------------------------------------------
# 註冊路由（報告 3-2-2：API 介面規範）
# ----------------------------------------------------------------
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(ingredients.router)
app.include_router(inventory.router)
app.include_router(system.router)


@app.get("/", tags=["Root"])
def root():
    """API 根路徑 - 確認服務狀態"""
    return {
        "service": "智慧冰箱食材管理系統 API",
        "version": "1.0.0",
        "status": "running",
        "system_state": system.get_system_state(),
        "docs": "/docs"
    }

@app.get("/health", tags=["Root"])
def health_check():
    """單純的健康檢查，供外部服務（如 Render）定時呼叫防休眠"""
    return {"status": "ok"}
