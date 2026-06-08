import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
import models

def test_query():
    db = SessionLocal()
    try:
        print("Querying work registrations...")
        regs = db.query(models.WorkRegistration).all()
        print(f"Success! Found {len(regs)} registrations.")
        for r in regs[:3]:
            print(f"ID: {r.id}, Installation: {r.installation_id}, Cylinder ID: {r.cylinder_id}")
    except Exception as e:
        print(f"Error querying database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_query()
