import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(BASE_DIR, "..", "backend"))

from app import app, get_flight_seat_map

with app.app_context():
    try:
        res = get_flight_seat_map(16000001)
        if isinstance(res, tuple):
            response_obj, code = res
            print("STATUS CODE:", code)
            print("DATA:", response_obj.get_json())
        else:
            print("RESPONSE:", res.get_json())
    except Exception as e:
        import traceback
        traceback.print_exc()
