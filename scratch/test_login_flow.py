import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "..", "backend"))

from app import app

client = app.test_client()

print("--- 1. TESTING LOGIN VIA /api/login WITH das@123 ---")
res_login = client.post("/api/login", json={
    "loginMode": "U",
    "username": "dushmantadas@aos.com",
    "password": "das@123"
})
print("Login Status Code:", res_login.status_code)
print("Login Response JSON:", res_login.get_json())

print("\n--- 2. TESTING GET /api/me WITH SESSION ---")
res_me = client.get("/api/me")
print("/api/me Status Code:", res_me.status_code)
print("/api/me Response JSON:", res_me.get_json())
