import datetime
import os
import sys

# Ensure backend directory is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, SessionLocal, Base
import models

def reset_and_seed_with_destruction():
    db = SessionLocal()
    try:
        # Step 1: Re-create all tables for a clean start
        print("Dropping and re-creating database tables for a fresh zero-reset...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        # Step 2: Seed the 4 refrigerants with 0 starting stock
        refrigerants_to_seed = [
            {"name": "R410A", "gwp": 2088.0, "is_natural": False},
            {"name": "R407C", "gwp": 1774.0, "is_natural": False},
            {"name": "MIX FLES RECLAIM", "gwp": 2000.0, "is_natural": False},
            {"name": "R32", "gwp": 675.0, "is_natural": False},
        ]

        seeded_refs = {}
        for ref_data in refrigerants_to_seed:
            ref = models.Refrigerant(
                name=ref_data["name"],
                gwp=ref_data["gwp"],
                is_natural=ref_data["is_natural"]
            )
            db.add(ref)
            db.flush() # Populate ref.id
            seeded_refs[ref_data["name"]] = ref.id
            
            # Seed starting stock as 0.0
            start_tx = models.Transaction(
                transaction_type=models.TransactionType.START_STOCK,
                amount=0.0,
                co2_equivalent=0.0,
                refrigerant_id=ref.id,
                timestamp=datetime.datetime(2023, 1, 1),
                note=f"Beginvoorraad van {ref.name} (Gereset naar 0)"
            )
            db.add(start_tx)
            print(f"[STOCK] Seeded starting stock for {ref.name}: 0.0 kg")
        db.commit()

        # Step 3: Register a destruction transaction
        # Let's say we register a destruction of 10.0 kg of R32
        target_ref_name = "R32"
        target_ref_id = seeded_refs[target_ref_name]
        gwp = seeded_refs_gwp = 675.0
        destruction_amt = 10.0
        co2_eq = destruction_amt * gwp
        
        destruction_tx = models.Transaction(
            transaction_type=models.TransactionType.OUTCOME,
            amount=destruction_amt,
            co2_equivalent=co2_eq,
            refrigerant_id=target_ref_id,
            timestamp=datetime.datetime.now(),
            note="Vernietiging: Afgevoerd koudemiddel via erkend verwerker"
        )
        db.add(destruction_tx)
        db.commit()
        
        print(f"\n[DESTRUCTION] Successfully registered destruction of {destruction_amt} kg of {target_ref_name}!")
        print(f"The weight of {destruction_amt} kg is mutated and subtracted from the current stock of {target_ref_name} on the balance sheet.")
        
    except Exception as e:
        db.rollback()
        print(f"Error resetting database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_and_seed_with_destruction()
