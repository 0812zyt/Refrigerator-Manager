"""
一次性執行腳本：產生 VAPID 金鑰對
執行：python generate_vapid.py
將輸出複製貼入 .env 檔案
"""
from py_vapid import Vapid
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
import base64

v = Vapid()
v.generate_keys()

# Public key: uncompressed point (65 bytes), urlsafe base64 without padding
pub_bytes = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
pub = base64.urlsafe_b64encode(pub_bytes).decode('utf-8').rstrip('=')

# Private key: raw 32-byte scalar, urlsafe base64 without padding
priv_int = v.private_key.private_numbers().private_value
priv_bytes = priv_int.to_bytes(32, 'big')
priv = base64.urlsafe_b64encode(priv_bytes).decode('utf-8').rstrip('=')

print("請將以下內容加入 .env：\n")
print(f"VAPID_PUBLIC_KEY={pub}")
print(f"VAPID_PRIVATE_KEY={priv}")
print(f"VAPID_EMAIL=your@email.com")
