from fastapi.testclient import TestClient
from main import app
import config

client = TestClient(app)

print("--- [TEST] Recognition Router Function Tests ---")

# 1. 測試動態設定 URL 端點
print("\n[TEST 1] Testing dynamic recognition API URL setup...")
test_url = "https://test-ngrok-url.ngrok-free.dev/api/v1/recognize"
response = client.post(
    "/api/v1/system/set-recognition-url",
    json={"url": test_url}
)
assert response.status_code == 200, f"Setup URL failed: {response.text}"
data = response.json()
print(f"Response: {data}")
assert data["current_url"] == test_url
assert config.get_recognition_api_url() == test_url
print("SUCCESS: Dynamic recognition URL set successfully!")

# 2. 測試 Base64 解碼 (過濾 data:image 前綴) 與 Fallback 機制
print("\n[TEST 2] Testing Base64 image with prefix & Fallback backup...")
# 給予一個帶有 Canvas 前綴的 base64 字串，因 test_url 無法連接，此時應觸發 Fallback
mock_base64_with_prefix = "data:image/jpeg;base64,aGVsbG8="  # 'hello' base64, len 5 (odd) -> Fallback to Banana (信心不足)
response = client.post(
    "/api/v1/system/recognize",
    json={"image_base64": mock_base64_with_prefix}
)
assert response.status_code == 200, f"Recognition request failed: {response.text}"
data = response.json()
print(f"Response (Fallback): {data}")
assert data["low_confidence"] is True
assert data["closest_class"] == "Banana"
print("SUCCESS: Base64 decoding & Fallback backup verification successful!")

print("\n--- [TEST] All local tests passed successfully! ---")
