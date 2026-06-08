from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models

def seed_refrigerants():
    db = SessionLocal()
    
    refrigerants = [
        {"name": "R-134a", "gwp": 1430, "is_natural": False},
        {"name": "R-404A", "gwp": 3922, "is_natural": False},
        {"name": "R-410A", "gwp": 2088, "is_natural": False},
        {"name": "R-32", "gwp": 675, "is_natural": False},
        {"name": "R-407C", "gwp": 1774, "is_natural": False},
        {"name": "R-744 (CO2)", "gwp": 1, "is_natural": True},
        {"name": "R-290 (Propaan)", "gwp": 3, "is_natural": True},
        {"name": "R-600a (Isobutaan)", "gwp": 3, "is_natural": True},
        {"name": "R-717 (Ammoniak)", "gwp": 0, "is_natural": True},
        {"name": "R-1234yf", "gwp": 4, "is_natural": False},
    ]

    for ref_data in refrigerants:
        # Check if already exists
        exists = db.query(models.Refrigerant).filter(models.Refrigerant.name == ref_data["name"]).first()
        if not exists:
            db_refrigerant = models.Refrigerant(**ref_data)
            db.add(db_refrigerant)
            print(f"Added {ref_data['name']}")
        else:
            print(f"{ref_data['name']} already exists")
    
    db.commit()
    db.close()

if __name__ == "__main__":
    seed_refrigerants()
