from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from database import get_db

# HTTPBearer 會自動去檢查前端發過來的 API Request 有沒有夾帶 Token
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    這是一個 FastAPI 驗證器。
    它會攔截前端傳來的 Request，拿出裡面的 Token，送給 Supabase 檢查真偽。
    """
    token = credentials.credentials
    supabase = get_db()
    
    try:
        # 將前端給的鑰匙交由 Supabase 官方套件進行解密與驗證
        user_response = supabase.auth.get_user(token)
        user_data = user_response.user
        
        if not user_data:
            raise HTTPException(status_code=401, detail="無效或已被註銷的登入憑證")
            
        # 驗證成功，回傳這個使用者的資訊（包含他的 User ID）
        return user_data
    except Exception as e:
        print(f"[Auth Error] Token 驗證失敗: {e}")
        raise HTTPException(status_code=401, detail="身分驗證失敗，請重新登入")
