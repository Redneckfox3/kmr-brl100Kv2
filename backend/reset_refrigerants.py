from database import engine, SessionLocal
from models import Refrigerant, Transaction, WorkRegistration, Cylinder, Installation, RefrigerantYearlyStock

def reset_refrigerants():
    db = SessionLocal()
    try:
        # Delete in order to satisfy foreign key constraints
        db.query(Transaction).delete()
        db.query(WorkRegistration).delete()
        db.query(Cylinder).delete()
        db.query(Installation).delete()
        db.query(RefrigerantYearlyStock).delete()
        db.query(Refrigerant).delete()
        db.commit()
        print("Refrigerant database has been cleared successfully.")
    except Exception as e:
        print(f"Error resetting database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reset_refrigerants()
