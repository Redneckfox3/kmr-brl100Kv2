import sqlite3

def run_migration():
    conn = sqlite3.connect("ai_test/backend/brl100.db")
    cursor = conn.cursor()
    
    # Check if cylinder_id column already exists in work_registrations
    cursor.execute("PRAGMA table_info(work_registrations)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if "cylinder_id" not in columns:
        print("Column 'cylinder_id' not found in 'work_registrations'. Adding column...")
        try:
            cursor.execute("ALTER TABLE work_registrations ADD COLUMN cylinder_id INTEGER REFERENCES cylinders(id)")
            conn.commit()
            print("Successfully added 'cylinder_id' column to 'work_registrations' table.")
        except Exception as e:
            print(f"Error adding column: {e}")
    else:
        print("Column 'cylinder_id' already exists in 'work_registrations' table.")
        
    conn.close()

if __name__ == "__main__":
    run_migration()
