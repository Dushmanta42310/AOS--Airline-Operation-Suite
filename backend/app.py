from flask import Flask, render_template, request, jsonify, send_file, session
import oracledb
import random
import os
import urllib.request
import urllib.parse
import base64
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_DIR = os.path.join(BASE_DIR, "..", "frontend", "templates")
STATIC_DIR = os.path.join(BASE_DIR, "..", "frontend", "static")
PASSPORT_DIR = os.path.join(STATIC_DIR, "passport")

if not os.path.exists(PASSPORT_DIR):
    os.makedirs(PASSPORT_DIR)

app = Flask(
    __name__,
    template_folder=TEMPLATE_DIR,
    static_folder=STATIC_DIR
)
app.secret_key = os.environ.get("AOS_SECRET_KEY", "AOS_SECRET_KEY_2026")   # needed for Flask session

DB_USER = "airline"
DB_PASSWORD = "airline"
DB_HOST = "localhost"
DB_PORT = 1521
DB_SERVICE = "xepdb1"

# Twilio Credentials (use environment variables; never commit secrets)
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_VERIFY_SERVICE_SID = os.environ.get("TWILIO_VERIFY_SERVICE_SID", "")


def send_twilio_verify(mobile_no):
    url = f"https://verify.twilio.com/v2/Services/{TWILIO_VERIFY_SERVICE_SID}/Verifications"
    data = urllib.parse.urlencode({'To': f'+91{mobile_no}', 'Channel': 'sms'}).encode('utf-8')
    req = urllib.request.Request(url, data=data)
    b64_auth = base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode('utf-8')).decode('utf-8')
    req.add_header('Authorization', f'Basic {b64_auth}')
    
    try:
        urllib.request.urlopen(req, timeout=10)
        return True, "Success"
    except Exception as e:
        return False, str(e)

def check_twilio_verify(mobile_no, code):
    url = f"https://verify.twilio.com/v2/Services/{TWILIO_VERIFY_SERVICE_SID}/VerificationCheck"
    data = urllib.parse.urlencode({'To': f'+91{mobile_no}', 'Code': code}).encode('utf-8')
    req = urllib.request.Request(url, data=data)
    b64_auth = base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode('utf-8')).decode('utf-8')
    req.add_header('Authorization', f'Basic {b64_auth}')
    
    try:
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read().decode('utf-8'))
        return data.get("status") == "approved"
    except Exception as e:
        return False

dsn = oracledb.makedsn(DB_HOST, DB_PORT, service_name=DB_SERVICE)

_pool = None

def get_pool():
    global _pool
    if _pool is None:
        _pool = oracledb.create_pool(
            user=DB_USER,
            password=DB_PASSWORD,
            dsn=dsn,
            min=1,
            max=5,
            increment=1
        )
    return _pool

def get_conn():
    return get_pool().acquire()

def get_client_ip():
    if request.headers.get("X-Forwarded-For"):
        return request.headers.get("X-Forwarded-For").split(",")[0].strip()
    return request.remote_addr or "127.0.0.1"

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/api/send-otp", methods=["POST"])
def send_otp():
    data = request.get_json()
    mobile_no = str(data.get("mobileNo", "")).strip()

    if len(mobile_no) != 10 or not mobile_no.isdigit():
        return jsonify({"message": "Invalid mobile number."}), 400

    otp = str(random.randint(100000, 999999))

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Check if mobile number exists
        cur.execute("""
            SELECT COUNT(*) FROM AIRLINE_USER_MSTR_TBL WHERE MOBILENO = :mobileno
        """, {"mobileno": int(mobile_no)})

        if cur.fetchone()[0] == 0:
            return jsonify({"message": "Mobile number not registered."}), 404

        # Actually dispatch Twilio Verify SMS
        success, error_msg = send_twilio_verify(mobile_no)
        if not success:
            print("Twilio hit an error:", error_msg)
            return jsonify({"message": "Failed to connect to Twilio. Error: " + error_msg}), 500

        # We return a success message so frontend goes to next step
        return jsonify({"message": "OTP sent to your mobile!"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    login_mode = data.get("loginMode")
    
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        # Prepare OUT variable
        v_result = cur.var(str)

        if login_mode == "U":
            username = str(data.get("username", "")).strip()
            password = str(data.get("password", "")).strip()
            
            if not username or not password:
                return jsonify({"message": "Username and password required."}), 400
                
            cur.callproc("USER_LOGIN_USP", ["U", username.lower(), password.lower(), None, None, v_result])
            
        elif login_mode == "M":
            mobile_no = str(data.get("mobileNo", "")).strip()
            otp = str(data.get("otp", "")).strip()
            
            if not mobile_no or not otp:
                return jsonify({"message": "Mobile number and OTP required."}), 400
                
            # Verify code against Twilio Verify API
            is_valid = check_twilio_verify(mobile_no, otp)
            if not is_valid:
                return jsonify({"message": "Invalid OTP via Twilio."}), 401
                
            # Valid Twilio Code. Update DB with OTP to satisfy Procedure check
            cur.execute("UPDATE AIRLINE_USER_MSTR_TBL SET OTP = :otp WHERE MOBILENO = :mobile", {"otp": int(otp), "mobile": int(mobile_no)})
            conn.commit()
            
            # Use Procedure for strict validation
            cur.callproc("USER_LOGIN_USP", ["M", None, None, int(mobile_no), int(otp), v_result])
            
        else:
            return jsonify({"message": "Invalid login mode."}), 400

        result = v_result.getvalue()
        print(f"[LOGIN DEBUG] login_mode={login_mode} result={repr(result)}")

        if result == "Y":
             # Optional: clear OTP after successful M login
             if login_mode == "M":
                 cur.execute("UPDATE AIRLINE_USER_MSTR_TBL SET OTP = NULL WHERE MOBILENO = :mobileno", {"mobileno": int(data.get("mobileNo"))})
                 conn.commit()

             # Determine user identifier
             if login_mode == "U":
                 user_id = username.lower()
             else:
                 user_id = str(data.get("mobileNo", ""))

             # Derive display name from username or mobile
             full_name = "User"
             try:
                 if login_mode == "U":
                     # e.g. "dushmantadas@aos.com" → "Dushmantadas"
                     local = username.split("@")[0].replace(".", " ").replace("_", " ")
                     full_name = local.title()
                 else:
                     # Use mobile number as identifier
                     full_name = "User " + user_id[-4:]  # last 4 digits
             except Exception:
                 pass

             # Store in Flask server-side session
             session["user_id"]    = user_id
             session["login_mode"] = login_mode
             session["full_name"]  = full_name
             session["role"]       = ""

             return jsonify({
                 "message":   "Login successful!",
                 "fullName":  full_name,
                 "role":      "",
                 "userId":    user_id,
                 "loginMode": login_mode
             }), 200
        else:
             return jsonify({"message": "Invalid credentials or OTP."}), 401

    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route("/api/me")
def me():
    user_id = session.get("user_id")
    login_mode = session.get("login_mode", "U")

    print("[ME DEBUG] session user_id =", user_id, "login_mode =", login_mode)

    if not user_id:
        return jsonify(message="Not logged in"), 401

    conn = None
    cur = None
    menu_cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        if login_mode == "U":
            cur.execute("""
                SELECT USER_ID, USERNAME, PASSPORT_IMG
                FROM AIRLINE_USER_MSTR_TBL
                WHERE LOWER(USERNAME) = LOWER(:1)
            """, [user_id])
        else:
            cur.execute("""
                SELECT USER_ID, USERNAME, PASSPORT_IMG
                FROM AIRLINE_USER_MSTR_TBL
                WHERE MOBILENO = :1
            """, [int(user_id)])

        row = cur.fetchone()
        print("[ME DEBUG] user row =", row)

        if not row:
            return jsonify(message="User not found"), 404

        db_userid = row[0]
        db_username = row[1] or ""
        passport_img = row[2] or ""

        cur.execute("""
            SELECT r.ROLE_NAME
            FROM AIRLINE_USER_ROLE_MAP_TBL urm
            JOIN AIRLINE_ROLE_MSTR_TBL r ON urm.ROLE_ID = r.ROLE_ID
            WHERE urm.USER_ID = :1
              AND urm.IS_ACTIVE = 'Y'
              AND r.IS_ACTIVE = 'Y'
        """, [db_userid])

        role_row = cur.fetchone()
        role = role_row[0] if role_row else ""
        session["role"] = role

        menus = []
        if db_username:
            ref_cursor = cur.var(oracledb.CURSOR)
            cur.callproc("AIRLINE_GET_MENU_USP", [db_username, ref_cursor])
            menu_cur = ref_cursor.getvalue()
            menus = [r[0].strip() for r in menu_cur.fetchall() if r[0]]

        full_name = session.get("full_name", "")
        if not full_name or full_name == "User":
            if login_mode == "U" and db_username:
                local = db_username.split("@")[0].replace(".", " ").replace("_", " ")
                full_name = local.title()
            else:
                full_name = "User " + str(user_id)[-4:]

        photo_url = None
        if passport_img:
            photo_url = f"/api/passport-photo?id={db_userid}"

        response = {
            "fullName": full_name,
            "role": role,
            "menus": menus,
            "photoUrl": photo_url,
            "userId": user_id,
            "loginMode": login_mode
        }

        print("[ME DEBUG] response =", response)
        return jsonify(response), 200

    except Exception as e:
        print("[ME ERROR]", str(e))
        return jsonify(message=str(e)), 500

    finally:
        if menu_cur:
            menu_cur.close()
        if cur:
            cur.close()
        if conn:
            conn.close()
@app.route("/api/passport-photo")
def passport_photo():
    """Serve the passport image stored at the absolute path in PASSPORT_IMG."""
    db_id = request.args.get("id", "").strip()

    if not db_id:
        return jsonify({"message": "id param required"}), 400

    conn = None
    cur  = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        print(f"[DEBUG] Passport request for DB_ID: {db_id}")

        cur.execute("""
            SELECT PASSPORT_IMG FROM AIRLINE_USER_MSTR_TBL
            WHERE USER_ID = :1
        """, [int(db_id)])

        row = cur.fetchone()
        if not row or not row[0]:
            print(f"[DEBUG] No image path found in DB for ID {db_id}")
            return jsonify({"message": "No passport image found"}), 404

        img_path = row[0].strip()
        print(f"[DEBUG] Found path in DB: {img_path}")

        if not os.path.isfile(img_path):
            # Try to see if it's a relative path to static
            if not os.path.isabs(img_path):
                 alt_path = os.path.join(STATIC_DIR, img_path)
                 if os.path.isfile(alt_path):
                     img_path = alt_path
            
            if not os.path.isfile(img_path):
                print(f"[DEBUG] File DOES NOT EXIST on disk: {img_path}")
                return jsonify({"message": f"Image file not found: {img_path}"}), 404

        ext = os.path.splitext(img_path)[1].lower()
        mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".png": "image/png",  ".gif": "image/gif",
                    ".bmp": "image/bmp",  ".webp": "image/webp"}
        mimetype = mime_map.get(ext, "image/jpeg")

        return send_file(img_path, mimetype=mimetype)

    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:  cur.close()
        if conn: conn.close()


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@app.route("/api/admin/create-user", methods=["POST"])
def admin_create_user():
    """Call the ADMIN_CREATE_USER_USP procedure to register a new user."""
    if session.get("role") != "ADMIN":
        return jsonify({"message": "Unauthorized. Admin role required."}), 403

    # Handle multipart/form-data for file upload
    user_id_val = request.form.get("userId")
    username_val = request.form.get("username")
    mobile_no_val = request.form.get("mobileNo")
    password_val = request.form.get("password")
    mpin_val = request.form.get("mpin")
    is_active_val = request.form.get("isActive", "Y")
    
    passport_file = request.files.get("passportImg")
    passport_path = ""
    
    if passport_file and passport_file.filename:
        # Save file with a safe name
        filename = f"passport_{user_id_val}_{passport_file.filename}"
        save_path = os.path.join(PASSPORT_DIR, filename)
        passport_file.save(save_path)
        passport_path = os.path.abspath(save_path)

    conn = None
    cur  = None
    try:
        conn = get_conn()
        cur  = conn.cursor()

        # Use an OUT variable for the 10th parameter (P_DATA) found in DB
        v_result = cur.var(str)

        params = [
            int(user_id_val) if user_id_val else 0,
            username_val or "",
            int(mobile_no_val) if mobile_no_val else 0,
            password_val or "",
            int(mpin_val) if mpin_val else 0,
            is_active_val,
            session.get("user_id") or "ADMIN",
            passport_path,
            v_result
        ]

        cur.callproc("ADMIN_CREATE_USER_USP", params)
        conn.commit()
        
        db_msg = v_result.getvalue()
        return jsonify({"message": f"User created successfully! DB says: {db_msg}"}), 200

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR] Procedure Call Failed: {str(e)}")
        return jsonify({"message": f"Database Error: {str(e)}"}), 500
    finally:
        if cur:  cur.close()
        if conn: conn.close()


@app.route("/api/debug-login")
def debug_login():
    """Debug: list all columns of AIRLINE_USER_MSTR_TBL to find correct column names."""
    conn = None
    cur  = None
    try:
        conn = get_conn()
        cur  = conn.cursor()
        # Get column names from Oracle data dictionary
        cur.execute("""
            SELECT COLUMN_NAME, DATA_TYPE
            FROM USER_TAB_COLUMNS
            WHERE TABLE_NAME = 'AIRLINE_USER_MSTR_TBL'
            ORDER BY COLUMN_ID
        """)
        cols = [{"column": r[0], "type": r[1]} for r in cur.fetchall()]

        # Also fetch one sample row (just USER_ID, USERNAME)
        cur.execute("""
            SELECT USER_ID, USERNAME FROM AIRLINE_USER_MSTR_TBL
            WHERE ROWNUM = 1
        """)
        sample = cur.fetchone()

        return jsonify({
            "columns": cols,
            "sample_user_id": sample[0] if sample else None,
            "sample_username": sample[1] if sample else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if cur:  cur.close()
        if conn: conn.close()


if __name__ == "__main__":
    app.run(debug=True)