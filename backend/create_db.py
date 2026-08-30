import psycopg2

try:
    conn = psycopg2.connect(
        dbname='postgres',
        user='postgres',
        password='postgres',
        host='localhost'
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'open_anpr'")
    if not cur.fetchone():
        cur.execute("CREATE DATABASE open_anpr")
        print("Database 'open_anpr' created successfully!")
    else:
        print("Database 'open_anpr' already exists.")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
