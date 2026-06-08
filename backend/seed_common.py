from database import SessionLocal
import models
from services import create_refrigerant

# Common refrigerants and their GWP values
GWP_MAPPING = {
    "R32": 675.0,
    "R134A": 1430.0,
    "R410A": 2088.0,
    "R404A": 3922.0,
    "R407C": 1774.0,
    "R407F": 1430.0,
    "R448A": 1387.0,
    "R449A": 1387.0,
    "R507": 3985.0,
    "R290": 3.0,
    "CO2": 1.0,
    "R744": 1.0,
    "R600A": 3.0,
    "R1234YF": 4.0,
    "R1234ZE": 1.0,
    "R454C": 465.0,
    "R22": 1810.0,
}

def seed_common_refrigerants():
    db = SessionLocal()
    try:
        print("Seeding common refrigerants...")
        for name, gwp in GWP_MAPPING.items():
            # Check if it exists
            existing = db.query(models.Refrigerant).filter(models.Refrigerant.name == name).first()
            if not existing:
                is_natural = name in ["R290", "R744", "CO2", "R600A"]
                ref = models.Refrigerant(
                    name=name,
                    gwp=gwp,
                    is_natural=is_natural
                )
                db.add(ref)
                print(f"Added {name} (GWP: {gwp})")
        db.commit()
        print("Successfully seeded common refrigerants.")
    except Exception as e:
        print(f"Error seeding refrigerants: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_common_refrigerants()
