import os
import oracledb
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.environ.get("DB_USER", "airline")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "airline")
DB_HOST = os.environ.get("DB_HOST", "localhost")
DB_PORT = int(os.environ.get("DB_PORT", "1521"))
DB_SERVICE = os.environ.get("DB_SERVICE", "xepdb1")

dsn = oracledb.makedsn(DB_HOST, DB_PORT, service_name=DB_SERVICE)

try:
    conn = oracledb.connect(user=DB_USER, password=DB_PASSWORD, dsn=dsn)
    cur = conn.cursor()
    
    # PL/SQL script to create table if not exists
    create_sql = """
    DECLARE
        cnt NUMBER;
    BEGIN
        SELECT COUNT(*) INTO cnt FROM user_tables WHERE table_name = 'AIRLINE_SYSTEM_CONFIG';
        IF cnt = 0 THEN
            EXECUTE IMMEDIATE 'CREATE TABLE AIRLINE_SYSTEM_CONFIG (
                CONFIG_KEY VARCHAR2(100) PRIMARY KEY,
                CONFIG_VALUE VARCHAR2(4000),
                DESCRIPTION VARCHAR2(1000)
            )';
            EXECUTE IMMEDIATE 'INSERT INTO AIRLINE_SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION) 
                               VALUES (''FAST2SMS_API_KEY'', '''', ''Shared Fast2SMS API Key for the team'')';
            EXECUTE IMMEDIATE 'INSERT INTO AIRLINE_SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION) 
                               VALUES (''TWILIO_ACCOUNT_SID'', '''', ''Shared Twilio Account SID'')';
            EXECUTE IMMEDIATE 'INSERT INTO AIRLINE_SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION) 
                               VALUES (''TWILIO_AUTH_TOKEN'', '''', ''Shared Twilio Auth Token'')';
            EXECUTE IMMEDIATE 'INSERT INTO AIRLINE_SYSTEM_CONFIG (CONFIG_KEY, CONFIG_VALUE, DESCRIPTION) 
                               VALUES (''TWILIO_VERIFY_SERVICE_SID'', '''', ''Shared Twilio Verify Service SID'')';
            COMMIT;
            DBMS_OUTPUT.PUT_LINE('Table created and initialized successfully.');
        ELSE
            DBMS_OUTPUT.PUT_LINE('Table already exists.');
        END IF;
    END;
    """
    cur.execute(create_sql)
    conn.commit()
    print("Database command executed successfully.")
    
    # Query current rows in AIRLINE_SYSTEM_CONFIG
    cur.execute("SELECT CONFIG_KEY, CONFIG_VALUE, DESCRIPTION FROM AIRLINE_SYSTEM_CONFIG")
    rows = cur.fetchall()
    print("\nAIRLINE_SYSTEM_CONFIG rows:")
    for r in rows:
        print(f" - {r[0]}: {r[1]} ({r[2]})")
        
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {str(e)}")
