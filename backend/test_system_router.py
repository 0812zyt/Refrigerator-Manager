from fastapi.testclient import TestClient
from main import app
import config

client = TestClient(app)

print("--- [TEST] Recognition Router Function Tests ---")

# 1. 確保 /set-recognition-url 已經被安全移除（應回傳 404）
print("\n[TEST 1] Verifying that /set-recognition-url has been removed (should return 404)...")
response = client.post(
    "/api/v1/system/set-recognition-url",
    json={"url": "https://some-url.com"}
)
assert response.status_code == 404, f"Expected 404, got {response.status_code}"
print("SUCCESS: Endpoint /set-recognition-url is successfully removed!")

# 2. 測試 Base64 解碼與真實連線報錯（無模擬備援數據）
print("\n[TEST 2] Testing real image request (should report honest HTTP error since test domain is offline)...")
# 設定一個斷線或無效的 API 網址來測試離線狀態
config.set_recognition_api_url("https://lecturer-smartness-drudge-offline-test.ngrok-free.dev/api/v1/recognize")
mock_base64_with_prefix = "data:image/jpeg;base64,aGVsbG8="

response = client.post(
    "/api/v1/system/recognize",
    json={"image_base64": mock_base64_with_prefix}
)
# 因對接的測試網址離線/無效，應回傳 502 Bad Gateway 錯誤而非虛假數據
print(f"Response Status: {response.status_code}")
print(f"Response JSON: {response.json()}")
assert response.status_code == 502, f"Expected 502 Bad Gateway, got {response.status_code}"
assert "無法連線" in response.json()["detail"] or "異常" in response.json()["detail"]
print("SUCCESS: Real HTTP error reported honestly without simulated mock fallbacks!")

print("\n--- [TEST] All local tests passed successfully! ---")
