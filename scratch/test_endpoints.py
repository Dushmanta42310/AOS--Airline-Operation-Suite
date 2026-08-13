import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "..", "backend"))

from app import app

client = app.test_client()

print("--- TESTING /api/me ---")
res_me = client.get("/api/me")
print("Status:", res_me.status_code)
print("Data:", res_me.get_json())

print("\n--- TESTING /api/flight-schedules ---")
res_sched = client.get("/api/flight-schedules")
print("Status:", res_sched.status_code)
print("Data:", res_sched.get_json())

print("\n--- TESTING /api/flight-seats/16000001 ---")
res_seats = client.get("/api/flight-seats/16000001")
print("Status:", res_seats.status_code)
data_seats = res_seats.get_json()
if data_seats:
    print("Flight Details:", data_seats.get("flightDetails"))
    print("Seats Count:", len(data_seats.get("seats", [])))
    print("Passengers Count:", len(data_seats.get("passengers", [])))
