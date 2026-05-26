import os
from dotenv import load_dotenv

load_dotenv()

from services.expiry_module import ExpiryModule

print("--- [TEST] Running Expiry Module Scan ---")

try:
    module = ExpiryModule()
    result = module.scan_and_update()
    print("SUCCESS: Scan completed successfully!")
    print("Scan Result payload:", result)
except Exception as e:
    import traceback
    print("FAIL: Execution threw exception:")
    traceback.print_exc()
