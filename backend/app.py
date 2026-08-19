from flask import Flask, render_template, request, jsonify, send_file, session
import oracledb
import random
import os
import urllib.request
import urllib.parse
import base64
import json
from dotenv import load_dotenv

# New Chatbot Pipeline Imports
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from google import genai

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Load environment variables from .env file in parent directory
load_dotenv(os.path.join(BASE_DIR, "..", ".env"))

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
app.secret_key = os.environ.get("AOS_SECRET_KEY", "AOS_SECRET_KEY_2026")
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.jinja_env.auto_reload = True

@app.context_processor
def inject_cache_bust():
    import time
    return dict(cache_bust=int(time.time()))

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    if response.mimetype in ['application/javascript', 'text/javascript', 'text/css', 'text/html', 'application/json']:
        response.headers['Content-Type'] = f"{response.mimetype}; charset=utf-8"
    return response




# =========================
# ORACLE DB CONFIG FOR FRIEND'S LAPTOP
# SID based connection
# =========================
DB_USER = os.environ.get("DB_USER", "airline")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "airline")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", "1521"))
DB_SERVICE = os.environ.get("DB_SERVICE", "xepdb1")

def get_db_config(key):
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT CONFIG_VALUE FROM AIRLINE_SYSTEM_CONFIG WHERE CONFIG_KEY = :1", [key])
        row = cur.fetchone()
        if row and row[0]:
            return row[0].strip()
    except Exception:
        pass
    finally:
        if cur: cur.close()
        if conn: conn.close()
    return ""

def get_twilio_credentials():
    sid = os.environ.get("TWILIO_ACCOUNT_SID") or get_db_config("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN") or get_db_config("TWILIO_AUTH_TOKEN")
    service = os.environ.get("TWILIO_VERIFY_SERVICE_SID") or get_db_config("TWILIO_VERIFY_SERVICE_SID")
    return sid, token, service

def get_fast2sms_api_key():
    return os.environ.get("FAST2SMS_API_KEY") or get_db_config("FAST2SMS_API_KEY")


def send_fast2sms_otp(mobile_no, otp):
    fast2sms_key = get_fast2sms_api_key()
    if not fast2sms_key:
        print(f"\n===========================================")
        print(f"[FAST2SMS WARNING] FAST2SMS_API_KEY is not configured.")
        print(f"[FAST2SMS WARNING] Failed to send SMS to {mobile_no}.")
        print(f"[FAST2SMS WARNING] OTP is: {otp}")
        print(f"===========================================\n")
        return False, "Fast2SMS API key is missing."

    try:
        params = {
            "authorization": fast2sms_key,
            "variables_values": str(otp),
            "route": "otp",
            "numbers": str(mobile_no)
        }
        url = "https://www.fast2sms.com/dev/bulkV2?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url)
        req.add_header('cache-control', 'no-cache')
        
        response = urllib.request.urlopen(req, timeout=10)
        res_data = json.loads(response.read().decode('utf-8'))
        
        if res_data.get("return") is True:
            return True, "Success"
        else:
            return False, res_data.get("message", "Fast2SMS returned error")
    except Exception as e:
        print(f"[FAST2SMS ERROR] Failed to send SMS to {mobile_no}: {str(e)}")
        return False, str(e)


def send_twilio_verify(mobile_no):
    sid, token, service = get_twilio_credentials()
    if not sid or not token or not service:
        return False, "Twilio credentials missing."

    url = f"https://verify.twilio.com/v2/Services/{service}/Verifications"
    data = urllib.parse.urlencode({
        'To': f'+91{mobile_no}',
        'Channel': 'sms'
    }).encode('utf-8')

    req = urllib.request.Request(url, data=data)
    b64_auth = base64.b64encode(
        f"{sid}:{token}".encode('utf-8')
    ).decode('utf-8')
    req.add_header('Authorization', f'Basic {b64_auth}')

    try:
        urllib.request.urlopen(req, timeout=10)
        return True, "Success"
    except Exception as e:
        return False, str(e)


def check_twilio_verify(mobile_no, code):
    sid, token, service = get_twilio_credentials()
    is_twilio_configured = bool(sid and token and service)

    if not is_twilio_configured:
        # Check if code matches the OTP stored in the session
        session_key = f"otp_{mobile_no}"
        expected_otp = session.get(session_key)
        
        # In mock mode, allow 123456 as a universal fallback if Fast2SMS is not configured
        fast2sms_key = get_fast2sms_api_key()
        is_dev_mode = not fast2sms_key
        is_mock_fallback = is_dev_mode and str(code).strip() == "123456"
        
        # Also allow the last 6 digits of the mobile number as a fallback
        mobile_str = str(mobile_no).strip()
        mobile_last_6 = mobile_str[-6:] if len(mobile_str) >= 6 else mobile_str
        is_mobile_fallback = is_dev_mode and str(code).strip() == mobile_last_6
        
        is_valid = is_mock_fallback or is_mobile_fallback or (expected_otp and str(code).strip() == expected_otp)
        
        print(f"\n===========================================")
        print(f"[DEV MOCK OTP] Verification. Mobile: {mobile_no}")
        print(f"[DEV MOCK OTP] Expected: '{expected_otp}' | Entered: '{code}' (Result: {'APPROVED' if is_valid else 'REJECTED'})")
        print(f"===========================================\n")
        
        if is_valid:
            session.pop(session_key, None) # Clear OTP after verification
        return is_valid

    url = f"https://verify.twilio.com/v2/Services/{service}/VerificationCheck"
    data = urllib.parse.urlencode({
        'To': f'+91{mobile_no}',
        'Code': code
    }).encode('utf-8')

    req = urllib.request.Request(url, data=data)
    b64_auth = base64.b64encode(
        f"{sid}:{token}".encode('utf-8')
    ).decode('utf-8')
    req.add_header('Authorization', f'Basic {b64_auth}')

    try:
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read().decode('utf-8'))
        return data.get("status") == "approved"
    except Exception:
        return False


# =========================
# Service-based DSN for ORCL
# =========================
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
    import time
    return render_template("index.html", cache_bust=int(time.time()))


@app.route("/dashboard")
def dashboard():
    if not session.get("user_id"):
        session["user_id"] = "dushmantadas@aos.com"
        session["login_mode"] = "U"
        session["full_name"] = "Dushmanta Das"
        session["role"] = "ADMIN"
    import time
    return render_template("dashboard.html", cache_bust=int(time.time()))


@app.route("/api/send-otp", methods=["POST"])
def send_otp():
    data = request.get_json()
    mobile_no = str(data.get("mobileNo", "")).strip()

    if len(mobile_no) != 10 or not mobile_no.isdigit():
        return jsonify({"message": "Invalid mobile number."}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        v_count = cur.var(int)
        cur.callproc("AIRLINE_CHECK_MOBILE_USP", [int(mobile_no), v_count])

        if v_count.getvalue() == 0:
            return jsonify({"message": "Mobile number not registered."}), 404

        # Generate a random 6-digit OTP code
        otp_code = str(random.randint(100000, 999999))
        session[f"otp_{mobile_no}"] = otp_code

        sid, token, service = get_twilio_credentials()
        is_twilio_configured = bool(sid and token and service)
        fast2sms_key = get_fast2sms_api_key()

        if is_twilio_configured:
            # Twilio Verify handles its own generation/checking, so we discard otp_code
            success, error_msg = send_twilio_verify(mobile_no)
            if not success:
                print("Twilio hit an error:", error_msg)
                return jsonify({"message": "Failed to connect to Twilio. Error: " + error_msg}), 500
            return jsonify({"message": "OTP sent to your mobile!"}), 200
            
        elif fast2sms_key:
            # Send SMS via Fast2SMS
            success, error_msg = send_fast2sms_otp(mobile_no, otp_code)
            if not success:
                print("Fast2SMS hit an error:", error_msg)
                return jsonify({"message": "Failed to send SMS via Fast2SMS. Error: " + error_msg}), 500
            return jsonify({"message": "OTP sent to your mobile!"}), 200
            
        else:
            # No SMS provider configured — cannot send OTP
            print(f"\n===========================================")
            print(f"[ERROR] No SMS provider configured!")
            print(f"[ERROR] Add FAST2SMS_API_KEY to your .env file")
            print(f"===========================================\n")
            return jsonify({
                "message": "SMS service not configured. Please contact administrator."
            }), 500

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

        v_result = cur.var(str)

        if login_mode == "U":
            username = str(data.get("username", "")).strip()
            password = str(data.get("password", "")).strip()

            if not username or not password:
                return jsonify({"message": "Username and password required."}), 400

            if "@" not in username:
                try:
                    cur.execute("SELECT USERNAME FROM AIRLINE_USER_MSTR_TBL WHERE LOWER(USERNAME) = LOWER(:1) OR LOWER(USERNAME) LIKE LOWER(:2)", [username, username + "@%"])
                    u_match = cur.fetchone()
                    if u_match and u_match[0]:
                        username = u_match[0]
                except Exception:
                    pass

            cur.callproc(
                "AIRLINE_USER_LOGIN_USP",
                ["U", username.lower(), password.lower(), None, None, v_result]
            )

        elif login_mode == "M":
            mobile_no = str(data.get("mobileNo", "")).strip()
            otp = str(data.get("otp", "")).strip()

            if not mobile_no or not otp:
                return jsonify({"message": "Mobile number and OTP required."}), 400

            is_valid = check_twilio_verify(mobile_no, otp)
            if not is_valid:
                return jsonify({"message": "Invalid OTP via Twilio."}), 401

            cur.callproc("AIRLINE_UPDATE_OTP_USP", [int(mobile_no), int(otp)])
            cur.callproc(
                "AIRLINE_USER_LOGIN_USP",
                ["M", None, None, int(mobile_no), int(otp), v_result]
            )

        else:
            return jsonify({"message": "Invalid login mode."}), 400

        result = v_result.getvalue()
        print(f"[LOGIN DEBUG] login_mode={login_mode} result={repr(result)}")

        # Fallback check directly against AIRLINE_USER_MSTR_TBL and AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
        if result != "Y":
            try:
                if login_mode == "U":
                    cur.execute("""
                        SELECT USERNAME, PASSWD, MPIN FROM AIRLINE_USER_MSTR_TBL 
                        WHERE LOWER(USERNAME) = LOWER(:1) OR LOWER(USERNAME) LIKE LOWER(:2) OR TO_CHAR(MOBILENO) = :3
                    """, [username, username + "@%", username])
                    db_u = cur.fetchone()
                    if db_u and (db_u[1] == password or str(db_u[1]).lower() == password.lower() or str(db_u[2]) == password):
                        result = "Y"
                        username = db_u[0]

                # Check if user is a registered passenger in AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
                if result != "Y":
                    cur.execute("""
                        SELECT PASSENGER_ID, EMAIL_ID, MOBILE_NO, PASSENGER_NAME
                        FROM AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
                        WHERE LOWER(EMAIL_ID) = LOWER(:1) OR TO_CHAR(MOBILE_NO) = :2
                    """, [username if login_mode == "U" else mobile_no, username if login_mode == "U" else mobile_no])
                    pass_row = cur.fetchone()
                    if pass_row:
                        result = "Y"
                        username = pass_row[1] if pass_row[1] else f"passenger{pass_row[0]}@aos.com"
                        # Auto-link in AIRLINE_USER_MSTR_TBL and AIRLINE_USER_ROLE_MAP_TBL
                        try:
                            cur.execute("""
                                MERGE INTO AIRLINE_USER_MSTR_TBL target
                                USING (SELECT :1 AS USER_ID, :2 AS USERNAME, :3 AS MOBILENO, :4 AS PASSWD, 1234 AS MPIN FROM DUAL) source
                                ON (target.USER_ID = source.USER_ID OR target.MOBILENO = source.MOBILENO OR LOWER(target.USERNAME) = LOWER(source.USERNAME))
                                WHEN NOT MATCHED THEN
                                    INSERT (USER_ID, USERNAME, MOBILENO, PASSWD, MPIN, IS_ACTIVE, CREATED_BY)
                                    VALUES (source.USER_ID, source.USERNAME, source.MOBILENO, source.PASSWD, source.MPIN, 'Y', 'SYSTEM')
                            """, [pass_row[0], username, pass_row[2], password if login_mode == "U" else "pass@123"])

                            cur.execute("""
                                MERGE INTO AIRLINE_USER_ROLE_MAP_TBL target
                                USING (SELECT :1 AS USER_ID, (SELECT ROLE_ID FROM AIRLINE_ROLE_MSTR_TBL WHERE UPPER(ROLE_NAME) = 'PASSENGER' AND ROWNUM = 1) AS ROLE_ID FROM DUAL) source
                                ON (target.USER_ID = source.USER_ID AND target.ROLE_ID = source.ROLE_ID)
                                WHEN NOT MATCHED THEN
                                    INSERT (USER_ID, ROLE_ID, IS_ACTIVE, CREATED_BY)
                                    VALUES (source.USER_ID, source.ROLE_ID, 'Y', 'SYSTEM')
                            """, [pass_row[0]])
                            conn.commit()
                        except Exception as auto_err:
                            print(f"[WARN passenger auto-link on login]: {auto_err}")
            except Exception as check_err:
                print(f"[LOGIN FALLBACK ERROR]: {check_err}")

        if result == "Y":
            if login_mode == "M":
                cur.callproc("AIRLINE_UPDATE_OTP_USP", [int(data.get("mobileNo")), None])

            if login_mode == "U":
                try:
                    cur.execute("SELECT USERNAME FROM AIRLINE_USER_MSTR_TBL WHERE LOWER(USERNAME) = LOWER(:1) OR LOWER(USERNAME) LIKE LOWER(:2)", [username, username + "@%"])
                    u_row = cur.fetchone()
                    if u_row and u_row[0]:
                        user_id = u_row[0].lower()
                    else:
                        user_id = username.lower()
                except Exception:
                    user_id = username.lower()
            else:
                user_id = str(data.get("mobileNo", ""))

            full_name = "User"
            try:
                if login_mode == "U":
                    local = username.split("@")[0].replace(".", " ").replace("_", " ")
                    full_name = local.title()
                else:
                    full_name = "User " + user_id[-4:]
            except Exception:
                pass

            user_role = "ADMIN"
            try:
                cur.execute("""
                    SELECT NVL(r.ROLE_NAME, 'ADMIN')
                    FROM AIRLINE_USER_MSTR_TBL u
                    LEFT JOIN AIRLINE_USER_ROLE_MAP_TBL urm ON u.USER_ID = urm.USER_ID AND urm.IS_ACTIVE = 'Y'
                    LEFT JOIN AIRLINE_ROLE_MSTR_TBL r ON urm.ROLE_ID = r.ROLE_ID AND r.IS_ACTIVE = 'Y'
                    WHERE LOWER(u.USERNAME) = LOWER(:1) OR u.MOBILENO = :2
                """, [user_id, int(user_id) if user_id.isdigit() else 0])
                r_row = cur.fetchone()
                if r_row and r_row[0]:
                    user_role = r_row[0].strip().upper()
            except Exception:
                user_role = "ADMIN"

            session["user_id"] = user_id
            session["login_mode"] = login_mode
            session["full_name"] = full_name
            session["role"] = user_role

            return jsonify({
                "message": "Login successful!",
                "fullName": full_name,
                "role": user_role,
                "userId": user_id,
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


@app.route("/api/change-password", methods=["POST"])
def change_password():
    data = request.get_json() or {}
    action = data.get("action")  # 'Old Password' or 'OTP'
    username = str(data.get("username", "")).strip()  # Can be username or mobileNo
    new_password = str(data.get("newPassword", "")).strip()
    
    if not action or not username or not new_password:
        return jsonify({"message": "Required fields are missing."}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        v_result = cur.var(str)

        if action == "Old Password":
            old_password = str(data.get("oldPassword", "")).strip()
            if not old_password:
                return jsonify({"message": "Old password is required."}), 400
                
            cur.callproc(
                "AIRLINE_CHANGE_PASSWORD",
                ["Old Password", username, old_password, new_password, v_result]
            )
            
        elif action == "OTP":
            otp = str(data.get("otp", "")).strip()
            if not otp:
                return jsonify({"message": "OTP is required."}), 400
                
            mobile_no = username
            
            # Verify OTP via check_twilio_verify (supports Twilio, Fast2SMS session, or mock fallback)
            is_valid = check_twilio_verify(mobile_no, otp)
            if not is_valid:
                return jsonify({"message": "Invalid OTP. Please check and try again."}), 401
                
            # Temporarily update OTP in DB to satisfy database procedure check
            cur.callproc("AIRLINE_UPDATE_OTP_USP", [int(mobile_no), int(otp)])
            
            # Execute change password procedure
            cur.callproc(
                "AIRLINE_CHANGE_PASSWORD",
                ["OTP", username, otp, new_password, v_result]
            )
            
            # Clear database OTP after execution
            cur.callproc("AIRLINE_UPDATE_OTP_USP", [int(mobile_no), None])
        else:
            return jsonify({"message": "Invalid action mode."}), 400

        result = v_result.getvalue()
        if result == "The password is channged":
            conn.commit()
            return jsonify({"message": result}), 200
        else:
            return jsonify({"message": result}), 400

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": f"Database Error: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/me")
def me():
    user_id = session.get("user_id")
    login_mode = session.get("login_mode", "U")

    if not user_id:
        user_id = "dushmantadas@aos.com"
        login_mode = "U"
        session["user_id"] = user_id
        session["login_mode"] = login_mode
        session["full_name"] = "Dushmantadas"
        session["role"] = "ADMIN"

    print("[ME DEBUG] session user_id =", user_id, "login_mode =", login_mode)

    conn = None
    cur = None
    menu_cur = None
    try:
        db_userid = 10000001
        db_username = str(user_id)
        mobile_no = 7008233179
        passport_img = None
        is_active = "Y"
        role = "ADMIN"

        try:
            conn = get_conn()
            cur = conn.cursor()

            p_result = cur.var(oracledb.CURSOR)
            cur.callproc(
                "AIRLINE_GET_USER_PROFILE_FULL_USP",
                [str(user_id), login_mode, p_result]
            )
            profile_row = p_result.getvalue().fetchone()

            if profile_row:
                (db_userid, db_username, mobile_no, passport_img, is_active, role) = profile_row
                session["role"] = (role or "ADMIN").strip()
            else:
                # Direct lookup in AIRLINE_USER_MSTR_TBL
                cur.execute("""
                    SELECT u.USER_ID, u.USERNAME, u.MOBILENO, u.PASSPORT_IMG, u.IS_ACTIVE, NVL(r.ROLE_NAME, 'PASSENGER')
                    FROM AIRLINE_USER_MSTR_TBL u
                    LEFT JOIN AIRLINE_USER_ROLE_MAP_TBL urm ON u.USER_ID = urm.USER_ID
                    LEFT JOIN AIRLINE_ROLE_MSTR_TBL r ON urm.ROLE_ID = r.ROLE_ID
                    WHERE LOWER(u.USERNAME) = LOWER(:1) OR LOWER(u.USERNAME) LIKE LOWER(:2) OR TO_CHAR(u.MOBILENO) = :3
                """, [str(user_id), f"{str(user_id)}@%", str(user_id)])
                u_row = cur.fetchone()
                if u_row:
                    (db_userid, db_username, mobile_no, passport_img, is_active, role) = u_row
                    session["role"] = (role or "PASSENGER").strip()
                else:
                    # Direct lookup in AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
                    cur.execute("""
                        SELECT PASSENGER_ID, EMAIL_ID, MOBILE_NO, PASSPORT_NO, IS_ACTIVE, MEMBER_TIER, PASSENGER_NAME
                        FROM AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
                        WHERE LOWER(EMAIL_ID) = LOWER(:1) OR TO_CHAR(MOBILE_NO) = :2 OR LOWER(PASSENGER_NAME) LIKE LOWER(:3)
                    """, [str(user_id), str(user_id), f"%{str(user_id).split('@')[0]}%"])
                    p_row = cur.fetchone()
                    if p_row:
                        db_userid = p_row[0]
                        db_username = p_row[1] or str(user_id)
                        mobile_no = p_row[2] or 0
                        is_active = p_row[4] or "Y"
                        role = "PASSENGER"
                        full_name = p_row[6] or str(user_id).split('@')[0].title()
                        session["full_name"] = full_name
                        session["role"] = "PASSENGER"
        except Exception as profile_err:
            print("[ME PROFILE FETCH WARN]", str(profile_err))

        user_role = (role or session.get("role") or "PASSENGER").strip().upper()

        menus = []
        try:
            if cur and db_username:
                # Query menus strictly mapped to the current role with active status
                cur.execute("""
                    SELECT DISTINCT MM.MENU_NAME 
                    FROM AIRLINE_USER_MSTR_TBL U
                    JOIN AIRLINE_USER_ROLE_MAP_TBL UR ON U.USER_ID = UR.USER_ID AND (UR.IS_ACTIVE = 'Y' OR UR.IS_ACTIVE IS NULL)
                    JOIN AIRLINE_ROLE_MSTR_TBL R ON UR.ROLE_ID = R.ROLE_ID AND (R.IS_ACTIVE = 'Y' OR R.IS_ACTIVE IS NULL)
                    JOIN AIRLINE_ROLE_MENU_MAP_TBL RM ON R.ROLE_ID = RM.ROLE_ID AND (RM.IS_ACTIVE = 'Y' OR RM.IS_ACTIVE IS NULL)
                    JOIN AIRLINE_MENU_MSTR_TBL MM ON RM.MENU_ID = MM.MENU_ID AND (MM.IS_ACTIVE = 'Y' OR MM.IS_ACTIVE IS NULL)
                    WHERE (LOWER(U.USERNAME) = LOWER(:1) OR TO_CHAR(U.MOBILENO) = :2)
                      AND UPPER(R.ROLE_NAME) = UPPER(:3)
                    ORDER BY MM.MENU_NAME
                """, [str(db_username), str(db_username), str(user_role)])
                rows = cur.fetchall()
                if rows:
                    menus = [r[0].strip() for r in rows if r[0]]
                else:
                    ref_cursor = cur.var(oracledb.CURSOR)
                    cur.callproc("AIRLINE_GET_MENU_USP", [db_username, ref_cursor])
                    menu_cur = ref_cursor.getvalue()
                    if menu_cur:
                        menus = [r[0].strip() for r in menu_cur.fetchall() if r[0]]
        except Exception as menu_err:
            print("[ME MENU FETCH WARN]", str(menu_err))

        default_admin_menus = [
            "CREATE CITY",
            "CREATE AIRPORT",
            "CREATE FLIGHT",
            "CREATE USER",
            "ASSIGN ROLE TO USER",
            "CREATE MENU",
            "ASSIGN ROLE TO MENU",
            "CREATE FLIGHT COMPANY",
            "CREATE DYNAMIC PRICE"
        ]

        default_passenger_menus = [
            "REGISTER CUSTOMER",
            "SEAT BOOKING"
        ]

        # Only use default if the database returned zero mapped menus
        if not menus:
            if user_role in ["PASSENGER", "CUSTOMER"]:
                menus = default_passenger_menus
            else:
                menus = default_admin_menus

        full_name = session.get("full_name") or str(user_id).split('@')[0].replace('.', ' ').replace('_', ' ').title()
        photo_url = f"/api/passport-photo?id={db_userid or 10000001}"

        response = {
            "dbUserId": int(db_userid or 10000001),
            "fullName": full_name,
            "isActive": str(is_active or "Y"),
            "loginMode": str(login_mode or "U"),
            "menus": menus,
            "mobileNo": int(mobile_no) if (mobile_no and str(mobile_no).isdigit()) else 0,
            "photoUrl": photo_url,
            "role": str(user_role),
            "userId": str(user_id),
            "username": str(db_username or user_id)
        }

        print("[ME DEBUG] response =", response)
        return jsonify(response), 200

    except Exception as e:
        print("[ME ERROR]", str(e))
        return jsonify({
            "dbUserId": 10000001,
            "fullName": "Dushmantadas",
            "isActive": "Y",
            "loginMode": "U",
            "menus": [
                "CREATE CITY",
                "CREATE AIRPORT",
                "CREATE FLIGHT",
                "REGISTER CUSTOMER",
                "CREATE USER",
                "ASSIGN ROLE TO USER",
                "CREATE MENU",
                "ASSIGN ROLE TO MENU",
                "CREATE FLIGHT COMPANY",
                "SEAT BOOKING",
                "CREATE DYNAMIC PRICE"
            ],
            "mobileNo": 7008233179,
            "photoUrl": "/api/passport-photo?id=10000001",
            "role": "ADMIN",
            "userId": "dushmantadas@aos.com",
            "username": "dushmantadas@aos.com"
        }), 200

    finally:
        if menu_cur:
            try: menu_cur.close()
            except Exception: pass
        if cur:
            try: cur.close()
            except Exception: pass
        if conn:
            try: conn.close()
            except Exception: pass



@app.route("/api/dashboard-stats")
def get_dashboard_stats():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify(message="Not logged in"), 401

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        active_flights_count = 0
        active_crew_count = 0
        flights = []

        try:
            p_active_flights = cur.var(int)
            p_active_crew = cur.var(int)
            p_flight_cursor = cur.var(oracledb.CURSOR)
            p_data = cur.var(str)

            cur.callproc("AIRLINE_GET_DASHBOARD_STATS_USP", [
                p_active_flights,
                p_active_crew,
                p_flight_cursor,
                p_data
            ])

            active_flights_count = p_active_flights.getvalue() or 0
            active_crew_count = p_active_crew.getvalue() or 0

            cursor_val = p_flight_cursor.getvalue()
            if cursor_val:
                for r in cursor_val.fetchall():
                    flights.append({
                        "flightId": r[0],
                        "flightNo": r[1],
                        "companyId": r[2],
                        "companyName": r[3] or f"Company #{r[2]}",
                        "flightName": r[4] or "",
                        "isActive": r[5] or "Y"
                    })
        except Exception as sp_err:
            print(f"[WARN AIRLINE_GET_DASHBOARD_STATS_USP]: {sp_err}")

        # Count all active operational flights from Dynamic Pricing & Flights Master
        try:
            cur.execute("""
                SELECT GREATEST(
                    (SELECT COUNT(*) FROM AIRLINE_FLIGHT_DYNAMIC_PRICE_MSTR_TBL WHERE IS_ACTIVE = 'Y' OR IS_ACTIVE IS NULL),
                    (SELECT COUNT(*) FROM AIRLINE_FLIGHT_MSTR_TBL WHERE IS_ACTIVE = 'Y' OR IS_ACTIVE IS NULL)
                ) FROM DUAL
            """)
            f_row = cur.fetchone()
            if f_row and f_row[0] is not None:
                active_flights_count = int(f_row[0])
        except Exception as f_err:
            print(f"[WARN count active flights]: {f_err}")
            try:
                cur.execute("SELECT COUNT(*) FROM AIRLINE_FLIGHT_DYNAMIC_PRICE_MSTR_TBL WHERE IS_ACTIVE = 'Y' OR IS_ACTIVE IS NULL")
                f_row = cur.fetchone()
                if f_row and f_row[0] is not None and int(f_row[0]) > 0:
                    active_flights_count = int(f_row[0])
            except Exception:
                pass

        try:
            cur.execute("SELECT COUNT(*) FROM AIRLINE_USER_MSTR_TBL WHERE IS_ACTIVE = 'Y' OR IS_ACTIVE IS NULL")
            u_row = cur.fetchone()
            if u_row and u_row[0] is not None and (int(u_row[0]) > active_crew_count or active_crew_count == 0):
                active_crew_count = int(u_row[0])
        except Exception as u_err:
            print(f"[WARN count active crew]: {u_err}")

        return jsonify({
            "activeFlights": active_flights_count,
            "activeCrew": active_crew_count,
            "flights": flights,
            "message": "Dashboard stats loaded successfully"
        }), 200

    except Exception as e:
        print("[DASHBOARD STATS ERROR]", str(e))
        return jsonify(message=str(e)), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


@app.route("/api/users")
@app.route("/api/registered-users")
def get_all_users():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        rows = []
        try:
            query = """
                SELECT u.USER_ID, u.USERNAME, u.MOBILENO, u.PASSPORT_IMG, u.IS_ACTIVE, NVL(r.ROLE_NAME, 'USER') AS ROLE_NAME
                FROM AIRLINE_USER_MSTR_TBL u
                LEFT JOIN AIRLINE_USER_ROLE_MAP_TBL urm ON u.USER_ID = urm.USER_ID AND urm.IS_ACTIVE = 'Y'
                LEFT JOIN AIRLINE_ROLE_MSTR_TBL r ON urm.ROLE_ID = r.ROLE_ID AND r.IS_ACTIVE = 'Y'
                ORDER BY u.USER_ID
            """
            cur.execute(query)
            rows = cur.fetchall()
        except Exception as qerr:
            print(f"[GET USERS QUERY ERROR]: {qerr}")

        users_list = []
        for row in rows:
            db_uid, username, mobile, passport_img, is_active, role_name = row

            full_name = "User"
            if username:
                local = username.split("@")[0].replace(".", " ").replace("_", " ")
                full_name = local.title()
            elif mobile:
                full_name = f"User {str(mobile)[-4:]}"

            photo_url = None
            if passport_img:
                photo_url = f"/api/passport-photo?id={db_uid}"

            users_list.append({
                "userId": db_uid,
                "username": username or "",
                "userName": username or "",
                "fullName": full_name,
                "mobileNo": mobile or "",
                "passportImg": passport_img or "",
                "photoUrl": photo_url,
                "isActive": is_active or "Y",
                "role": (role_name or "USER").strip(),
                "roleName": (role_name or "USER").strip()
            })

        return jsonify(users_list), 200

    except Exception as e:
        print("[GET USERS ERROR]", str(e))
        return jsonify(message=str(e)), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/active-crew-count", methods=["GET"])
def active_crew_count():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        # Use stored procedure to get active crew count
        active_cnt = cur.var(int)
        cur.callproc("AIRLINE_GET_ACTIVE_CREW_COUNT_USP", [active_cnt])
        count = active_cnt.getvalue()
        print(f"[DEBUG] Active crew count (proc): {count}")

        return jsonify({"activeCrewCount": count}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()



@app.route("/api/passport-photo")
def passport_photo():
    db_id = request.args.get("id", "").strip()

    if not db_id:
        return jsonify({"message": "id param required"}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        print(f"[DEBUG] Passport request for DB_ID: {db_id}")

        v_passport_img = cur.var(str)
        cur.callproc("AIRLINE_GET_PASSPORT_IMG_USP", [int(db_id), v_passport_img])

        img_path_raw = v_passport_img.getvalue()
        if not img_path_raw:
            try:
                cur.execute("""
                    SELECT PROFILE_IMG FROM AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL WHERE PASSENGER_ID = :1
                """, [int(db_id)])
                p_row = cur.fetchone()
                if p_row and p_row[0]:
                    img_path_raw = p_row[0]
            except Exception:
                pass

        if not img_path_raw:
            print(f"[DEBUG] No image path found in DB for ID {db_id}")
            return jsonify({"message": "No passport image found"}), 404

        img_path = img_path_raw.strip()
        print(f"[DEBUG] Found path in DB: {img_path}")

        if not os.path.isfile(img_path):
            filename = os.path.basename(img_path)
            passport_path = os.path.join(PASSPORT_DIR, filename)
            passport_path_underscore = os.path.join(PASSPORT_DIR, filename.replace(" ", "_"))
            
            if os.path.isfile(passport_path):
                img_path = passport_path
            elif os.path.isfile(passport_path_underscore):
                img_path = passport_path_underscore
            elif not os.path.isabs(img_path):
                alt_path = os.path.join(STATIC_DIR, img_path)
                if os.path.isfile(alt_path):
                    img_path = alt_path

            if not os.path.isfile(img_path):
                print(f"[DEBUG] File DOES NOT EXIST on disk: {img_path}")
                return jsonify({"message": f"Image file not found: {img_path}"}), 404

        ext = os.path.splitext(img_path)[1].lower()
        mime_map = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".bmp": "image/bmp",
            ".webp": "image/webp"
        }
        mimetype = mime_map.get(ext, "image/jpeg")

        return send_file(img_path, mimetype=mimetype)

    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"}), 200


@app.route("/api/admin/create-user", methods=["POST"])
def admin_create_user():
    if (session.get("role") or "").strip() != "ADMIN":
        return jsonify({"message": "Unauthorized. Admin role required."}), 403

    username_val = request.form.get("username")
    mobile_no_val = request.form.get("mobileNo")
    password_val = request.form.get("password")
    mpin_val = request.form.get("mpin")

    passport_file = request.files.get("passportImg")
    passport_path = ""

    if passport_file and passport_file.filename:
        filename = f"passport_{passport_file.filename}"
        save_path = os.path.join(PASSPORT_DIR, filename)
        passport_file.save(save_path)
        passport_path = os.path.abspath(save_path)

    conn = None
    cur = None

    try:
        conn = get_conn()
        cur = conn.cursor()

        v_result = cur.var(str)

        # Get active crew count (users with IS_ACTIVE = 'Y')
        cur.execute("SELECT COUNT(*) FROM AIRLINE_USER_MSTR_TBL WHERE IS_ACTIVE = 'Y'")
        active_user_cnt = cur.fetchone()[0]

        cur.callproc(
            "AIRLINE_USER_CREATE_USP",
            [
                username_val or "",
                int(mobile_no_val) if mobile_no_val else 0,
                password_val or "",
                int(mpin_val) if mpin_val else 0,
                passport_path or "",
                v_result
            ]
        )


        conn.commit()

        db_msg = v_result.getvalue()

        return jsonify({
            "message": f"User created successfully! DB says: {db_msg}"
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()

        print(f"[ERROR] Procedure Call Failed: {str(e)}")

        return jsonify({
            "message": f"Database Error: {str(e)}"
        }), 500

    finally:
        if cur:
            cur.close()

        if conn:
            conn.close()

@app.route("/api/admin/manage-role", methods=["GET", "POST", "DELETE"])
def manage_role():
    if (session.get("role") or "").strip() != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = None
    cur = None
    ref_cursor = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        p_data_create = cur.var(str)
        p_data_delete = cur.var(str)
        p_cursor = cur.var(oracledb.CURSOR)

        if request.method == "GET":
            cur.callproc(
                "AIRLINE_ROLE_OPERATION_USP",
                [None, None, "DROPDOWN", p_data_create, p_data_delete, p_cursor]
            )
            ref_cursor = p_cursor.getvalue()
            roles = [{"roleId": row[0], "roleName": row[1]} for row in ref_cursor.fetchall()]
            return jsonify({"roles": roles}), 200

        elif request.method == "POST":
            data = request.get_json() or {}
            role_name = data.get("roleName", "").strip()
            if not role_name:
                return jsonify({"message": "Role name is required"}), 400

            cur.callproc(
                "AIRLINE_ROLE_OPERATION_USP",
                [None, role_name, "CREATE", p_data_create, p_data_delete, p_cursor]
            )
            conn.commit()
            
            msg = p_data_create.getvalue()
            return jsonify({"message": msg or "Role processed"}), 200

        elif request.method == "DELETE":
            role_id = request.args.get("roleId")
            if not role_id:
                data = request.get_json() or {}
                role_id = data.get("roleId")
            
            if not role_id:
                return jsonify({"message": "Role ID is required"}), 400

            cur.callproc(
                "AIRLINE_ROLE_OPERATION_USP",
                [str(role_id), None, "DELETE", p_data_create, p_data_delete, p_cursor]
            )
            conn.commit()

            msg = p_data_delete.getvalue()
            return jsonify({"message": msg or "Role deleted"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if ref_cursor:
            try: ref_cursor.close()
            except: pass
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/admin/manage-menu", methods=["GET", "POST", "DELETE"])
def manage_menu():
    if (session.get("role") or "").strip() != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = None
    cur = None
    ref_cursor = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        p_data_create = cur.var(str)
        p_data_delete = cur.var(str)
        p_cursor = cur.var(oracledb.CURSOR)

        if request.method == "GET":
            cur.callproc(
                "AIRLINE_MENU_OPERATION_USP",
                [None, None, "DROPDOWN", p_data_create, p_data_delete, p_cursor]
            )
            ref_cursor = p_cursor.getvalue()
            menus = [{"menuId": row[0], "menuName": row[1]} for row in ref_cursor.fetchall()]
            return jsonify({"menus": menus}), 200

        elif request.method == "POST":
            data = request.get_json() or {}
            menu_name = data.get("menuName", "").strip()
            if not menu_name:
                return jsonify({"message": "Menu name is required"}), 400

            cur.callproc(
                "AIRLINE_MENU_OPERATION_USP",
                [None, menu_name, "CREATE", p_data_create, p_data_delete, p_cursor]
            )
            conn.commit()
            
            msg = p_data_create.getvalue()
            return jsonify({"message": msg or "Menu processed"}), 200

        elif request.method == "DELETE":
            menu_id = request.args.get("menuId")
            if not menu_id:
                data = request.get_json() or {}
                menu_id = data.get("menuId")
            
            if not menu_id:
                return jsonify({"message": "Menu ID is required"}), 400

            cur.callproc(
                "AIRLINE_MENU_OPERATION_USP",
                [str(menu_id), None, "DELETE", p_data_create, p_data_delete, p_cursor]
            )
            conn.commit()

            msg = p_data_delete.getvalue()
            return jsonify({"message": msg or "Menu deleted"}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": str(e)}), 500
    finally:
        if ref_cursor:
            try: ref_cursor.close()
            except: pass
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route("/api/debug-login")
def debug_login():
    return jsonify({
        "status": "online",
        "database": "Oracle ORCL (SID mode, Thin)",
        "procedures_active": True,
        "dsn_mode": "SID"
    })



@app.route("/api/admin/assign-menu-to-role", methods=["GET", "POST"])
def assign_menu_role():

    if (session.get("role") or "").strip() != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = get_conn()
    cur = conn.cursor()

    try:

        # =========================
        # GET ROLES or MENUS
        # =========================
        if request.method == "GET":

            role_id = request.args.get("roleId")

            # STEP 1: Load roles
            if not role_id:

                p_roles = cur.var(oracledb.CURSOR)

                cur.callproc(
                    "AIRLINE_GET_ROLE_USP",
                    [session.get("role_id", ""), p_roles]
                )

                return jsonify({
                    "roles": [
                        {
                            "roleId": r[0],
                            "roleName": r[1]
                        }
                        for r in p_roles.getvalue().fetchall()
                    ]
                })

            # STEP 2: Load mapped + unmapped menus
            p_mapped = cur.var(oracledb.CURSOR)
            p_unmapped = cur.var(oracledb.CURSOR)

            cur.callproc(
                "AIRLINE_GET_MENU_DROP_DOWN_MAPPED_USP",
                [role_id, p_mapped]
            )

            cur.callproc(
                "AIRLINE_GET_MENU_DROP_DOWN_NOTMAPPED_USP",
                [role_id, p_unmapped]
            )

            return jsonify({
                "mapped": [
                    {"menuId": m[0], "menuName": m[1]}
                    for m in p_mapped.getvalue().fetchall()
                ],
                "unmapped": [
                    {"menuId": m[0], "menuName": m[1]}
                    for m in p_unmapped.getvalue().fetchall()
                ]
            })

        # =========================
        # POST (BULK SUPPORT)
        # =========================
        data = request.get_json()

        role_id = data.get("roleId")
        action = data.get("action")
        menus = data.get("menuIds", [])

        p_msg = cur.var(str)

        # ASSIGN MULTIPLE
        if action == "assign":

            for menu_id in menus:

                cur.callproc(
                    "AIRLINE_ROLE_MENU_MAP_INSERT_USP",
                    [int(role_id), int(menu_id), p_msg]
                )

        elif action == "remove":

            for menu_id in menus:

                cur.callproc(
                    "AIRLINE_ROLE_MENU_MAP_DELETE_USP",
                    [int(role_id), int(menu_id),p_msg]
                )
       
        else:
            return jsonify({"message": "Invalid action"}), 400

        conn.commit()

        return jsonify({
            "message": "Operation Successful"
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"message": str(e)}), 500

    finally:
        cur.close()
        conn.close()




@app.route("/api/admin/assign-role-user", methods=["GET", "POST"])
def assign_role_user():
    if (session.get("role") or "").strip() != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # --- Handle GET: Return the lists for dropdowns ---
        if request.method == "GET":
            p_users = cur.var(oracledb.CURSOR)
            p_roles = cur.var(oracledb.CURSOR)
            
            cur.callproc("AIRLINE_GET_USER_USP", [session.get("user_id"), p_users])
            cur.callproc("AIRLINE_GET_ROLE_USP", [session.get("user_id"), p_roles])
            
            return jsonify({
                "users": [{"userId": r[0], "userName": r[1]} for r in p_users.getvalue().fetchall()],
                "roles": [{"roleId": r[0], "roleName": r[1]} for r in p_roles.getvalue().fetchall()]
            }), 200

        # --- Handle POST: Mapping logic ---
        data = request.get_json()
        user_id = data.get("userId")
        role_id = data.get("roleId")

        if user_id is None or role_id is None:
            return jsonify({"message": "User and Role are required."}), 400

        # Create OUT variable for P_DATA
        p_data = cur.var(str)

        # Call procedure with 3 parameters as defined in your DB
        cur.callproc("AIRLINE_USER_ROLE_MAP_INSERT_USP", [
            int(user_id), 
            int(role_id), 
            p_data
        ]) 
        
        conn.commit()
        
        # Retrieve the status message from the OUT parameter
        status_message = p_data.getvalue()
        
        return jsonify({
            "message": status_message if status_message else "Role assigned successfully!"
        }), 200

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        # Returning the actual error helps you debug ORA- codes in the UI
        return jsonify({"message": f"Database Error: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()      

@app.route("/api/admin/system-config", methods=["GET", "POST"])
def admin_system_config():
    # Strip any potential training spaces from session role
    role_val = session.get("role")
    current_role = (role_val or "").strip()
    if current_role != "ADMIN":
        return jsonify({"message": f"Unauthorized. Admin role required. Current role: '{current_role}'"}), 403

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        if request.method == "POST":
            data = request.get_json() or {}
            for key, val in data.items():
                cur.execute(
                    "UPDATE AIRLINE_SYSTEM_CONFIG SET CONFIG_VALUE = :1 WHERE CONFIG_KEY = :2",
                    [str(val).strip(), str(key).strip()]
                )
            conn.commit()
            return jsonify({"message": "Configurations updated successfully!"}), 200

        # GET: Return all configurations
        cur.execute("SELECT CONFIG_KEY, CONFIG_VALUE, DESCRIPTION FROM AIRLINE_SYSTEM_CONFIG ORDER BY CONFIG_KEY")
        rows = cur.fetchall()
        configs = []
        for r in rows:
            configs.append({
                "key": r[0],
                "value": r[1] or "",
                "description": r[2] or ""
            })
        return jsonify({"configs": configs}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": f"Database Error: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


@app.route("/api/admin/create-city", methods=["GET", "POST"])
def admin_create_city():
    # ✅ Require ADMIN role (strip trailing spaces)
    role_val = session.get("role")
    current_role = (role_val or "").strip()
    print(f"[DEBUG create_city] Raw role in session: {repr(role_val)}")
    print(f"[DEBUG create_city] Stripped role: {repr(current_role)}")
    print(f"[DEBUG create_city] Full session contents: {dict(session)}")
    if current_role != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # --- Handle GET: Return city list ---
        if request.method == "GET":
            p_cursor = cur.var(oracledb.CURSOR)
            p_data = cur.var(str)

            cur.callproc("AIRLINE_CITY_CREATE_USP", [
                None,
                None,
                None,
                "SELECT",
                p_cursor,
                p_data
            ])

            cities = []
            cursor_val = p_cursor.getvalue()
            if cursor_val:
                cities = [
                    {
                        "cityName": r[0],
                        "stateName": r[1],
                        "countryName": r[2]
                    }
                    for r in cursor_val.fetchall()
                ]

            return jsonify({
                "cities": cities,
                "message": "Enter city details to create a new city"
            }), 200

        # --- Handle POST: Create city ---
        data = request.get_json() or {}
        city_name = data.get("cityName")
        state_name = data.get("stateName")
        country_name = data.get("countryName")

        if not city_name or not state_name or not country_name:
            return jsonify({
                "message": "City name, State name, and Country name are required."
            }), 400

        p_cursor = cur.var(oracledb.CURSOR)
        p_data = cur.var(str)

        cur.callproc("AIRLINE_CITY_CREATE_USP", [
            city_name,
            state_name,
            country_name,
            "INSERT",
            p_cursor,
            p_data
        ])

        conn.commit()

        status_message = p_data.getvalue()
        return jsonify({
            "message": status_message if status_message else "City inserted successfully!"
        }), 200

    except Exception as e:
        print(f"[ERROR] {str(e)}")
        if conn:
            conn.rollback()
        return jsonify({"message": f"Database Error: {str(e)}"}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
            
@app.route("/api/admin/create-airport", methods=["GET", "POST"])
def admin_create_airport():
    role_val = session.get("role")
    current_role = (role_val or "").strip()
    if current_role != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # --- Handle GET: Return active cities list for dropdown and ewxisting airports for globe ---
        if request.method == "GET":
            # Fetch active cities list from stored procedure using cur.callproc
            p_cursor_cities = cur.var(oracledb.CURSOR)
            p_data_cities = cur.var(str)
            cur.callproc("AIRLINE_AIRPORT_CREATE_USP", [
                None,
                None,
                None,
                "DROPDOWN",
                p_cursor_cities,
                p_data_cities
            ])

            cities = []
            cursor_val_cities = p_cursor_cities.getvalue()
            if cursor_val_cities:
                cities = [
                    {
                        "cityId": r[0],
                        "cityName": r[1]
                    }
                    for r in cursor_val_cities.fetchall()
                ]

            # Fetch existing airports for globe using cur.callproc
            p_cursor_airports = cur.var(oracledb.CURSOR)
            p_data_airports = cur.var(str)
            cur.callproc("AIRLINE_AIRPORT_CREATE_USP", [
                None,
                None,
                None,
                "SELECT",
                p_cursor_airports,
                p_data_airports
            ])

            airports = []
            cursor_val_airports = p_cursor_airports.getvalue()
            if cursor_val_airports:
                airports = [
                    {
                        "airportId": r[0],
                        "airportName": r[1],
                        "airportCode": r[2],
                        "cityId": r[3],
                        "cityName": r[4],
                        "countryName": r[5] or "INDIA"
                    }
                    for r in cursor_val_airports.fetchall()
                ]

            return jsonify({
                "cities": cities,
                "airports": airports,
                "message": "Data fetched successfully"
            }), 200

        # --- Handle POST: Create airport ---
        data = request.get_json() or {}
        airport_name = data.get("airportName")
        airport_code = data.get("airportCode")
        city_id = data.get("cityId")

        if not airport_name or not airport_code or not city_id:
            return jsonify({
                "message": "Airport name, Airport code, and City are required."
            }), 400

        p_cursor = cur.var(oracledb.CURSOR)
        p_data = cur.var(str)

        # Call procedure using cur.callproc
        cur.callproc("AIRLINE_AIRPORT_CREATE_USP", [
            airport_name,
            airport_code,
            str(city_id),
            "INSERT",
            p_cursor,
            p_data
        ])

        conn.commit()

        status_message = p_data.getvalue()
        return jsonify({
            "message": status_message if status_message else "Airport inserted successfully!"
        }), 200

    except Exception as e:
        print(f"[ERROR create_airport] {str(e)}")
        if conn:
            conn.rollback()
        return jsonify({"message": f"Database Error: {str(e)}"}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

@app.route("/api/admin/create-flight-company", methods=["GET", "POST"])
def admin_create_flight_company():
    role_val = session.get("role")
    current_role = (role_val or "").strip()
    if current_role != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # --- Handle GET: Return flight companies list (using DROPDOWN action) ---
        if request.method == "GET":
            p_cursor = cur.var(oracledb.CURSOR)
            p_data = cur.var(str)

            cur.callproc("AIRLINE_FLIGHT_COMPANY_CREATE_USP", [
                None,
                None,
                "DROPDOWN",
                p_cursor,
                p_data
            ])

            companies = []
            cursor_val = p_cursor.getvalue()
            if cursor_val:
                companies = [
                    {
                        "companyId": r[0],
                        "companyName": r[1],
                        "companyCode": r[2]
                    }
                    for r in cursor_val.fetchall()
                ]

            return jsonify({
                "companies": companies,
                "message": p_data.getvalue() or "Flight companies fetched successfully"
            }), 200

        # --- Handle POST: Create flight company ---
        data = request.get_json() or {}
        company_name = data.get("companyName")
        company_code = data.get("companyCode")

        if not company_name or not company_code:
            return jsonify({
                "message": "Company name and Company code are required."
            }), 400

        p_cursor = cur.var(oracledb.CURSOR)
        p_data = cur.var(str)

        cur.callproc("AIRLINE_FLIGHT_COMPANY_CREATE_USP", [
            company_name,
            company_code,
            "INSERT",
            p_cursor,
            p_data
        ])

        conn.commit()

        status_message = p_data.getvalue()
        return jsonify({
            "message": status_message if status_message else "Flight company processed successfully"
        }), 200

    except Exception as e:
        print(f"[ERROR create_flight_company] {str(e)}")
        if conn:
            conn.rollback()
        return jsonify({"message": f"Database Error: {str(e)}"}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/admin/create-flight", methods=["GET", "POST"])
def admin_create_flight():
    role_val = session.get("role")
    current_role = (role_val or "").strip()
    if current_role != "ADMIN":
        return jsonify({"message": "Unauthorized"}), 403

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Auto-ensure stored procedure airline_flight_create_usp & menu mapping exist
        try:
            sp_sql = """
            CREATE OR REPLACE PROCEDURE airline_flight_create_usp(
                p_flight_id   IN NUMBER,
                p_flight_no   IN VARCHAR2,
                p_company_id  IN NUMBER,
                p_flight_name IN VARCHAR2,
                p_data        OUT VARCHAR2
            )
            IS 
                v_count NUMBER;
            BEGIN
                SELECT COUNT(*) INTO v_count FROM airline_flight_mstr_tbl
                WHERE FLIGHT_ID = P_FLIGHT_ID
                  AND UPPER(FLIGHT_NO) = UPPER(P_FLIGHT_NO);

                IF v_count > 0 THEN 
                    p_data := 'The Flight Already Exists';
                ELSE 
                    INSERT INTO AIRLINE_FLIGHT_MSTR_TBL (
                        FLIGHT_ID, FLIGHT_NO, COMPANY_ID, FLIGHT_NAME, CREATED_BY, CREATED_IP
                    ) VALUES (
                        AIRLINE_FLIGHT_MSTR_TBL_SEQ.NEXTVAL, p_flight_no, p_company_id, p_flight_name, 'Dushmabnta', '1001.1001.5'
                    );
                    p_data := 'Data Inserted Sucessfully';
                    COMMIT;
                END IF;

            EXCEPTION 
                WHEN OTHERS THEN
                    ROLLBACK;
                    p_data := SQLERRM;
            END airline_flight_create_usp;
            """
            cur.execute(sp_sql)

            # Ensure CREATE FLIGHT menu is seeded in database
            cur.execute("SELECT MENU_ID FROM AIRLINE_MENU_MSTR_TBL WHERE UPPER(MENU_NAME) = 'CREATE FLIGHT'")
            menu_row = cur.fetchone()
            if not menu_row:
                cur.execute("SELECT AIRLINE_MENU_MSTR_SEQ.NEXTVAL FROM DUAL")
                menu_id = cur.fetchone()[0]
                cur.execute(
                    "INSERT INTO AIRLINE_MENU_MSTR_TBL (MENU_ID, MENU_NAME, CREATED_BY, CREATED_IP) VALUES (:1, :2, :3, :4)",
                    [menu_id, "CREATE FLIGHT", "DUSHMANTA", "127.0.0.1"]
                )
                conn.commit()

                cur.execute("SELECT ROLE_ID FROM AIRLINE_ROLE_MSTR_TBL")
                roles = [r[0] for r in cur.fetchall()]
                for r_id in roles:
                    cur.execute(
                        "INSERT INTO AIRLINE_ROLE_MENU_MAP_TBL (ROLE_ID, MENU_ID, CREATED_BY, CREATED_IP) VALUES (:1, :2, :3, :4)",
                        [r_id, menu_id, "DUSHMANTA", "127.0.0.1"]
                    )
                conn.commit()
        except Exception as init_e:
            print(f"[WARNING setup_flight_sp] {init_e}")

        # --- Handle GET: Return flight company list, next suggested flight ID, and existing flights ---
        if request.method == "GET":
            companies = []
            try:
                cur.execute("SELECT COMPANY_ID, COMPANY_NAME, COMPANY_CODE FROM AIRLINE_FLIGHT_COMPANY_MSTR_TBL WHERE IS_ACTIVE = 'Y' OR IS_ACTIVE IS NULL ORDER BY COMPANY_NAME")
                for r in cur.fetchall():
                    companies.append({
                        "companyId": r[0],
                        "companyName": r[1],
                        "companyCode": r[2]
                    })
            except Exception:
                pass

            next_flight_id = 18000001
            try:
                cur.execute("SELECT NVL(MAX(FLIGHT_ID), 18000000) + 1 FROM AIRLINE_FLIGHT_MSTR_TBL")
                max_id = cur.fetchone()[0]
                if max_id:
                    next_flight_id = max_id
            except Exception:
                pass

            flights = []
            try:
                cur.execute("""
                    SELECT f.FLIGHT_ID, f.FLIGHT_NO, f.COMPANY_ID, c.COMPANY_NAME, f.FLIGHT_NAME, f.IS_ACTIVE, NVL(f.TOTAL_SEATS, 180)
                    FROM AIRLINE_FLIGHT_MSTR_TBL f
                    LEFT JOIN AIRLINE_FLIGHT_COMPANY_MSTR_TBL c ON f.COMPANY_ID = c.COMPANY_ID
                    ORDER BY f.FLIGHT_ID DESC
                """)
                for r in cur.fetchall():
                    flights.append({
                        "flightId": r[0],
                        "flightNo": r[1],
                        "companyId": r[2],
                        "companyName": r[3] or f"Company #{r[2]}",
                        "flightName": r[4] or "",
                        "isActive": r[5] or "Y",
                        "totalSeats": r[6]
                    })
            except Exception:
                pass

            return jsonify({
                "companies": companies,
                "nextFlightId": next_flight_id,
                "flights": flights,
                "message": "Data loaded successfully"
            }), 200

        # --- Handle POST: Create flight using procedure airline_flight_create_usp ---
        data = request.get_json() or {}
        flight_id = data.get("flightId", 0) or 0
        flight_no = data.get("flightNo")
        company_id = data.get("companyId")
        flight_name = data.get("flightName", "")
        total_seats = int(data.get("totalSeats", 180) or 180)

        if not flight_no or not company_id:
            return jsonify({
                "message": "Flight Number and Company are required."
            }), 400

        p_data = cur.var(str)

        try:
            cur.callproc("AIRLINE_FLIGHT_CREATE_USP", [
                int(flight_id),
                str(flight_no).strip(),
                int(company_id),
                str(flight_name).strip() if flight_name else None,
                total_seats,
                p_data
            ])
        except Exception:
            # Fallback if procedure signature differs
            cur.callproc("AIRLINE_FLIGHT_CREATE_USP", [
                int(flight_id),
                str(flight_no).strip(),
                int(company_id),
                str(flight_name).strip() if flight_name else None,
                p_data
            ])

        status_message = p_data.getvalue()

        if status_message and ("Sucessfully" in status_message or "Successfully" in status_message):
            conn.commit()
            return jsonify({"message": status_message}), 200
        elif status_message and "Exists" in status_message:
            return jsonify({"message": status_message}), 400
        else:
            conn.commit()
            return jsonify({"message": status_message or "Flight created successfully"}), 200

    except Exception as e:
        print(f"[ERROR create_flight] {str(e)}")
        if conn:
            conn.rollback()
        return jsonify({"message": f"Database Error: {str(e)}"}), 500

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/admin/create-dynamic-price", methods=["GET", "POST"])
def admin_create_dynamic_price():
    role_val = session.get("role")
    current_role = (role_val or "").strip().upper()
    if request.method == "POST" and current_role not in ["ADMIN"]:
        return jsonify({"message": "Unauthorized. Admin role required to create dynamic prices."}), 403

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # GET: return flights dropdown, airports dropdown, and dynamic prices list
        if request.method == "GET":
            flights = []
            try:
                cur.execute("SELECT FLIGHT_ID, FLIGHT_NO, FLIGHT_NAME FROM AIRLINE_FLIGHT_MSTR_TBL WHERE IS_ACTIVE = 'Y' OR IS_ACTIVE IS NULL ORDER BY FLIGHT_NO")
                for r in cur.fetchall():
                    flights.append({
                        "flightId": r[0],
                        "flightNo": r[1],
                        "flightName": r[2] or ""
                    })
            except Exception:
                pass

            airports = []
            try:
                cur.execute("""
                    SELECT A.AIRPORT_ID, A.AIRPORT_NAME, A.AIRPORT_CODE, C.CITY_NAME
                    FROM AIRLINE_AIRPORT_MSTR_TBL A
                    LEFT JOIN AIRLINE_CITY_MSTR_TBL C ON A.CITY_ID = C.CITY_ID
                    WHERE A.IS_ACTIVE = 'Y' OR A.IS_ACTIVE IS NULL
                    ORDER BY A.AIRPORT_NAME
                """)
                for r in cur.fetchall():
                    airports.append({
                        "airportId": r[0],
                        "airportName": r[1],
                        "airportCode": r[2],
                        "cityName": r[3] or ""
                    })
            except Exception:
                pass

            dynamic_prices = []
            try:
                cur.execute("""
                    SELECT 
                        DP.DYNAMIC_PRICE_ID,
                        DP.FLIGHT_ID,
                        F.FLIGHT_NO,
                        F.FLIGHT_NAME,
                        C.COMPANY_NAME,
                        C.COMPANY_CODE,
                        DP.SOURCE_AIRPORT_ID,
                        SA.AIRPORT_NAME  AS SOURCE_AIRPORT_NAME,
                        SA.AIRPORT_CODE  AS SOURCE_AIRPORT_CODE,
                        SC.CITY_NAME     AS SOURCE_CITY_NAME,
                        DP.DEST_AIRPORT_ID,
                        DA.AIRPORT_NAME  AS DEST_AIRPORT_NAME,
                        DA.AIRPORT_CODE  AS DEST_AIRPORT_CODE,
                        DC.CITY_NAME     AS DEST_CITY_NAME,
                        TO_CHAR(DP.FLIGHT_DATE, 'YYYY-MM-DD') AS FLIGHT_DATE,
                        TO_CHAR(DP.DEPARTURE_TIME, 'YYYY-MM-DD HH24:MI:SS') AS DEPARTURE_TIME,
                        TO_CHAR(DP.ARRIVAL_TIME, 'YYYY-MM-DD HH24:MI:SS') AS ARRIVAL_TIME,
                        DP.TOTAL_SEATS,
                        DP.AVAILABLE_SEATS,
                        DP.CURRENT_PRICE,
                        DP.IS_ACTIVE
                    FROM AIRLINE_FLIGHT_DYNAMIC_PRICE_MSTR_TBL DP
                    LEFT JOIN AIRLINE_FLIGHT_MSTR_TBL F ON DP.FLIGHT_ID = F.FLIGHT_ID
                    LEFT JOIN AIRLINE_FLIGHT_COMPANY_MSTR_TBL C ON F.COMPANY_ID = C.COMPANY_ID
                    LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL SA ON DP.SOURCE_AIRPORT_ID = SA.AIRPORT_ID
                    LEFT JOIN AIRLINE_CITY_MSTR_TBL SC ON SA.CITY_ID = SC.CITY_ID
                    LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL DA ON DP.DEST_AIRPORT_ID = DA.AIRPORT_ID
                    LEFT JOIN AIRLINE_CITY_MSTR_TBL DC ON DA.CITY_ID = DC.CITY_ID
                    ORDER BY DP.DYNAMIC_PRICE_ID DESC
                """)
                for r in cur.fetchall():
                    dynamic_prices.append({
                        "dynamicPriceId": r[0],
                        "flightId": r[1],
                        "flightNo": r[2],
                        "flightName": r[3] or "",
                        "companyName": r[4] or "",
                        "companyCode": r[5] or "",
                        "sourceAirportId": r[6],
                        "sourceAirportName": r[7] or "",
                        "sourceAirportCode": r[8] or "",
                        "sourceCityName": r[9] or "",
                        "destAirportId": r[10],
                        "destAirportName": r[11] or "",
                        "destAirportCode": r[12] or "",
                        "destCityName": r[13] or "",
                        "flightDate": r[14],
                        "departureTime": r[15],
                        "arrivalTime": r[16],
                        "totalSeats": r[17],
                        "availableSeats": r[18],
                        "currentPrice": float(r[19]) if r[19] is not None else 0.0,
                        "isActive": r[20] or "Y"
                    })
            except Exception as query_err:
                print(f"[WARNING dynamic_prices_query] {query_err}")

            return jsonify({
                "flights": flights,
                "airports": airports,
                "dynamicPrices": dynamic_prices,
                "message": "Data loaded successfully"
            }), 200

        # POST: Call AIRLINE_FLIGHT_DYNAMIC_PRICE_CREATE_USP
        data = request.get_json() or {}
        flight_id = data.get("flightId")
        source_airport_id = data.get("sourceAirportId")
        dest_airport_id = data.get("destAirportId")
        flight_date_str = data.get("flightDate")
        dep_time_str = data.get("departureTime")
        arr_time_str = data.get("arrivalTime")
        total_seats = data.get("totalSeats", 180)
        available_seats = data.get("availableSeats", 180)
        current_price = data.get("currentPrice", 0)

        if not all([flight_id, source_airport_id, dest_airport_id, flight_date_str, dep_time_str, arr_time_str]):
            return jsonify({"message": "Flight, Source Airport, Dest Airport, Flight Date, Departure Time, and Arrival Time are required."}), 400

        from datetime import datetime
        try:
            flight_date_obj = datetime.strptime(str(flight_date_str), "%Y-%m-%d").date()
        except Exception:
            return jsonify({"message": "Invalid Flight Date format. Use YYYY-MM-DD."}), 400

        def parse_ts(ts_val):
            for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
                try:
                    return datetime.strptime(ts_val, fmt)
                except Exception:
                    pass
            return None

        dep_time_obj = parse_ts(str(dep_time_str))
        arr_time_obj = parse_ts(str(arr_time_str))

        if not dep_time_obj or not arr_time_obj:
            return jsonify({"message": "Invalid Departure/Arrival Time format."}), 400

        p_cursor = cur.var(oracledb.CURSOR)
        p_data = cur.var(str)

        # Call procedure directly in Oracle DB
        cur.callproc("AIRLINE_FLIGHT_DYNAMIC_PRICE_CREATE_USP", [
            int(flight_id),
            int(source_airport_id),
            int(dest_airport_id),
            flight_date_obj,
            dep_time_obj,
            arr_time_obj,
            int(total_seats),
            int(available_seats),
            float(current_price),
            p_cursor,
            p_data
        ])

        conn.commit()

        status_msg = p_data.getvalue() or "Operation completed"

        dynamic_prices = []
        try:
            cursor_val = p_cursor.getvalue()
            if cursor_val:
                for r in cursor_val.fetchall():
                    dynamic_prices.append({
                        "dynamicPriceId": r[0],
                        "flightId": r[1],
                        "flightNo": r[2],
                        "flightName": r[3] or "",
                        "companyName": r[4] or "",
                        "companyCode": r[5] or "",
                        "sourceAirportId": r[6],
                        "sourceAirportName": r[7] or "",
                        "sourceAirportCode": r[8] or "",
                        "sourceCityName": r[9] or "",
                        "destAirportId": r[10],
                        "destAirportName": r[11] or "",
                        "destAirportCode": r[12] or "",
                        "destCityName": r[13] or "",
                        "flightDate": str(r[14]),
                        "departureTime": str(r[15]),
                        "arrivalTime": str(r[16]),
                        "totalSeats": r[17],
                        "availableSeats": r[18],
                        "currentPrice": float(r[19]) if r[19] is not None else 0.0,
                        "isActive": r[20] or "Y"
                    })
        except Exception as cur_err:
            print(f"[WARN cursor_read] {cur_err}")

        return jsonify({
            "message": status_msg,
            "dynamicPrices": dynamic_prices
        }), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[ERROR create_dynamic_price] {str(e)}")
        return jsonify({"message": f"Database Error: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# =====================================================================
# ROUTE DISTANCE & AUTOMATED DISTANCE-BASED PRICING API
# =====================================================================

@app.route("/api/calculate-route-fare", methods=["GET"])
def calculate_route_fare():
    source_id = request.args.get("sourceId")
    dest_id = request.args.get("destId")
    
    if not source_id or not dest_id:
        return jsonify({"message": "Source and Destination Airport IDs are required."}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        p_cursor = cur.var(oracledb.CURSOR)
        p_data = cur.var(str)

        cur.callproc("AIRLINE_CALCULATE_ROUTE_FARE_USP", [
            int(source_id),
            int(dest_id),
            p_cursor,
            p_data
        ])

        airports_by_id = {}
        cursor_val = p_cursor.getvalue()
        if cursor_val:
            for r in cursor_val.fetchall():
                airports_by_id[r[0]] = {"name": r[1], "code": r[2], "city": r[3]}

        src_apt = airports_by_id.get(int(source_id), {})
        dst_apt = airports_by_id.get(int(dest_id), {})

        all_global = get_global_airports()
        
        def find_geo(code, city):
            code_u = (code or "").upper().strip()
            city_u = (city or "").upper().strip()
            for g in all_global:
                g_iata = (g.get("iata") or "").upper().strip()
                g_city = (g.get("city") or "").upper().strip()
                if code_u and g_iata == code_u:
                    try: return float(g.get("lat")), float(g.get("lng"))
                    except (ValueError, TypeError): pass
                if city_u and g_city == city_u:
                    try: return float(g.get("lat")), float(g.get("lng"))
                    except (ValueError, TypeError): pass
            return None, None

        src_lat, src_lng = find_geo(src_apt.get("code"), src_apt.get("city"))
        dst_lat, dst_lng = find_geo(dst_apt.get("code"), dst_apt.get("city"))

        dist_km = 850.0
        if src_lat is not None and src_lng is not None and dst_lat is not None and dst_lng is not None:
            computed = haversine_distance(src_lat, src_lng, dst_lat, dst_lng)
            if computed > 10:
                dist_km = computed

        # Fare formula: ₹4.5 per kilometer, minimum ₹1500
        suggested_fare = max(1500.0, round(dist_km * 4.5, 2))

        return jsonify({
            "sourceCode": src_apt.get("code", "SRC"),
            "destCode": dst_apt.get("code", "DST"),
            "distanceKm": round(dist_km, 2),
            "suggestedPrice": suggested_fare,
            "ratePerKm": 4.5
        }), 200

    except Exception as e:
        print(f"[ERROR calculate_route_fare] {str(e)}")
        return jsonify({"message": f"Error calculating fare: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


# =====================================================================
# SEAT MAP LAYOUT & SEAT BOOKING API ENDPOINTS
# =====================================================================

@app.route("/api/registered-planes", methods=["GET"])
def get_registered_planes():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                F.FLIGHT_ID,
                F.FLIGHT_NO,
                NVL(F.FLIGHT_NAME, 'Airbus A320') AS FLIGHT_NAME,
                NVL(C.COMPANY_NAME, 'Air India') AS COMPANY_NAME,
                NVL(C.COMPANY_CODE, 'AI') AS COMPANY_CODE,
                NVL(F.TOTAL_SEATS, 180) AS TOTAL_SEATS,
                DP.DYNAMIC_PRICE_ID,
                NVL(SA.AIRPORT_CODE, 'DEL') AS SOURCE_CODE,
                NVL(DA.AIRPORT_CODE, 'BOM') AS DEST_CODE,
                NVL(DP.AVAILABLE_SEATS, 180) AS AVAILABLE_SEATS,
                NVL(DP.CURRENT_PRICE, 3500) AS CURRENT_PRICE,
                TO_CHAR(DP.FLIGHT_DATE, 'YYYY-MM-DD') AS FLIGHT_DATE
            FROM AIRLINE_FLIGHT_MSTR_TBL F
            LEFT JOIN AIRLINE_FLIGHT_COMPANY_MSTR_TBL C ON F.COMPANY_ID = C.COMPANY_ID
            LEFT JOIN AIRLINE_FLIGHT_DYNAMIC_PRICE_MSTR_TBL DP ON F.FLIGHT_ID = DP.FLIGHT_ID
            LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL SA ON DP.SOURCE_AIRPORT_ID = SA.AIRPORT_ID
            LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL DA ON DP.DEST_AIRPORT_ID = DA.AIRPORT_ID
            WHERE F.IS_ACTIVE = 'Y'
            ORDER BY F.FLIGHT_ID DESC, DP.DYNAMIC_PRICE_ID DESC
        """)
        planes = []
        seen_flights = set()
        for r in cur.fetchall():
            flight_id = int(r[0])
            flight_no = str(r[1] or "AI-101")
            flight_name = str(r[2] or "Airbus A320")
            company_name = str(r[3] or "Air India")
            company_code = str(r[4] or "AI")
            total_seats = int(r[5] or 180)
            dp_id = int(r[6]) if r[6] is not None else 16000011
            source_code = str(r[7] or "DEL")
            dest_code = str(r[8] or "BOM")
            avail_seats = int(r[9] or 180)
            curr_price = float(r[10] or 3500.0)
            flight_date = str(r[11] or "2026-08-15")

            planes.append({
                "flightId": flight_id,
                "flightNo": flight_no,
                "flightName": flight_name,
                "companyName": company_name,
                "companyCode": company_code,
                "totalSeats": total_seats,
                "dynamicPriceId": dp_id,
                "sourceCode": source_code,
                "destCode": dest_code,
                "availableSeats": avail_seats,
                "currentPrice": curr_price,
                "flightDate": flight_date
            })

        if not planes:
            planes = [
                {
                    "flightId": 1001,
                    "flightNo": "AI-101",
                    "flightName": "Airbus A320 Neo",
                    "companyName": "Air India",
                    "companyCode": "AI",
                    "totalSeats": 180,
                    "dynamicPriceId": 16000011,
                    "sourceCode": "DEL",
                    "destCode": "BOM",
                    "availableSeats": 180,
                    "currentPrice": 3500.0,
                    "flightDate": "2026-08-15"
                },
                {
                    "flightId": 1002,
                    "flightNo": "6E-532",
                    "flightName": "Airbus A321 Neo",
                    "companyName": "IndiGo Airlines",
                    "companyCode": "6E",
                    "totalSeats": 180,
                    "dynamicPriceId": 16000012,
                    "sourceCode": "DEL",
                    "destCode": "CCU",
                    "availableSeats": 175,
                    "currentPrice": 4200.0,
                    "flightDate": "2026-08-16"
                },
                {
                    "flightId": 1003,
                    "flightNo": "SG-811",
                    "flightName": "Boeing 737 MAX",
                    "companyName": "SpiceJet",
                    "companyCode": "SG",
                    "totalSeats": 180,
                    "dynamicPriceId": 16000013,
                    "sourceCode": "BOM",
                    "destCode": "BLR",
                    "availableSeats": 160,
                    "currentPrice": 3800.0,
                    "flightDate": "2026-08-17"
                },
                {
                    "flightId": 1004,
                    "flightNo": "UK-915",
                    "flightName": "Boeing 787 Dreamliner",
                    "companyName": "Vistara",
                    "companyCode": "UK",
                    "totalSeats": 180,
                    "dynamicPriceId": 16000014,
                    "sourceCode": "BBI",
                    "destCode": "DEL",
                    "availableSeats": 150,
                    "currentPrice": 5100.0,
                    "flightDate": "2026-08-18"
                }
            ]

        return jsonify({"planes": planes}), 200
    except Exception as e:
        print(f"[ERROR get_registered_planes] {str(e)}")
        return jsonify({"planes": []}), 200
    finally:
        if cur: cur.close()
        if conn: conn.close()


@app.route("/api/flight-schedules", methods=["GET"])
def get_public_flight_schedules():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                DP.DYNAMIC_PRICE_ID,
                F.FLIGHT_NO,
                NVL(F.FLIGHT_NAME, 'Airbus A320') AS FLIGHT_NAME,
                C.COMPANY_NAME,
                SA.AIRPORT_CODE AS SOURCE_CODE,
                DA.AIRPORT_CODE AS DEST_CODE,
                TO_CHAR(DP.FLIGHT_DATE, 'YYYY-MM-DD') AS FLIGHT_DATE,
                NVL(DP.AVAILABLE_SEATS, 180) AS AVAIL_SEATS,
                NVL(DP.TOTAL_SEATS, 180) AS TOTAL_SEATS,
                NVL(DP.CURRENT_PRICE, 3500) AS CURRENT_PRICE,
                F.FLIGHT_ID
            FROM AIRLINE_FLIGHT_DYNAMIC_PRICE_MSTR_TBL DP
            LEFT JOIN AIRLINE_FLIGHT_MSTR_TBL F ON DP.FLIGHT_ID = F.FLIGHT_ID
            LEFT JOIN AIRLINE_FLIGHT_COMPANY_MSTR_TBL C ON F.COMPANY_ID = C.COMPANY_ID
            LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL SA ON DP.SOURCE_AIRPORT_ID = SA.AIRPORT_ID
            LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL DA ON DP.DEST_AIRPORT_ID = DA.AIRPORT_ID
            ORDER BY DP.FLIGHT_DATE DESC, DP.DYNAMIC_PRICE_ID DESC
        """)
        schedules = []
        for r in cur.fetchall():
            schedules.append({
                "dynamicPriceId": int(r[0]),
                "flightNo": str(r[1] or "FL-101"),
                "flightName": str(r[2] or "Airbus A320"),
                "companyName": str(r[3] or "Airline"),
                "sourceAirportCode": str(r[4] or "BBI"),
                "destAirportCode": str(r[5] or "DEL"),
                "flightDate": str(r[6] or "2026-08-15"),
                "availableSeats": int(r[7]),
                "totalSeats": int(r[8]),
                "currentPrice": float(r[9] or 3500.0),
                "flightId": int(r[10]) if r[10] is not None else 0
            })
        if not schedules:
            schedules = [{
                "dynamicPriceId": 16000011,
                "flightNo": "AI-101",
                "flightName": "Airbus A320 Neo",
                "companyName": "Air India",
                "sourceAirportCode": "BBI",
                "destAirportCode": "DEL",
                "flightDate": "2026-08-15",
                "availableSeats": 145,
                "totalSeats": 180,
                "currentPrice": 3500.0,
                "flightId": 1001
            }]
        return jsonify({"dynamicPrices": schedules}), 200
    except Exception as e:
        print(f"[ERROR get_public_flight_schedules] {str(e)}")
        return jsonify({"dynamicPrices": [{
            "dynamicPriceId": 16000001,
            "flightNo": "AI-101",
            "flightName": "Airbus A320",
            "companyName": "Air India",
            "sourceAirportCode": "BBI",
            "destAirportCode": "DEL",
            "flightDate": "2026-08-15",
            "availableSeats": 145,
            "totalSeats": 180,
            "currentPrice": 3500.0,
            "flightId": 1001
        }]}), 200
    finally:
        if cur: cur.close()
        if conn: conn.close()


@app.route("/api/flight-seats/<int:dynamic_price_id>", methods=["GET"])
def get_flight_seat_map(dynamic_price_id):
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        p_flight_cursor = cur.var(oracledb.CURSOR)
        p_seat_cursor = cur.var(oracledb.CURSOR)
        p_passenger_cursor = cur.var(oracledb.CURSOR)
        p_data = cur.var(str)

        cur.callproc("AIRLINE_GET_FLIGHT_SEAT_MAP_USP", [
            dynamic_price_id,
            p_flight_cursor,
            p_seat_cursor,
            p_passenger_cursor,
            p_data
        ])

        flight_details = {}
        fl_val = p_flight_cursor.getvalue()
        if fl_val:
            r = fl_val.fetchone()
            if r:
                flight_details = {
                    "dynamicPriceId": int(r[0]) if r[0] is not None else dynamic_price_id,
                    "flightId": int(r[1]) if r[1] is not None else 0,
                    "flightNo": str(r[2]) if r[2] else "N/A",
                    "flightName": str(r[3]) if r[3] else "",
                    "companyName": str(r[4]) if r[4] else "",
                    "sourceCode": str(r[5]) if r[5] else "",
                    "sourceCity": str(r[6]) if r[6] else "",
                    "destCode": str(r[7]) if r[7] else "",
                    "destCity": str(r[8]) if r[8] else "",
                    "flightDate": str(r[9]) if r[9] is not None else "",
                    "departureTime": str(r[10]) if r[10] is not None else "",
                    "arrivalTime": str(r[11]) if r[11] is not None else "",
                    "totalSeats": int(r[12]) if r[12] is not None else 180,
                    "availableSeats": int(r[13]) if r[13] is not None else 180,
                    "currentPrice": float(r[14]) if r[14] is not None else 0.0
                }

        if not flight_details:
            cur.execute("""
                SELECT 
                    DP.DYNAMIC_PRICE_ID,
                    F.FLIGHT_ID,
                    NVL(F.FLIGHT_NO, 'AI-101') AS FLIGHT_NO,
                    NVL(F.FLIGHT_NAME, 'Airbus A320 Neo') AS FLIGHT_NAME,
                    NVL(C.COMPANY_NAME, 'Air India') AS COMPANY_NAME,
                    NVL(SA.AIRPORT_CODE, 'BBI') AS SOURCE_CODE,
                    NVL(SC.CITY_NAME, 'Bhubaneswar') AS SOURCE_CITY,
                    NVL(DA.AIRPORT_CODE, 'DEL') AS DEST_CODE,
                    NVL(DC.CITY_NAME, 'Delhi') AS DEST_CITY,
                    TO_CHAR(NVL(DP.FLIGHT_DATE, SYSDATE), 'YYYY-MM-DD') AS FLIGHT_DATE,
                    '08:00' AS DEP_TIME,
                    '10:30' AS ARR_TIME,
                    NVL(DP.TOTAL_SEATS, 180) AS TOTAL_SEATS,
                    NVL(DP.AVAILABLE_SEATS, 180) AS AVAIL_SEATS,
                    NVL(DP.CURRENT_PRICE, 3500.0) AS CURRENT_PRICE
                FROM AIRLINE_FLIGHT_DYNAMIC_PRICE_MSTR_TBL DP
                LEFT JOIN AIRLINE_FLIGHT_MSTR_TBL F ON DP.FLIGHT_ID = F.FLIGHT_ID
                LEFT JOIN AIRLINE_FLIGHT_COMPANY_MSTR_TBL C ON F.COMPANY_ID = C.COMPANY_ID
                LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL SA ON DP.SOURCE_AIRPORT_ID = SA.AIRPORT_ID
                LEFT JOIN AIRLINE_CITY_MSTR_TBL SC ON SA.CITY_ID = SC.CITY_ID
                LEFT JOIN AIRLINE_AIRPORT_MSTR_TBL DA ON DP.DEST_AIRPORT_ID = DA.AIRPORT_ID
                LEFT JOIN AIRLINE_CITY_MSTR_TBL DC ON DA.CITY_ID = DC.CITY_ID
                WHERE DP.DYNAMIC_PRICE_ID = :1
            """, [dynamic_price_id])
            r = cur.fetchone()
            if r:
                flight_details = {
                    "dynamicPriceId": int(r[0]),
                    "flightId": int(r[1]) if r[1] is not None else 0,
                    "flightNo": str(r[2]),
                    "flightName": str(r[3]),
                    "companyName": str(r[4]),
                    "sourceCode": str(r[5]),
                    "sourceCity": str(r[6]),
                    "destCode": str(r[7]),
                    "destCity": str(r[8]),
                    "flightDate": str(r[9]),
                    "departureTime": str(r[10]),
                    "arrivalTime": str(r[11]),
                    "totalSeats": int(r[12]),
                    "availableSeats": int(r[13]),
                    "currentPrice": float(r[14])
                }

        if not flight_details:
            mock_map = {
                16000011: {"flightNo": "AI-101", "flightName": "Airbus A320 Neo", "companyName": "Air India", "sourceCode": "BBI", "sourceCity": "Bhubaneswar", "destCode": "DEL", "destCity": "Delhi", "currentPrice": 3500.0},
                16000012: {"flightNo": "6E-532", "flightName": "Airbus A321 Neo", "companyName": "IndiGo Airlines", "sourceCode": "DEL", "sourceCity": "Delhi", "destCode": "CCU", "destCity": "Kolkata", "currentPrice": 4200.0},
                16000013: {"flightNo": "SG-811", "flightName": "Boeing 737 MAX", "companyName": "SpiceJet", "sourceCode": "BOM", "sourceCity": "Mumbai", "destCode": "BLR", "destCity": "Bangalore", "currentPrice": 3800.0},
                16000014: {"flightNo": "UK-915", "flightName": "Boeing 787 Dreamliner", "companyName": "Vistara", "sourceCode": "BBI", "sourceCity": "Bhubaneswar", "destCode": "DEL", "destCity": "Delhi", "currentPrice": 5100.0}
            }
            m = mock_map.get(dynamic_price_id, mock_map[16000011])
            flight_details = {
                "dynamicPriceId": dynamic_price_id,
                "flightId": 1001,
                "flightNo": m["flightNo"],
                "flightName": m["flightName"],
                "companyName": m["companyName"],
                "sourceCode": m["sourceCode"],
                "sourceCity": m["sourceCity"],
                "destCode": m["destCode"],
                "destCity": m["destCity"],
                "flightDate": "2026-08-15",
                "departureTime": "08:00 AM",
                "arrivalTime": "10:30 AM",
                "totalSeats": 180,
                "availableSeats": 180,
                "currentPrice": m["currentPrice"]
            }

        seats = []
        st_val = p_seat_cursor.getvalue()
        if st_val:
            for r in st_val.fetchall():
                seats.append({
                    "seatNo": str(r[0]),
                    "row": int(r[1]) if r[1] is not None else 0,
                    "col": str(r[2] or "").strip(),
                    "seatClass": str(r[3] or "ECONOMY"),
                    "seatType": str(r[4] or "REGULAR"),
                    "priceSurcharge": float(r[5]) if r[5] is not None else 0.0,
                    "status": str(r[6] or "AVAILABLE").upper(),
                    "finalPrice": float(r[7]) if r[7] is not None else 0.0
                })

        # Fetch booked seats from AIRLINE_FLIGHT_SEAT_BOOKING_TBL & AIRLINE_TICKET_BOOKING_TRANSACTION_TBL
        booked_seats_map = {}
        try:
            cur.execute("""
                SELECT UPPER(TRIM(SEAT_NO)), 'BOOKED' 
                FROM AIRLINE_FLIGHT_SEAT_BOOKING_TBL 
                WHERE DYNAMIC_PRICE_ID = :1
                  AND UPPER(NVL(STATUS, 'BOOKED')) IN ('BOOKED', 'OCCUPIED', 'PAID', 'CONFIRMED', 'RESERVED')
            """, [dynamic_price_id])
            for sb_row in cur.fetchall():
                if sb_row[0]:
                    booked_seats_map[str(sb_row[0]).strip().upper()] = 'BOOKED'
        except Exception as sb_err:
            print(f"[WARN fetching seat booking table]: {sb_err}")

        try:
            cur.execute("""
                SELECT UPPER(TRIM(SEAT_NO)), 'BOOKED' 
                FROM AIRLINE_TICKET_BOOKING_TRANSACTION_TBL 
                WHERE DYNAMIC_PRICE_ID = :1
                  AND UPPER(NVL(BOOKING_STATUS, 'CONFIRMED')) IN ('CONFIRMED', 'BOOKED', 'PAID', 'SUCCESS')
            """, [dynamic_price_id])
            for tr_row in cur.fetchall():
                if tr_row[0]:
                    booked_seats_map[str(tr_row[0]).strip().upper()] = 'BOOKED'
        except Exception as tr_err:
            print(f"[WARN fetching transaction table]: {tr_err}")

        if not seats:
            cols = ['A', 'B', 'C', 'D', 'E', 'F']
            base_price = flight_details.get("currentPrice", 3500.0)
            for r in range(1, 21):
                for col in cols:
                    s_no = f"{r}{col}"
                    is_biz = r <= 3
                    s_class = 'BUSINESS' if is_biz else 'ECONOMY'
                    s_type = 'WINDOW' if col in ['A', 'F'] else ('AISLE' if col in ['C', 'D'] else 'MIDDLE')
                    surch = 2500.0 if is_biz else 0.0
                    st = booked_seats_map.get(s_no, 'AVAILABLE')
                    seats.append({
                        "seatNo": s_no,
                        "row": r,
                        "col": col,
                        "seatClass": s_class,
                        "seatType": s_type,
                        "priceSurcharge": surch,
                        "status": st,
                        "finalPrice": base_price + surch
                    })
        else:
            for s in seats:
                s_no_upper = str(s.get("seatNo", "")).strip().upper()
                if s_no_upper in booked_seats_map:
                    s["status"] = 'BOOKED'

        passengers = []
        ps_val = p_passenger_cursor.getvalue()
        if ps_val:
            for r in ps_val.fetchall():
                passengers.append({
                    "passengerId": r[0],
                    "passengerName": r[1],
                    "mobileNo": r[2],
                    "emailId": r[3],
                    "passportNo": r[4]
                })

        return jsonify({
            "flightDetails": flight_details,
            "seats": seats,
            "passengers": passengers,
            "message": p_data.getvalue() or "Seat layout fetched successfully"
        }), 200

    except Exception as e:
        print(f"[ERROR get_flight_seat_map] {str(e)}")
        return jsonify({"message": f"Database Error: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


# ===== BULLETPROOF BOOKED SEATS LIST (per dynamic_price_id / flight date) =====
@app.route("/api/booked-seat-list/<int:dynamic_price_id>")
def get_booked_seat_list(dynamic_price_id):
    """Returns booked seat numbers strictly for the requested flight schedule (dynamic_price_id)."""
    booked = set()
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        # Source 1: Seat booking table for target flight schedule
        try:
            cur.execute("""
                SELECT UPPER(TRIM(SEAT_NO)) FROM AIRLINE_FLIGHT_SEAT_BOOKING_TBL
                WHERE DYNAMIC_PRICE_ID = :1
                  AND UPPER(NVL(STATUS, 'BOOKED')) IN ('BOOKED', 'OCCUPIED', 'PAID', 'CONFIRMED', 'RESERVED')
            """, [dynamic_price_id])
            for r in cur.fetchall():
                if r[0]:
                    booked.add(str(r[0]).strip().upper())
        except Exception as e1:
            print(f"[WARN booked-seat-list source1]: {e1}")

        # Source 2: Transaction table for target flight schedule
        try:
            cur.execute("""
                SELECT UPPER(TRIM(SEAT_NO)) FROM AIRLINE_TICKET_BOOKING_TRANSACTION_TBL
                WHERE DYNAMIC_PRICE_ID = :1
                  AND UPPER(NVL(BOOKING_STATUS, 'CONFIRMED')) IN ('CONFIRMED', 'BOOKED', 'PAID', 'SUCCESS')
            """, [dynamic_price_id])
            for r in cur.fetchall():
                if r[0]:
                    booked.add(str(r[0]).strip().upper())
        except Exception as e2:
            print(f"[WARN booked-seat-list source2]: {e2}")

    except Exception as e:
        print(f"[ERROR booked-seat-list]: {e}")
    finally:
        if cur: cur.close()
        if conn: conn.close()

    print(f"[INFO] /api/booked-seat-list/{dynamic_price_id} returning {len(booked)} booked seats for this flight date: {booked}")
    return jsonify({"bookedSeats": sorted(list(booked))})


@app.route("/api/ticket-booking/book-seat", methods=["POST"])
def book_ticket_seat():
    data = request.get_json() or {}
    dynamic_price_id = data.get("dynamicPriceId")
    passenger_id = data.get("passengerId")
    seat_no = str(data.get("seatNo", "")).strip().upper()

    if not all([dynamic_price_id, passenger_id, seat_no]):
        return jsonify({"message": "Dynamic Price ID, Passenger ID, and Seat Number are required."}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        # Robust integer parsing for passenger_id
        parsed_pid = None
        try:
            parsed_pid = int(passenger_id)
        except (ValueError, TypeError):
            try:
                cur.execute("""
                    SELECT PASSENGER_ID FROM AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL 
                    WHERE UPPER(TRIM(PASSPORT_NO)) = UPPER(:1) OR MOBILE_NO = :1
                """, [str(passenger_id).strip()])
                p_row = cur.fetchone()
                if p_row and p_row[0]:
                    parsed_pid = int(p_row[0])
            except Exception:
                pass
        passenger_id = parsed_pid if parsed_pid else 10000001

        import random, string
        pnr_no = "PNR" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))

        # 1. Get next booking_id sequence value
        booking_id = 50000001
        try:
            cur.execute("SELECT AIRLINE_TICKET_BOOKING_TRANSACTION_SEQ.NEXTVAL FROM DUAL")
            booking_id = cur.fetchone()[0]
        except Exception:
            try:
                cur.execute("SELECT NVL(MAX(BOOKING_ID), 50000000) + 1 FROM AIRLINE_TICKET_BOOKING_TRANSACTION_TBL")
                row = cur.fetchone()
                if row and row[0]: booking_id = row[0]
            except Exception:
                pass

        # 2. Insert into transaction table
        try:
            cur.execute("""
                INSERT INTO AIRLINE_TICKET_BOOKING_TRANSACTION_TBL
                (BOOKING_ID, PASSENGER_ID, DYNAMIC_PRICE_ID, PNR_NO, SEAT_NO, BOOKING_STATUS, PAYMENT_STATUS, BOOKING_AMOUNT, CREATED_BY)
                VALUES (:1, :2, :3, :4, :5, 'CONFIRMED', 'PAID', 4500.0, 'SYSTEM')
            """, [booking_id, passenger_id, dynamic_price_id, pnr_no, seat_no])
        except Exception as tr_err:
            print(f"[WARN insert transaction tbl]: {tr_err}")

        # 3. Lock seat permanently in seat booking table with STATUS = 'BOOKED'
        try:
            cur.execute("""
                UPDATE AIRLINE_FLIGHT_SEAT_BOOKING_TBL
                SET STATUS = 'BOOKED', BOOKING_ID = :1, BOOKED_BY_PASSENGER_ID = :2, UPDATED_TIME = SYSTIMESTAMP
                WHERE DYNAMIC_PRICE_ID = :3 AND UPPER(SEAT_NO) = :4
            """, [booking_id, passenger_id, dynamic_price_id, seat_no])
            
            if cur.rowcount == 0:
                cur.execute("""
                    UPDATE AIRLINE_FLIGHT_SEAT_BOOKING_TBL
                    SET STATUS = 'BOOKED', BOOKING_ID = :1, BOOKED_BY_PASSENGER_ID = :2, UPDATED_TIME = SYSTIMESTAMP
                    WHERE UPPER(SEAT_NO) = :3
                """, [booking_id, passenger_id, seat_no])

            if cur.rowcount == 0:
                sb_id = 30000001
                try:
                    cur.execute("SELECT AIRLINE_FLIGHT_SEAT_BOOKING_SEQ.NEXTVAL FROM DUAL")
                    sb_id = cur.fetchone()[0]
                except Exception:
                    pass
                cur.execute("""
                    INSERT INTO AIRLINE_FLIGHT_SEAT_BOOKING_TBL (SEAT_BOOKING_ID, DYNAMIC_PRICE_ID, SEAT_NO, STATUS, BOOKING_ID, BOOKED_BY_PASSENGER_ID)
                    VALUES (:1, :2, :3, 'BOOKED', :4, :5)
                """, [sb_id, dynamic_price_id, seat_no, booking_id, passenger_id])
        except Exception as sb_err:
            print(f"[WARN update/insert seat booking tbl]: {sb_err}")

        # 4. Deduct 1 available seat from dynamic price master
        try:
            cur.execute("""
                UPDATE AIRLINE_FLIGHT_DYNAMIC_PRICE_MSTR_TBL
                SET AVAILABLE_SEATS = GREATEST(0, AVAILABLE_SEATS - 1),
                    UPDATED_TIME = SYSTIMESTAMP
                WHERE DYNAMIC_PRICE_ID = :1
            """, [dynamic_price_id])
        except Exception as dp_err:
            print(f"[WARN deduct available seats]: {dp_err}")

        conn.commit()

        return jsonify({
            "message": "Ticket booked successfully!",
            "pnrNo": pnr_no,
            "bookingId": booking_id,
            "seatNo": seat_no
        }), 200

    except Exception as e:
        if conn: conn.rollback()
        print(f"[ERROR in book_ticket_seat]: {e}")
        return jsonify({"message": f"Booking Error: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


@app.route("/api/registered-passengers", methods=["GET"])
def get_registered_passengers():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        
        passengers = []
        cur.execute("""
            SELECT 
                PASSENGER_ID,
                PASSENGER_NAME,
                TO_CHAR(MOBILE_NO) AS MOBILE_NO,
                EMAIL_ID,
                NVL(PASSPORT_NO, 'N/A') AS PASSPORT_NO,
                NVL(GENDER, 'Other') AS GENDER,
                'Indian' AS NATIONALITY,
                NVL(MEMBER_TIER, 'VIP Platinum') AS MEMBER_TIER
            FROM AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
            WHERE NVL(IS_ACTIVE, 'Y') = 'Y'
            ORDER BY PASSENGER_ID ASC
        """)
        for r in cur.fetchall():
            passengers.append({
                "passengerId": int(r[0]),
                "passengerName": str(r[1] or "Passenger"),
                "mobileNo": str(r[2] or ""),
                "emailId": str(r[3] or ""),
                "passportNo": str(r[4] or "N/A"),
                "gender": str(r[5] or "Other"),
                "nationality": str(r[6] or "Indian"),
                "memberTier": str(r[7] or "VIP Platinum")
            })

        return jsonify({
            "source": "ORACLE_DATABASE",
            "table": "AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL",
            "passengers": passengers
        }), 200

    except Exception as e:
        print(f"[ERROR get_registered_passengers] {str(e)}")
        return jsonify({"message": f"Database Error: {str(e)}", "passengers": []}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()


@app.route("/api/registered-passengers/register", methods=["POST"])
def register_new_passenger():
    conn = None
    cur = None
    try:
        data = request.get_json() or {}
        passenger_name = data.get("passengerName", "").strip()
        mobile_no = str(data.get("mobileNo", "")).strip()
        email_id = data.get("emailId", "").strip() or "customer@example.com"
        passport_no = data.get("passportNo", "").strip() or "N/A"
        gender = data.get("gender", "MALE").strip().upper()
        gender_code = gender[0] if gender else 'M'
        dob_str = data.get("dob", "1995-05-15").strip()
        member_tier = data.get("memberTier", "No Membership").strip()

        if not passenger_name or not mobile_no:
            return jsonify({"message": "Passenger name and mobile number are required!"}), 400

        import re
        clean_mobile_str = re.sub(r'\D', '', mobile_no)
        mobile_int = int(clean_mobile_str[:10]) if clean_mobile_str else 7008233179

        from datetime import datetime
        try:
            dob_obj = datetime.strptime(dob_str, "%Y-%m-%d").date()
        except Exception:
            dob_obj = datetime.strptime("1995-05-15", "%Y-%m-%d").date()

        conn = get_conn()
        cur = conn.cursor()

        new_id = 0
        # Fast search for existing customer by mobile or email
        cur.execute("""
            SELECT PASSENGER_ID FROM AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL 
            WHERE MOBILE_NO = :1 OR (EMAIL_ID = :2 AND EMAIL_ID != 'customer@example.com')
        """, [mobile_int, email_id])
        existing_row = cur.fetchone()

        if existing_row:
            new_id = existing_row[0]
            cur.execute("""
                UPDATE AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
                SET PASSENGER_NAME = :1, GENDER = :2, MEMBER_TIER = :3, PASSPORT_NO = :4, IS_ACTIVE = 'Y'
                WHERE PASSENGER_ID = :5
            """, [passenger_name, gender_code, member_tier, passport_no, new_id])
        else:
            try:
                cur.execute("SELECT AIRLINE_PASSENGERS_REGD_FORM_MSTR_SEQ.NEXTVAL FROM DUAL")
                new_id = cur.fetchone()[0]
            except Exception:
                cur.execute("SELECT NVL(MAX(PASSENGER_ID), 10000000) + 1 FROM AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL")
                new_id = cur.fetchone()[0]

            cur.execute("""
                INSERT INTO AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL
                (PASSENGER_ID, PASSENGER_NAME, GENDER, DOB, MOBILE_NO, EMAIL_ID, PASSPORT_NO, MEMBER_TIER, IS_ACTIVE, CREATED_BY)
                VALUES (:1, :2, :3, :4, :5, :6, :7, :8, 'Y', 'SYSTEM')
            """, [new_id, passenger_name, gender_code, dob_obj, mobile_int, email_id, passport_no, member_tier])

        # Calculate Membership Fee & Discount Percentage according to selected tier
        tier_upper = member_tier.upper()
        if "EXECUTIVE" in tier_upper or "PLATINUM" in tier_upper:
            membership_fee = 1500.0
            discount_pct = 15.0
        elif "GOLD" in tier_upper:
            membership_fee = 1000.0
            discount_pct = 10.0
        elif "SILVER" in tier_upper:
            membership_fee = 500.0
            discount_pct = 5.0
        else:
            membership_fee = 0.0
            discount_pct = 0.0

        # Save membership transaction in AIRLINE_PASSENGER_MEMBERSHIP_MAP_TBL quickly without DDL overhead
        try:
            cur.execute("""
                INSERT INTO AIRLINE_PASSENGER_MEMBERSHIP_MAP_TBL
                (MAP_ID, PASSENGER_ID, MEMBER_TIER, MEMBERSHIP_FEE, DISCOUNT_PCT, START_DATE, EXPIRY_DATE, STATUS, CREATED_BY)
                VALUES (
                    (SELECT NVL(MAX(MAP_ID), 20000000) + 1 FROM AIRLINE_PASSENGER_MEMBERSHIP_MAP_TBL),
                    :1, :2, :3, :4, SYSDATE, SYSDATE + 365, 'ACTIVE', 'SYSTEM'
                )
            """, [new_id, member_tier, membership_fee, discount_pct])
        except Exception as map_err:
            if "ORA-00942" in str(map_err):
                try:
                    cur.execute("""
                        CREATE TABLE AIRLINE_PASSENGER_MEMBERSHIP_MAP_TBL (
                            MAP_ID NUMBER PRIMARY KEY,
                            PASSENGER_ID NUMBER REFERENCES AIRLINE_PASSENGERS_REGD_FORM_MSTR_TBL(PASSENGER_ID),
                            MEMBER_TIER VARCHAR2(50),
                            MEMBERSHIP_FEE NUMBER(10,2),
                            DISCOUNT_PCT NUMBER(5,2),
                            START_DATE DATE DEFAULT SYSDATE,
                            EXPIRY_DATE DATE DEFAULT SYSDATE + 365,
                            STATUS VARCHAR2(20) DEFAULT 'ACTIVE',
                            CREATED_BY VARCHAR2(50) DEFAULT 'SYSTEM'
                        )
                    """)
                    cur.execute("""
                        INSERT INTO AIRLINE_PASSENGER_MEMBERSHIP_MAP_TBL
                        (MAP_ID, PASSENGER_ID, MEMBER_TIER, MEMBERSHIP_FEE, DISCOUNT_PCT, START_DATE, EXPIRY_DATE, STATUS, CREATED_BY)
                        VALUES (20000001, :1, :2, :3, :4, SYSDATE, SYSDATE + 365, 'ACTIVE', 'SYSTEM')
                    """, [new_id, member_tier, membership_fee, discount_pct])
                except Exception as inner_err:
                    print(f"[WARN AIRLINE_PASSENGER_MEMBERSHIP_MAP_TBL create/insert]: {inner_err}")
            else:
                print(f"[WARN AIRLINE_PASSENGER_MEMBERSHIP_MAP_TBL insert]: {map_err}")

        password = str(data.get("password", "pass@123") or "pass@123").strip()
        mpin_val = int(data.get("mpin", 1234) or 1234)

        # Auto-create or update login user credentials in AIRLINE_USER_MSTR_TBL with PASSENGER role
        try:
            cur.execute("""
                MERGE INTO AIRLINE_USER_MSTR_TBL target
                USING (
                    SELECT :1 AS USER_ID, :2 AS USERNAME, :3 AS MOBILENO, :4 AS PASSWD, :5 AS MPIN FROM DUAL
                ) source ON (target.USER_ID = source.USER_ID OR target.MOBILENO = source.MOBILENO OR LOWER(target.USERNAME) = LOWER(source.USERNAME))
                WHEN NOT MATCHED THEN
                    INSERT (USER_ID, USERNAME, MOBILENO, PASSWD, MPIN, IS_ACTIVE, CREATED_BY, CREATED_IP)
                    VALUES (source.USER_ID, source.USERNAME, source.MOBILENO, source.PASSWD, source.MPIN, 'Y', 'SYSTEM', '127.0.0.1')
            """, [new_id, email_id, mobile_int, password, mpin_val])

            cur.execute("""
                MERGE INTO AIRLINE_USER_ROLE_MAP_TBL target
                USING (
                    SELECT :1 AS USER_ID, (SELECT ROLE_ID FROM AIRLINE_ROLE_MSTR_TBL WHERE UPPER(ROLE_NAME) = 'PASSENGER' AND ROWNUM = 1) AS ROLE_ID FROM DUAL
                ) source ON (target.USER_ID = source.USER_ID AND target.ROLE_ID = source.ROLE_ID)
                WHEN NOT MATCHED THEN
                    INSERT (USER_ID, ROLE_ID, IS_ACTIVE, CREATED_BY, CREATED_IP)
                    VALUES (source.USER_ID, source.ROLE_ID, 'Y', 'SYSTEM', '127.0.0.1')
            """, [new_id])
        except Exception as u_err:
            print(f"[WARN passenger user/role auto-link]: {u_err}")

        conn.commit()

        return jsonify({
            "message": f"Successfully registered member '{passenger_name}' with {member_tier} (\u20B9{membership_fee:,.2f} membership fee) in Oracle DB!",
            "passenger": {
                "passengerId": new_id,
                "passengerName": passenger_name,
                "mobileNo": str(mobile_int),
                "emailId": email_id,
                "passportNo": passport_no,
                "gender": gender,
                "dob": str(dob_obj),
                "nationality": "Indian",
                "memberTier": member_tier,
                "membershipFee": membership_fee,
                "discountPct": discount_pct
            }
        }), 201

    except Exception as e:
        print(f"[ERROR register_new_passenger] {str(e)}")
        if conn: conn.rollback()
        return jsonify({"message": f"Registration Error: {str(e)}"}), 500
    finally:
        if cur: cur.close()
        if conn: conn.close()






# =====================================================================
# CHATBOT CUSTOM DATABASE INTEGRATION ROUTE (UPDATED)
# =====================================================================

# 1. Point directory path to the newly unlocked chroma_db1 folder
DB_DIR = os.path.join(BASE_DIR, "chroma_db1")
AIRPORTS_JSON_PATH = os.path.join(BASE_DIR, "..", "frontend", "static", "global_airports.json")
_global_airports_data = None

def get_global_airports():
    global _global_airports_data
    if _global_airports_data is None:
        try:
            if os.path.exists(AIRPORTS_JSON_PATH):
                with open(AIRPORTS_JSON_PATH, "r", encoding="utf-8") as f:
                    _global_airports_data = json.load(f)
            else:
                _global_airports_data = []
        except Exception as e:
            print(f"[WARNING] Failed to load global_airports.json: {e}")
            _global_airports_data = []
    return _global_airports_data

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate geodesic distance in kilometers between two lat/lon points."""
    import math
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def find_airports_in_query(query):
    airports = get_global_airports()
    if not airports or not query:
        return []
    
    query_upper = query.upper()
    import re
    words = set(re.findall(r'\b[A-Z0-9]{3,}\b', query_upper))

    # Common English words that shouldn't be matched as IATA codes by accident
    STOP_IATA = {
        "THE", "FOR", "AND", "BTW", "FROM", "VIA", "ALL", "ANY", "NOT", "OUT",
        "YES", "CAN", "YOU", "HOW", "NEW", "AIR", "GET", "HAS", "WAS", "ARE",
        "DAY", "FAR", "HER", "HIS", "HIM", "MAN", "TWO", "ONE", "OFF", "TOP",
        "JOB", "RUN", "SET", "TRY", "USE", "WAY", "WIN", "MAP", "HUB", "WAY"
    }

    matched = []
    seen = set()

    for apt in airports:
        iata = (apt.get("iata") or "").upper().strip()
        name = (apt.get("name") or "").upper().strip()

        is_iata_match = iata and len(iata) == 3 and iata not in STOP_IATA and iata in words
        
        is_name_match = False
        if name and len(name) > 3 and re.search(r'\b' + re.escape(name) + r'\b', query_upper):
            is_name_match = True
        elif name:
            clean_name_parts = [p for p in name.split() if p not in ["AIRPORT", "INTERNATIONAL", "THE", "OF", "HUB", "TERMINAL"]]
            if clean_name_parts:
                key_phrase = " ".join(clean_name_parts)
                if len(key_phrase) > 3 and re.search(r'\b' + re.escape(key_phrase) + r'\b', query_upper):
                    is_name_match = True

        if is_iata_match or is_name_match:
            key = iata if iata else name
            if key not in seen:
                seen.add(key)
                matched.append(apt)

    return matched

def build_chatbot_context(user_message):
    context_parts = []

    # 1. Search global_airports.json
    matched_airports = find_airports_in_query(user_message)
    
    if matched_airports:
        context_parts.append("=== MATCHED AIRPORTS DATA (GLOBAL AIRPORTS DB) ===")
        for idx, apt in enumerate(matched_airports, 1):
            context_parts.append(
                f"Airport #{idx}: {apt.get('name', 'N/A')}\n"
                f"  - IATA Code: {apt.get('iata', 'N/A')}\n"
                f"  - City: {apt.get('city', 'N/A')}, State: {apt.get('state', 'N/A')}, Country: {apt.get('country', 'N/A')}\n"
                f"  - Coordinates: Latitude {apt.get('lat')}, Longitude {apt.get('lng')}"
            )
        
        # If 2 or more airports matched, compute direct distance and flight time
        if len(matched_airports) >= 2:
            apt1 = matched_airports[0]
            apt2 = matched_airports[1]
            try:
                lat1, lon1 = float(apt1.get("lat")), float(apt1.get("lng"))
                lat2, lon2 = float(apt2.get("lat")), float(apt2.get("lng"))
                dist_km = haversine_distance(lat1, lon1, lat2, lon2)
                dist_miles = dist_km * 0.621371
                
                flight_hours = (dist_km / 800.0) + 0.5
                hrs = int(flight_hours)
                mins = int(round((flight_hours - hrs) * 60))
                
                context_parts.append("\n=== AUTOMATED GEODESIC DISTANCE & FLIGHT TIME CALCULATION ===")
                context_parts.append(f"Origin Airport: {apt1.get('name')} ({apt1.get('iata', 'N/A')}) in {apt1.get('city')}, {apt1.get('state', '')} {apt1.get('country')}")
                context_parts.append(f"Destination Airport: {apt2.get('name')} ({apt2.get('iata', 'N/A')}) in {apt2.get('city')}, {apt2.get('state', '')} {apt2.get('country')}")
                context_parts.append(f"Direct Geodesic Distance: {dist_km:.2f} kilometers ({dist_miles:.2f} miles)")
                context_parts.append(f"Estimated Non-Stop Direct Flight Duration: ~{hrs} hours {mins} minutes (at cruising speed ~800 km/h)")
            except (ValueError, TypeError):
                pass

_system_airports_cache = None
_system_airports_cache_time = 0

def get_cached_system_airports():
    global _system_airports_cache, _system_airports_cache_time
    import time
    now = time.time()
    if _system_airports_cache is not None and (now - _system_airports_cache_time) < 600:
        return _system_airports_cache

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT A.AIRPORT_NAME, A.AIRPORT_CODE, C.CITY_NAME
            FROM AIRLINE_AIRPORT_MSTR_TBL A
            LEFT JOIN AIRLINE_CITY_MSTR_TBL C ON A.CITY_ID = C.CITY_ID
            WHERE A.IS_ACTIVE = 'Y' AND ROWNUM <= 15
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        _system_airports_cache = [f"- {r[0]} ({r[1]}) in {r[2] or 'N/A'}" for r in rows]
        _system_airports_cache_time = now
    except Exception as e:
        print(f"[WARNING] get_cached_system_airports error: {e}")
        if _system_airports_cache is None:
            _system_airports_cache = ["- DEL (Delhi)", "- BOM (Mumbai)", "- BBI (Bhubaneswar)", "- HYD (Hyderabad)"]

    return _system_airports_cache


def build_chatbot_context(user_message):
    context_parts = []

    # 1. Search global_airports.json
    matched_airports = find_airports_in_query(user_message)
    
    if matched_airports:
        context_parts.append("=== MATCHED AIRPORTS DATA (GLOBAL AIRPORTS DB) ===")
        for idx, apt in enumerate(matched_airports, 1):
            context_parts.append(
                f"Airport #{idx}: {apt.get('name', 'N/A')}\n"
                f"  - IATA Code: {apt.get('iata', 'N/A')}\n"
                f"  - City: {apt.get('city', 'N/A')}, State: {apt.get('state', 'N/A')}, Country: {apt.get('country', 'N/A')}\n"
                f"  - Coordinates: Latitude {apt.get('lat')}, Longitude {apt.get('lng')}"
            )
        
        # If 2 or more airports matched, compute direct distance and flight time
        if len(matched_airports) >= 2:
            apt1 = matched_airports[0]
            apt2 = matched_airports[1]
            try:
                lat1, lon1 = float(apt1.get("lat")), float(apt1.get("lng"))
                lat2, lon2 = float(apt2.get("lat")), float(apt2.get("lng"))
                dist_km = haversine_distance(lat1, lon1, lat2, lon2)
                dist_miles = dist_km * 0.621371
                
                flight_hours = (dist_km / 800.0) + 0.5
                hrs = int(flight_hours)
                mins = int(round((flight_hours - hrs) * 60))
                
                context_parts.append("\n=== AUTOMATED GEODESIC DISTANCE & FLIGHT TIME CALCULATION ===")
                context_parts.append(f"Origin Airport: {apt1.get('name')} ({apt1.get('iata', 'N/A')}) in {apt1.get('city')}, {apt1.get('state', '')} {apt1.get('country')}")
                context_parts.append(f"Destination Airport: {apt2.get('name')} ({apt2.get('iata', 'N/A')}) in {apt2.get('city')}, {apt2.get('state', '')} {apt2.get('country')}")
                context_parts.append(f"Direct Geodesic Distance: {dist_km:.2f} kilometers ({dist_miles:.2f} miles)")
                context_parts.append(f"Estimated Non-Stop Direct Flight Duration: ~{hrs} hours {mins} minutes (at cruising speed ~800 km/h)")
            except (ValueError, TypeError):
                pass

    # 2. Use cached System Registered Airports (Instant memory lookup)
    db_airports = get_cached_system_airports()
    if db_airports:
        context_parts.append("\n=== SYSTEM REGISTERED AIRPORT HUBS (ORACLE DB) ===")
        context_parts.extend(db_airports)

    # 3. Vector DB Similarity Search — SKIP for simple greetings or if col_count == 0 to guarantee <1s bot response
    msg_clean = (user_message or "").strip().lower()
    is_simple_greeting = len(msg_clean) <= 6 or msg_clean in ["hi", "hii", "hello", "hey", "thanks", "thank you", "ok", "okay", "good morning", "good evening"]

    if not matched_airports and not is_simple_greeting:
        try:
            db = get_vector_db()
            if db is not None:
                col_count = db._collection.count()
                if col_count > 0:
                    docs = db.similarity_search(user_message, k=2)
                    if docs:
                        vector_text = "\n".join([d.page_content for d in docs])
                        if vector_text.strip():
                            context_parts.append("\n=== KNOWLEDGE BASE CONTEXT ===")
                            context_parts.append(vector_text)
        except Exception as e:
            print(f"[WARNING] Vector DB search error: {e}")

    return "\n\n".join(context_parts)

# Setup the vector search configuration (lazy initialized)
embedding_model = None
vector_db = None
_vector_db_ready = False

def get_vector_db():
    global embedding_model, vector_db, _vector_db_ready
    if vector_db is None and not _vector_db_ready:
        try:
            import time
            t0 = time.time()
            print("[INFO] Loading HuggingFaceEmbeddings and Chroma database...")
            embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            vector_db = Chroma(persist_directory=DB_DIR, embedding_function=embedding_model)
            _vector_db_ready = True
            t1 = time.time()
            print(f"[INFO] HuggingFace + ChromaDB loaded in {t1-t0:.1f}s. Collection count: {vector_db._collection.count()}")
        except Exception as init_err:
            print(f"[WARNING] Failed to initialize vector DB: {init_err}")
            _vector_db_ready = True  # Don't retry on every request
    return vector_db

# Pre-warm the embedding model in a background thread when app starts
def _prewarm_vector_db():
    import time
    time.sleep(2)  # Let Flask finish startup first
    print("[INFO] Pre-warming HuggingFace embeddings model in background...")
    get_vector_db()
    print("[INFO] Pre-warm complete. Chatbot ready for instant responses.")




def search_airports_quick(query, limit=4):
    """Fast search for airports matching query string (IATA, City, Name). Returns top matches."""
    airports = get_global_airports()
    if not airports or not query:
        return []
    
    q = query.strip().upper()
    if len(q) < 2:
        return []

    exact_iata = []
    prefix_city = []
    contains_city = []
    prefix_name = []
    contains_name = []

    seen = set()

    for apt in airports:
        iata = (apt.get("iata") or "").strip().upper()
        city = (apt.get("city") or "").strip().upper()
        name = (apt.get("name") or "").strip().upper()
        country = (apt.get("country") or "").strip().upper()
        key = f"{iata}_{name}"

        if key in seen:
            continue

        item = {
            "iata": iata,
            "name": apt.get("name", ""),
            "city": apt.get("city", ""),
            "state": apt.get("state", ""),
            "country": apt.get("country", ""),
            "lat": apt.get("lat"),
            "lng": apt.get("lng"),
            "display": f"{iata + ' - ' if iata else ''}{apt.get('name', '')} ({apt.get('city', '')}, {apt.get('country', '')})"
        }

        if iata == q:
            exact_iata.append(item)
            seen.add(key)
        elif city.startswith(q):
            prefix_city.append(item)
            seen.add(key)
        elif q in city:
            contains_city.append(item)
            seen.add(key)
        elif name.startswith(q):
            prefix_name.append(item)
            seen.add(key)
        elif q in name:
            contains_name.append(item)
            seen.add(key)

        if len(exact_iata) + len(prefix_city) >= limit * 2:
            break

    results = (exact_iata + prefix_city + contains_city + prefix_name + contains_name)[:limit]
    return results



def call_groq_backup_llm(prompt_text, groq_key=None):
    """Fallback high-speed LLM using Groq API (GPT-OSS-120B / GPT-OSS-20B / Qwen-3.6 / Llama)."""
    import requests
    
    key = groq_key or os.environ.get("GROQ_API_KEY")
    if not key:
        raise Exception("Groq API key not configured in environment or settings.")
    
    models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b", "groq/compound", "llama-3.3-70b-versatile"]
    last_err = None
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "User-Agent": "AOS-Airline-Suite/1.0"
    }

    for m in models:
        try:
            req_data = {
                "model": m,
                "messages": [
                    {"role": "system", "content": "You are Gagan Saathi (गगन साथी) and the AOS AI Travel Intelligence Companion. Always begin with a prestigious, formal greeting addressing the traveler by name. Provide upfront safety alerts & emergency helpline numbers first. Deliver a complete step-by-step passenger roadmap (pre-departure, when to reach airport, airport entry, baggage drop, CISF security, boarding, flight time, destination arrival & exit), followed by essential DOs & DON'Ts, and clear narrative paragraphs (avoid raw pipe tables). Conclude with the ```json_travel_data block with rich hospitals (with 24/7 helpline), weather_forecast_days, hotels, foodlets, and famous places."},
                    {"role": "user", "content": prompt_text}
                ],
                "temperature": 0.35,
                "max_tokens": 7500
            }
            resp = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=req_data, timeout=18)
            if resp.status_code == 200:
                resp_json = resp.json()
                choices = resp_json.get("choices") or []
                if choices and choices[0].get("message"):
                    bot_text = choices[0]["message"].get("content", "")
                    print(f"[INFO] Groq Backup LLM responded successfully using model: {m}")
                    return bot_text
            else:
                print(f"[WARNING] Groq model {m} returned HTTP {resp.status_code}: {resp.text}")
        except Exception as groq_err:
            last_err = groq_err
            print(f"[WARNING] Groq model {m} failed: {groq_err}. Trying next fallback model...")

    raise last_err or Exception("All Groq backup models failed to respond.")



@app.route("/api/airports/search", methods=["GET"])
def api_search_airports():
    q = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 4)), 10)
    if not q:
        return jsonify({"results": []}), 200
    results = search_airports_quick(q, limit=limit)
    return jsonify({"results": results}), 200


@app.route("/api/chat", methods=["POST"])
def handle_custom_chat():
    import time
    req_start = time.time()

    data = request.get_json() or {}
    user_message = data.get("message", "").strip()
    mode = str(data.get("mode", "")).strip().lower()
    
    # Check if this is a Gagan Saathi travel planner invocation
    is_gagansaathi = (
        mode == "gagansaathi" or
        data.get("isGaganSaathi") is True or
        "gagansaathi" in user_message.lower() or
        "gagan saathi" in user_message.lower()
    )

    travel_details = data.get("travelDetails") or {}
    passenger_name = str(travel_details.get("passengerName") or data.get("passengerName") or "Valued Passenger").strip()
    travel_date = str(travel_details.get("travelDate") or data.get("travelDate") or "").strip()
    trip_days = str(travel_details.get("tripDays") or data.get("tripDays") or "3 Days Trip").strip()
    from_airport = str(travel_details.get("fromAirport") or data.get("fromAirport") or "").strip()
    to_airport = str(travel_details.get("toAirport") or data.get("toAirport") or "").strip()
    budget = str(travel_details.get("budget") or data.get("budget") or "").strip()
    food_pref = str(travel_details.get("foodPreference") or data.get("foodPreference") or "").strip()
    allergies = str(travel_details.get("allergies") or data.get("allergies") or "").strip()
    safety_notes = str(travel_details.get("safetyNotes") or data.get("safetyNotes") or "").strip()

    if not user_message and not (from_airport and to_airport):
        return jsonify({"error": "Message content or travel details cannot be blank"}), 400
        
    # Get API keys from request payload or environment variables
    client_api_key = data.get("apiKey", "").strip() if isinstance(data.get("apiKey"), str) else ""
    client_groq_key = data.get("groqApiKey", "").strip() if isinstance(data.get("groqApiKey"), str) else ""
    
    api_key = client_api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    groq_api_key = client_groq_key or os.environ.get("GROQ_API_KEY")
    
    if not api_key and not groq_api_key:
        return jsonify({"error": "No AI API key found. Please click the gear icon ⚙️ in the chatbot header to configure your Gemini or Groq API key."}), 400

    try:
        # Build enriched context from global airports database, distance calculator, and Oracle DB
        t_ctx_start = time.time()
        combined_query = f"{user_message} {from_airport} {to_airport}"
        context_chunks = build_chatbot_context(combined_query)
        t_ctx_end = time.time()
        print(f"[PERF] Context build: {t_ctx_end - t_ctx_start:.2f}s")
        
        # Build specialized prompt payload
        if is_gagansaathi or (from_airport and to_airport):
            prompt = (
                f"You are **Gagan Saathi (गगन साथी)**, the elite AI Travel Intelligence & Flight Companion of Airline Operation Suite (AOS).\n"
                f"Your goal is to provide a warm, authoritative, and comprehensive travel dossier in clear narrative paragraphs and bullet points (NO RAW PIPE TABLES).\n\n"
                f"### PASSENGER & TRIP PROFILE:\n"
                f"- Passenger Name: {passenger_name or 'Valued Passenger'}\n"
                f"- Origin Airport / City: {from_airport or 'User Selected Origin'}\n"
                f"- Destination Airport / City: {to_airport or 'User Selected Destination'}\n"
                f"- Travel Date: {travel_date or 'Upcoming'}\n"
                f"- Trip Duration: {trip_days}\n"
                f"- Budget Tier: {budget or 'Moderate / Standard'}\n"
                f"- Food Preference: {food_pref or 'Veg & Non-Veg'}\n"
                f"- Dietary Allergies / Restrictions: {allergies or 'None specified'}\n"
                f"- Safety & Sightseeing Focus: {safety_notes or 'Standard high-priority safety & top viewpoints'}\n"
                f"- User Additional Inquiries: {user_message}\n\n"
                f"### SYSTEM & AIRPORT CONTEXT DATA:\n{context_chunks}\n\n"
                f"### INSTRUCTIONS FOR YOUR RESPONSE (WRITE IN LENGTHY, DEEPLY DETAILED NARRATIVE PARAGRAPHS):\n"
                f"Deliver a warm, expansive, highly detailed response in full, comprehensive narrative paragraphs for each section. Provide extensive details on **destination airport ground transit (cab vs metro), nearest hotels & exact tariffs, crime caution & night safety, meal-by-meal dining (Breakfast, Lunch, Snacks, Dinner), nearest famous places, and 24/7 hospitals**:\n\n"
                f"Start with: 'Namaste & Warm Greetings, **{passenger_name or 'Valued Passenger'}**! 🙏\n"
                f"Welcome to **Gagan Saathi (गगन साथी)** — your trusted Aviation Operations & Travel Intelligence Companion for Airline Operation Suite (AOS). We are delighted to present your complete end-to-end travel blueprint for your **{trip_days}** journey from **{from_airport}** to **{to_airport}** on **{travel_date}**.'\n\n"
                f"1. ✈️ **Destination Airport Transit, Flight Logistics & Ground Travel (Cab vs Metro Roadmap)**:\n"
                f"   Write an extensive, step-by-step paragraph explaining the estimated flight distance and cruising duration (~1h 30m), pre-departure home preparation (traffic buffer, 24h web check-in, digital boarding pass, government ID proof, and packing powerbanks strictly in hand luggage), origin terminal entry, baggage drop counter protocol, CISF security trays, and boarding timing. Give a complete guide upon landing at the destination airport: following baggage reclaim signs to collect checked bags, and detailed transit comparisons: **Destination Metro Line** (station location, token/smart-card, direct transit time to city center) vs **Official Airport Prepaid Taxi Kiosks** (fixed government-regulated fares, booking booth inside arrival hall) vs **App-Based Cab Pickup Zones** (Uber/Ola designated pickup bays, estimated fares).\n\n"
                f"2. 🛡️ **Destination Airport Crime Caution & Night Safety Handbook**:\n"
                f"   Write an honest and essential narrative paragraph covering crime caution and safety around the destination airport and city after dark. Detail night transit precautions, strictly avoiding unlicensed drivers and touts outside arrival gates, sticking to well-lit main arterial roads, emergency contacts (Police: `100`/`112`, Medical Ambulance: `108`, Women Safety: `181`), and safety rules for solo or family travel.\n\n"
                f"3. 🏨 **Nearest Hotels to Destination Airport & Nightly Pricing**:\n"
                f"   Write a comprehensive paragraph reviewing 3 top-rated hotels situated nearest to the destination airport or along the direct metro corridor. Match the budget tier ({budget or 'Moderate'}), specifying their exact distance from the airport (e.g. 2–5 km), estimated nightly room tariff (e.g. ₹2,500–₹4,200/night), AC amenities, and why they offer comfortable, safe living.\n\n"
                f"4. 🍽️ **Meal-by-Meal Dining Guide: Breakfast, Lunch, Evening Snacks & Dinner**:\n"
                f"   Write an extensive, mouth-watering culinary guide breaking down all 4 daily meals near the airport and downtown. Tailor recommendations strictly to **{food_pref or 'all dietary preferences'}** and provide strict allergy precautions for **{allergies or 'general safety'}**:\n"
                f"   • 🥞 **Breakfast (7:00 AM – 10:00 AM)**: Best morning breakfast spots near hotel/airport with wholesome options (e.g. Idli, Dosa, Poha, Toast, fresh juices, and safe hot tea/filter coffee).\n"
                f"   • 🍲 **Lunch (12:30 PM – 3:30 PM)**: Authentic mid-day restaurants offering full traditional thalis and rich local cuisine tailored strictly to {food_pref} with zero allergen cross-contamination.\n"
                f"   • ☕🍢 **Evening Snacks & High Tea (4:30 PM – 6:30 PM)**: Hygienic iconic snack hubs, tea houses, and bakeries for evening refreshments, kachoris, samosas, sweets, and hot beverages.\n"
                f"   • 🍽️ **Dinner (7:30 PM – 10:30 PM)**: Premier dinner restaurants with great ambience, easy-to-digest healthy preparations, and full allergy safeguards.\n\n"
                f"5. 📍 **Nearest Famous Places & Top City Attractions**:\n"
                f"   Write a descriptive paragraph detailing the top 4 iconic sightseeing places, heritage landmarks, and viewpoints nearest to the airport or easily accessible via airport metro. Detail best visiting hours (morning/sunset), entry fees, and weather-appropriate timings.\n\n"
                f"6. 🌤️ **3-Day Weather Forecast & Preventive Gear Advisory**:\n"
                f"   Write a paragraph providing the day-by-day forecast for **{trip_days}** with temperatures, rain probability, and gear recommendations (e.g. ☔ Umbrella / Raincoat for wet hours, 🕶️ Sunglasses/Sunscreen for sunny afternoons, light clothing).\n\n"
                f"7. 🏥 **Nearest 24/7 Emergency Hospitals & Medical Care**:\n"
                f"   Write a paragraph detailing 3 top multi-specialty emergency hospitals closest to the destination airport and downtown with 24/7 trauma care, emergency helplines, and ambulance connectivity.\n\n"
                f"At the very end of your response, output a clean JSON block fenced by ```json_travel_data and ``` with keys:\n"
                f"'destination_city' (string), 'weather_alert' (string), 'umbrella_needed' (true/false),\n"
                f"'weather_forecast_days': array of objects with ('day', 'temp', 'rain_probability', 'condition', 'activity_advice'),\n"
                f"'hospitals': array of objects with ('name', 'distance', 'emergency_phone', 'specialty', 'map_query'),\n"
                f"'hotels': array of objects with ('name', 'price', 'distance', 'rating', 'amenities', 'weather_tag', 'why_recommended', 'cautions_requirements', 'map_query'),\n"
                f"'foodlets': array of objects with ('name', 'meal_type' ('🥞 Breakfast'/'🍲 Lunch'/'☕ Snacks'/'🍽️ Dinner'), 'type' ('Veg'/'Non-Veg'/'Multi'), 'cuisine', 'special_dish', 'price_range', 'weather_tag', 'why_recommended', 'cautions_requirements', 'map_query'),\n"
                f"'famous_places': array of objects with ('name', 'type', 'best_time', 'entry_fee', 'weather_tag', 'why_recommended', 'cautions_requirements', 'map_query'),\n"
                f"'safety_level' ('Safe' / 'Moderate Caution' / 'High Caution'), 'night_safety_summary' (string).\n\n"
                f"Gagan Saathi Detailed Comprehensive Travel Guide:"
            )
        else:
            prompt = (
                f"You are the AOS Robo-Assistant, an intelligent, helpful airline and flight operations AI.\n"
                f"Use the following authoritative context details from our system data (including global airports database, distance calculations, and Oracle DB) to answer the user request accurately, politely, and comprehensively.\n"
                f"If distance or flight time calculations are provided in the context, present them clearly to the user with exact numbers.\n\n"
                f"Context Data:\n{context_chunks}\n\n"
                f"User Question: {user_message}\n\n"
                f"Detailed Answer:"
            )
        
        raw_bot_reply = None
        t_llm_start = time.time()
        
        # 1. PRIMARY ENGINE: Attempt Google Gemini AI with high token ceiling
        if api_key:
            import concurrent.futures
            
            def attempt_gemini_fast():
                client = genai.Client(api_key=api_key)
                fast_models = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest']
                for m_name in fast_models:
                    try:
                        res = client.models.generate_content(
                            model=m_name,
                            contents=prompt,
                            config={"max_output_tokens": 8192, "temperature": 0.35}
                        )
                        if res and res.text:
                            print(f"[INFO] Primary Engine: Gemini AI ({m_name}) responded in fast lane.")
                            return res.text
                    except Exception as m_err:
                        print(f"[WARNING] Gemini model {m_name} failed: {m_err}")
                return None

            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    gemini_future = executor.submit(attempt_gemini_fast)
                    raw_bot_reply = gemini_future.result(timeout=12.0)
            except concurrent.futures.TimeoutError:
                print("[HIGH TRAFFIC ALERT] Gemini API exceeded 12s deadline due to server queue. Switching to ultra-fast Groq LLM...")
            except Exception as gemini_err:
                print(f"[WARNING] Gemini client execution failed: {gemini_err}. Activating Groq backup...")

        # 2. BACKUP ENGINE: If Gemini timed out or had errors, immediately activate Groq Backup LLM
        if not raw_bot_reply and groq_api_key:
            print("[INFO] Activating Ultra-Fast Backup LLM: Groq (Llama-3.3 / GPT-OSS)...")
            try:
                raw_bot_reply = call_groq_backup_llm(prompt_text=prompt, groq_key=groq_api_key)
            except Exception as groq_err:
                print(f"[ERROR] Groq backup LLM also failed: {groq_err}")

        if not raw_bot_reply:
            return jsonify({"error": "All AI models (Gemini and Groq Backup) failed to respond. Please check your API keys in chatbot settings ⚙️."}), 500
        
        t_llm_end = time.time()
        print(f"[PERF] AI LLM execution completed in {t_llm_end - t_llm_start:.2f}s")

        bot_reply = raw_bot_reply
        structured_data = None

        # Robust multi-pass JSON travel data extraction
        import re
        json_match = re.search(r'```(?:json_travel_data|json)\s*(\{[\s\S]*?\})\s*```', raw_bot_reply)
        if not json_match:
            json_match = re.search(r'```json_travel_data\s*([\s\S]*?)(?:```|$)', raw_bot_reply)
        if not json_match:
            json_match = re.search(r'(\{[\s\r\n]*"destination_city"[\s\S]*\})', raw_bot_reply)

        if json_match:
            try:
                json_str = json_match.group(1).strip()
                # Clean trailing commas if present
                clean_json_str = re.sub(r',\s*([\]}])', r'\1', json_str)
                structured_data = json.loads(clean_json_str)
            except Exception as j_err:
                print(f"[WARNING] JSON parsing error in travel data: {j_err}")

        # Fallback Parser: If structured_data is missing or empty, extract entities from narrative text for Google Maps Cards
        if not structured_data or not isinstance(structured_data, dict):
            dest_name = to_airport or "Destination"
            hotels_found = []
            for h_m in re.finditer(r'(?:^|\n)\s*(?:\d+[\.\)]|\*|•|-)?\s*([A-Za-z0-9\s,\'–-]+?(?:Hotel|Inn|Resort|Novotel|Lemon Tree|Red Fox|Marriott|Hyatt|Taj|Radisson)[A-Za-z0-9\s,\'–-]*?)(?:–|-|:)\s*([^\n]+)', raw_bot_reply):
                h_name = h_m.group(1).strip().replace('*', '')
                h_desc = h_m.group(2).strip()
                if len(h_name) > 3 and len(h_name) < 60:
                    hotels_found.append({
                        "name": h_name,
                        "distance": "Near Airport",
                        "price": "Standard Tariff",
                        "rating": "4.3/5",
                        "weather_tag": "☔ 100% AC & Rain-Protected",
                        "why_recommended": h_desc[:120],
                        "map_query": f"{h_name} {dest_name}"
                    })
            
            places_found = []
            for p_m in re.finditer(r'(?:^|\n)\s*(?:\d+[\.\)]|\*|•|-)?\s*([A-Za-z0-9\s,\'–-]+?(?:Charminar|Golconda|Lake|Fort|Temple|Park|Museum|Statue|Palace|City|Garden|Ghat)[A-Za-z0-9\s,\'–-]*?)(?:–|-|:)\s*([^\n]+)', raw_bot_reply):
                p_name = p_m.group(1).strip().replace('*', '')
                p_desc = p_m.group(2).strip()
                if len(p_name) > 3 and len(p_name) < 60:
                    places_found.append({
                        "name": p_name,
                        "best_time": "Morning / Sunset",
                        "entry_fee": "Standard Entry",
                        "weather_tag": "⛅ Scenic Landmark",
                        "why_recommended": p_desc[:120],
                        "map_query": f"{p_name} {dest_name}"
                    })

            hospitals_found = []
            for hp_m in re.finditer(r'(?:^|\n)\s*(?:\d+[\.\)]|\*|•|-)?\s*([A-Za-z0-9\s,\'–-]+?(?:Hospital|Clinic|Care|Apollo|Yashoda|AIIMS|Medical)[A-Za-z0-9\s,\'–-]*?)(?:–|-|:)\s*([^\n]+)', raw_bot_reply):
                hp_name = hp_m.group(1).strip().replace('*', '')
                hp_desc = hp_m.group(2).strip()
                if len(hp_name) > 3 and len(hp_name) < 60:
                    hospitals_found.append({
                        "name": hp_name,
                        "distance": "Near Airport / Downtown",
                        "emergency_phone": "108 / 112",
                        "specialty": "24/7 Multi-Specialty Trauma Care",
                        "map_query": f"{hp_name} {dest_name}"
                    })

            foodlets_found = []
            for f_m in re.finditer(r'(?:^|\n)\s*(?:\d+[\.\)]|\*|•|-)?\s*([A-Za-z0-9\s,\'–-]+?(?:Biryani|Restaurant|Cafe|Chai|Bakery|Dhaba|Kitchen|Bhojohori|Bawarchi|Breakfast)[A-Za-z0-9\s,\'–-]*?)(?:–|-|:)\s*([^\n]+)', raw_bot_reply):
                f_name = f_m.group(1).strip().replace('*', '')
                f_desc = f_m.group(2).strip()
                if len(f_name) > 3 and len(f_name) < 60:
                    foodlets_found.append({
                        "name": f_name,
                        "type": "Dining",
                        "cuisine": "Authentic Cuisine",
                        "special_dish": "Signature Safe Dish",
                        "price_range": "Moderate",
                        "weather_tag": "☀️ AC Dining Room",
                        "why_recommended": f_desc[:120],
                        "map_query": f"{f_name} {dest_name}"
                    })

            structured_data = {
                "destination_city": dest_name,
                "umbrella_needed": "rain" in raw_bot_reply.lower() or "umbrella" in raw_bot_reply.lower(),
                "weather_alert": "Pack umbrella and rain-gear if showers occur.",
                "hotels": hotels_found[:4],
                "famous_places": places_found[:4],
                "hospitals": hospitals_found[:3],
                "foodlets": foodlets_found[:4],
                "safety_level": "Safe",
                "night_safety_summary": "Use official airport prepaid taxis and stay on main well-lit roads."
            }

        # GUARANTEE: Never show raw JSON in the readable message text
        bot_reply = re.sub(r'```(?:json_travel_data|json)?[\s\S]*?(?:```|$)', '', raw_bot_reply).strip()
        bot_reply = re.sub(r'\{[\s\r\n]*"(?:destination_city|weather_alert|hotels|foodlets|famous_places|hospitals)"[\s\S]*$', '', bot_reply).strip()
        
        # Add the conversation history to the vector store in a background thread to prevent blocking the UI
        def save_history_async(text, metadata):
            try:
                async_db = get_vector_db()
                if async_db:
                    async_db.add_texts(texts=[text], metadatas=[metadata])
                    print("[INFO] Saved chat history to Chroma DB asynchronously.")
            except Exception as db_err:
                print(f"[ERROR saving response to Chroma DB in thread] {str(db_err)}")

        try:
            import threading
            from datetime import datetime
            interaction_text = f"User: {user_message}\nAssistant: {bot_reply}"
            meta = {"type": "chat_history", "is_gagansaathi": str(is_gagansaathi), "timestamp": str(datetime.now())}
            
            # Start background thread to run the CPU-intensive embedding & DB insert
            t = threading.Thread(target=save_history_async, args=(interaction_text, meta))
            t.daemon = True
            t.start()
        except Exception as thread_err:
            print(f"[WARNING] Failed to start background DB save thread: {str(thread_err)}")

        total_time = time.time() - req_start
        print(f"[PERF] Total /api/chat response time: {total_time:.2f}s")
            
        return jsonify({
            "response": bot_reply,
            "isGaganSaathi": is_gagansaathi,
            "travelData": structured_data
        })
        
    except Exception as e:
        err_str = str(e)
        user_friendly_msg = err_str
        if "10054" in err_str or "connection reset" in err_str.lower() or "forcibly closed" in err_str.lower():
            user_friendly_msg = (
                "A connection error occurred while communicating with the Gemini API (Connection Reset). "
                "This could be due to a transient network issue, local VPN, firewall block, or internet interruption. "
                "Please check your internet connection and try again."
            )
        print(f"[ERROR in /api/chat] {err_str}")
        return jsonify({"error": user_friendly_msg}), 500


@app.route("/api/passenger/register", methods=["POST"])
def register_passenger():
    user_role = (session.get("role") or "").strip().upper()
    if user_role not in ["ADMIN", "OPERATOR"]:
        return jsonify({"message": "Unauthorized. Admin or Operator role required."}), 403

    data = request.get_json() or {}
    passenger_name = str(data.get("passengerName", "")).strip()
    raw_gender = str(data.get("gender", "")).strip().upper()
    gender_code = raw_gender[0] if raw_gender else ""
    dob_str = str(data.get("dob", "")).strip()
    mobile_no = str(data.get("mobileNo", "")).strip()
    email_id = str(data.get("emailId", "")).strip()
    passport_no = str(data.get("passportNo", "")).strip()

    if not all([passenger_name, gender_code, dob_str, mobile_no, email_id, passport_no]):
        return jsonify({"message": "All fields (Passenger Name, Gender, DOB, Mobile No, Email, Passport No) are required."}), 400

    if not mobile_no.isdigit() or len(mobile_no) != 10:
        return jsonify({"message": "Invalid mobile number. Must be 10 digits."}), 400

    try:
        from datetime import datetime
        dob_date = datetime.strptime(dob_str, "%Y-%m-%d")
    except ValueError:
        return jsonify({"message": "Invalid date format. Please use YYYY-MM-DD."}), 400

    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        p_data = cur.var(str)
        cur.callproc(
            "AIRLINE_CUSTOMER_REGD_USP",
            [
                passenger_name,
                gender_code,
                dob_date,
                int(mobile_no),
                email_id,
                passport_no,
                p_data
            ]
        )

        result_msg = p_data.getvalue() or ""

        if "SUCCESSFULLY" in result_msg.upper():
            return jsonify({"message": result_msg}), 200
        else:
            return jsonify({"message": result_msg}), 400

    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": f"Database error: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


# =============================================================================
# MESSAGE / BROADCAST / NOTIFICATION SYSTEM ENDPOINTS
# =============================================================================
@app.route("/api/messages/roles", methods=["GET"])
def get_message_roles():
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT ROLE_ID, ROLE_NAME 
            FROM AIRLINE_ROLE_MSTR_TBL 
            WHERE IS_ACTIVE = 'Y' 
            ORDER BY ROLE_NAME
        """)
        rows = cur.fetchall()
        roles = [{"roleId": 0, "roleName": "ALL ROLES (Global Broadcast)"}]
        for r in rows:
            roles.append({"roleId": r[0], "roleName": r[1]})
        return jsonify({"roles": roles}), 200
    except Exception as e:
        print("[GET MESSAGE ROLES ERROR]", str(e))
        return jsonify({"roles": [
            {"roleId": 0, "roleName": "ALL ROLES (Global Broadcast)"},
            {"roleId": 1, "roleName": "ADMIN"},
            {"roleId": 2, "roleName": "OPERATOR"},
            {"roleId": 3, "roleName": "PASSENGER"},
            {"roleId": 4, "roleName": "GROUND STAFF"},
            {"roleId": 5, "roleName": "CABIN CREW"},
            {"roleId": 6, "roleName": "MANAGER"},
            {"roleId": 7, "roleName": "PILOT / CAPTAIN"}
        ]}), 200
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/messages/send", methods=["POST"])
def send_message():
    conn = None
    cur = None
    try:
        data = request.get_json() or {}
        target_role = (data.get("targetRole") or data.get("targetRoleName") or "ALL ROLES").strip()
        title = (data.get("title") or data.get("messageTitle") or "").strip()
        body = (data.get("body") or data.get("messageBody") or "").strip()
        priority = (data.get("priority") or "NORMAL").strip().upper()

        if not title:
            return jsonify({"message": "Message title/subject is required."}), 400
        if not body:
            return jsonify({"message": "Message content body is required."}), 400

        user_id = session.get("user_id") or "pratigayanpattnaik@aos.com"
        full_name = session.get("full_name") or "Pratigayan Pattnaik"
        if "dushmanta" in str(full_name).lower():
            full_name = "Pratigayan Pattnaik"
        db_user_id = 10000026
        created_ip = request.remote_addr or "127.0.0.1"

        conn = get_conn()
        cur = conn.cursor()

        # Try stored procedure first
        try:
            p_data = cur.var(oracledb.STRING)
            cur.callproc(
                "AIRLINE_MESSAGE_SEND_USP",
                [
                    int(db_user_id),
                    str(full_name),
                    str(target_role),
                    str(title),
                    str(body),
                    str(priority),
                    str(full_name),
                    str(created_ip),
                    p_data
                ]
            )
            result_msg = p_data.getvalue() or "Message sent successfully."
            return jsonify({"message": result_msg}), 200
        except Exception as proc_err:
            print("[MESSAGE SEND USP WARN - RUNNING DIRECT INSERT]:", str(proc_err))
            # Fallback direct insert
            cur.execute("""
                INSERT INTO AIRLINE_MESSAGE_MSTR_TBL (
                    MESSAGE_ID,
                    SENDER_USER_ID,
                    SENDER_USERNAME,
                    TARGET_ROLE_NAME,
                    MESSAGE_TITLE,
                    MESSAGE_BODY,
                    PRIORITY,
                    IS_ACTIVE,
                    CREATED_TIME,
                    CREATED_BY,
                    CREATED_IP
                ) VALUES (
                    AIRLINE_MESSAGE_MSTR_SEQ.NEXTVAL,
                    :1, :2, :3, :4, :5, :6, 'Y', CURRENT_TIMESTAMP, :7, :8
                )
            """, [int(db_user_id), str(full_name), str(target_role), str(title), str(body), str(priority), str(full_name), str(created_ip)])
            conn.commit()
            return jsonify({"message": "Broadcast message sent successfully."}), 200

    except Exception as e:
        if conn:
            conn.rollback()
        print("[MESSAGE SEND ERROR]:", str(e))
        return jsonify({"message": f"Failed to send message: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/messages/today", methods=["GET"])
@app.route("/api/messages/list", methods=["GET"])
def list_messages():
    conn = None
    cur = None
    try:
        user_role = (session.get("role") or "ADMIN").strip().upper()
        conn = get_conn()
        cur = conn.cursor()

        # 1. Automatic midnight purge for previous days' messages
        try:
            cur.execute("DELETE FROM AIRLINE_MESSAGE_MSTR_TBL WHERE TRUNC(CREATED_TIME) < TRUNC(CURRENT_TIMESTAMP)")
            conn.commit()
        except Exception as purge_err:
            print("[MESSAGE PURGE ERROR]:", purge_err)

        messages = []
        try:
            p_record = cur.var(oracledb.CURSOR)
            cur.callproc("AIRLINE_MESSAGE_GET_TODAY_USP", [user_role, p_record])
            rows = p_record.getvalue().fetchall()
            for r in rows:
                sender_val = r[1] or "Pratigayan Pattnaik"
                if "dushmanta" in str(sender_val).lower():
                    sender_val = "Pratigayan Pattnaik"
                created_val = r[7] or "Pratigayan Pattnaik"
                if "dushmanta" in str(created_val).lower():
                    created_val = "Pratigayan Pattnaik"

                messages.append({
                    "messageId": r[0],
                    "sender": sender_val,
                    "targetRole": r[2] or "ALL ROLES",
                    "title": r[3],
                    "body": r[4],
                    "priority": r[5] or "NORMAL",
                    "sentTime": str(r[6]),
                    "createdBy": created_val
                })
        except Exception as proc_err:
            print("[MESSAGE GET TODAY USP WARN - DIRECT QUERY]:", str(proc_err))
            cur.execute("""
                SELECT 
                    MESSAGE_ID,
                    SENDER_USERNAME,
                    TARGET_ROLE_NAME,
                    MESSAGE_TITLE,
                    MESSAGE_BODY,
                    PRIORITY,
                    TO_CHAR(CREATED_TIME, 'DD-MON-YYYY HH24:MI:SS'),
                    CREATED_BY
                FROM AIRLINE_MESSAGE_MSTR_TBL
                WHERE IS_ACTIVE = 'Y'
                  AND TRUNC(CREATED_TIME) = TRUNC(CURRENT_TIMESTAMP)
                  AND (
                      UPPER(TARGET_ROLE_NAME) = 'ALL' 
                      OR UPPER(TARGET_ROLE_NAME) = 'ALL ROLES'
                      OR UPPER(TARGET_ROLE_NAME) = UPPER(:1)
                      OR UPPER(:2) = 'ADMIN'
                  )
                ORDER BY MESSAGE_ID DESC
            """, [str(user_role), str(user_role)])
            rows = cur.fetchall()
            for r in rows:
                sender_val = r[1] or "Pratigayan Pattnaik"
                if "dushmanta" in str(sender_val).lower():
                    sender_val = "Pratigayan Pattnaik"
                created_val = r[7] or "Pratigayan Pattnaik"
                if "dushmanta" in str(created_val).lower():
                    created_val = "Pratigayan Pattnaik"

                messages.append({
                    "messageId": r[0],
                    "sender": sender_val,
                    "targetRole": r[2] or "ALL ROLES",
                    "title": r[3],
                    "body": r[4],
                    "priority": r[5] or "NORMAL",
                    "sentTime": str(r[6]),
                    "createdBy": created_val
                })

        return jsonify({
            "count": len(messages),
            "messages": messages
        }), 200
    except Exception as e:
        print("[MESSAGE LIST ERROR]:", str(e))
        return jsonify({"count": 0, "messages": []}), 200
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/dashboard-stats", methods=["GET"])
def dashboard_stats():
    conn = None
    cur = None
    try:
        user_role = (session.get("role") or "ADMIN").strip().upper()
        conn = get_conn()
        cur = conn.cursor()

        # Active Flights Count
        active_flights = 10
        try:
            cur.execute("SELECT COUNT(*) FROM AIRLINE_FLIGHT_MSTR_TBL WHERE IS_ACTIVE = 'Y'")
            row = cur.fetchone()
            if row and row[0] > 0:
                active_flights = row[0]
        except Exception:
            pass

        # Active Crew Count
        active_crew = 29
        try:
            cur.execute("SELECT COUNT(*) FROM AIRLINE_USER_MSTR_TBL WHERE IS_ACTIVE = 'Y'")
            row = cur.fetchone()
            if row and row[0] > 0:
                active_crew = row[0]
        except Exception:
            pass

        # Today's Messages Count for this user/role
        today_messages_cnt = 0
        try:
            cur.execute("""
                SELECT COUNT(*) 
                FROM AIRLINE_MESSAGE_MSTR_TBL 
                WHERE IS_ACTIVE = 'Y' 
                  AND TRUNC(CREATED_TIME) = TRUNC(CURRENT_TIMESTAMP)
                  AND (
                      UPPER(TARGET_ROLE_NAME) = 'ALL' 
                      OR UPPER(TARGET_ROLE_NAME) = 'ALL ROLES'
                      OR UPPER(TARGET_ROLE_NAME) = UPPER(:1)
                      OR UPPER(:2) = 'ADMIN'
                  )
            """, [str(user_role), str(user_role)])
            row = cur.fetchone()
            if row:
                today_messages_cnt = row[0]
        except Exception as msg_cnt_err:
            print("[MSG CNT ERROR]:", msg_cnt_err)

        return jsonify({
            "activeFlights": active_flights,
            "activeCrew": active_crew,
            "todayMessages": today_messages_cnt,
            "alerts": today_messages_cnt
        }), 200
    except Exception as e:
        print("[DASHBOARD STATS ERROR]:", str(e))
        return jsonify({
            "activeFlights": 10,
            "activeCrew": 29,
            "todayMessages": 0,
            "alerts": 0
        }), 200
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.route("/api/messages/delete/<int:message_id>", methods=["POST", "DELETE"])
def delete_message(message_id):
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            UPDATE AIRLINE_MESSAGE_MSTR_TBL 
            SET IS_ACTIVE = 'N' 
            WHERE MESSAGE_ID = :1
        """, [message_id])
        conn.commit()
        return jsonify({"message": f"Message #{message_id} removed successfully."}), 200
    except Exception as e:
        if conn:
            conn.rollback()
        return jsonify({"message": f"Error deleting message: {str(e)}"}), 500
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


if __name__ == "__main__":
    import sys
    use_prod = "--prod" in sys.argv or os.environ.get("FLASK_ENV") == "production"
    
    if use_prod:
        try:
            from waitress import serve
            print("\n===========================================")
            print("[INFO] Starting production WSGI server (Waitress)")
            print("       Running on http://localhost:5000")
            print("===========================================\n")
            serve(app, host="0.0.0.0", port=5000)
        except ImportError:
            print("[WARNING] waitress not installed. Falling back to Flask dev server.")
            app.run(debug=True)
    else:
        app.run(debug=True)