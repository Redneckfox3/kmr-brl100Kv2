import xlrd
import datetime
import os
import sys

# Ensure backend directory is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, SessionLocal, Base
import models

# Standard GWPs for common refrigerants
GWP_MAPPING = {
    "R32": 675.0,
    "R134A": 1430.0,
    "R410A": 2088.0,
    "R410": 2088.0,
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
    "MIX FLES RECLAIM": 2000.0,
    "MIX FLES": 2000.0,
}

def normalize_refrigerant_name(name: str) -> str:
    """Normalizes names like R-410a, R410A, r410a -> R410A"""
    if not name:
        return ""
    n = name.strip().replace("-", "").upper()
    if n == "R410":
        return "R410A"
    return n

def get_or_create_refrigerant(db, name: str) -> models.Refrigerant:
    norm_name = normalize_refrigerant_name(name)
    # Check if exists (using case-insensitive or exact match since we normalized)
    ref = db.query(models.Refrigerant).filter(models.Refrigerant.name == norm_name).first()
    if not ref:
        # Determine GWP
        gwp = GWP_MAPPING.get(norm_name, 2000.0) # default GWP to 2000 if not found
        is_natural = norm_name in ["R290", "R744", "CO2", "R600A"]
        ref = models.Refrigerant(
            name=norm_name,
            gwp=gwp,
            is_natural=is_natural
        )
        db.add(ref)
        db.commit()
        db.refresh(ref)
        print(f"[REFRIGERANT] Created {norm_name} (GWP: {gwp})")
    return ref

def parse_excel_date(val, datemode=0) -> str:
    if not val:
        return ""
    try:
        if isinstance(val, (int, float)):
            dt = datetime.datetime(*xlrd.xldate_as_tuple(val, datemode))
            return dt.strftime("%Y-%m-%d")
        else:
            return str(val).strip()
    except Exception:
        return str(val).strip()

def seed_database_from_kmr(kmr_path: str = "kmr"):
    db = SessionLocal()
    try:
        # Step 1: Re-create all tables for a clean start
        print("Dropping and re-creating database tables for a fresh seeding...")
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        if not os.path.exists(kmr_path):
            # Try parent folder if running from backend/
            alt_path = os.path.join("..", kmr_path)
            if os.path.exists(alt_path):
                kmr_path = alt_path
            else:
                print(f"Error: KMR spreadsheet file not found at {kmr_path}")
                return

        print(f"Opening KMR file: {kmr_path}")
        book = xlrd.open_workbook(kmr_path)

        # Step 2: Seed Starting Stocks from Sheet 3 "3 Koudemiddelbalans"
        # We look from row 18 onwards to find the inputs
        sheet3 = book.sheet_by_name("3 Koudemiddelbalans")
        print("\n--- Seeding Refrigerants & Starting Stocks from Sheet 3 ---")
        for r in range(18, sheet3.nrows):
            row_vals = [sheet3.cell_value(r, c) for c in range(sheet3.ncols)]
            ref_name = str(row_vals[0]).strip()
            if not ref_name:
                continue
            
            # Starting stock is in Column 1 ("Totale voorraad op 1 januari(kg.)")
            start_stock_val = row_vals[1]
            try:
                start_stock = float(start_stock_val) if start_stock_val != "" else 0.0
            except ValueError:
                start_stock = 0.0
                
            ref = get_or_create_refrigerant(db, ref_name)
            
            if start_stock > 0:
                # Create a starting stock transaction dated '2023-01-01'
                co2_eq = start_stock * ref.gwp
                start_tx = models.Transaction(
                    transaction_type=models.TransactionType.START_STOCK,
                    amount=start_stock,
                    co2_equivalent=co2_eq,
                    refrigerant_id=ref.id,
                    timestamp=datetime.datetime(2023, 1, 1),
                    note=f"Beginvoorraad van {ref.name} (Sheet 3)"
                )
                db.add(start_tx)
                print(f"[STOCK] Seeded starting stock for {ref.name}: {start_stock} kg")
        db.commit()

        # Step 3: Seed Work Registrations and Double-Entry Transactions from Sheet 2
        sheet2 = book.sheet_by_name("2 koudemiddelreg. op instal.")
        print("\n--- Seeding Work Registrations from Sheet 2 ---")
        
        registrations_count = 0
        for r in range(25, sheet2.nrows):
            row_vals = [sheet2.cell_value(r, c) for c in range(sheet2.ncols)]
            
            inst_id = str(row_vals[0]).strip()
            if not inst_id:
                continue # Skip empty rows
                
            inst_type = str(row_vals[1]).strip()
            work_date_str = parse_excel_date(row_vals[2], book.datemode)
            
            # Nominal capacity
            nom_charge_val = row_vals[3]
            nom_charge = None
            if nom_charge_val != "":
                try:
                    nom_charge = float(nom_charge_val)
                except ValueError:
                    pass
            
            ref_name = str(row_vals[4]).strip()
            if not ref_name:
                continue
                
            # Amount
            amount_val = row_vals[5]
            try:
                amount = float(amount_val) if amount_val != "" else 0.0
            except ValueError:
                amount = 0.0
                
            reason_rec = str(row_vals[6]).strip() if len(row_vals) > 6 else ""
            reason_fill = str(row_vals[7]).strip() if len(row_vals) > 7 else ""
            
            # Determine Action and Mutation types
            if reason_rec and not reason_fill:
                action_type = "Gewonnen" # INCOME
                # Map mutation type
                rec_lower = reason_rec.lower()
                if "afbraak" in rec_lower or "ontmanteling" in rec_lower or "sloop" in rec_lower:
                    mutation_type = "Afbraak"
                elif "retrofit" in rec_lower:
                    mutation_type = "Reparatie"
                else:
                    mutation_type = "Reparatie"
            else:
                action_type = "Verkocht/Gevuld" # OUTCOME
                # Map mutation type
                fill_lower = reason_fill.lower()
                if "nieuwbouw" in fill_lower or "nieuwe" in fill_lower:
                    mutation_type = "Nieuwbouw"
                elif "lekkage" in fill_lower or "lek" in fill_lower:
                    mutation_type = "Lekkage"
                else:
                    mutation_type = "Reparatie"
            
            ref = get_or_create_refrigerant(db, ref_name)
            
            # Create Work Registration
            work_reg = models.WorkRegistration(
                installation_id=inst_id,
                refrigerant_id=ref.id,
                installation_type=inst_type,
                nominal_charge=nom_charge,
                mutation_type=mutation_type,
                action_type=action_type,
                amount=amount,
                work_date=work_date_str,
                reason_recovery=reason_rec if reason_rec else None,
                reason_filling=reason_fill if reason_fill else None
            )
            db.add(work_reg)
            db.flush() # Populate work_reg.id
            
            # Create matching Transaction
            tx_type = models.TransactionType.INCOME if action_type == "Gewonnen" else models.TransactionType.OUTCOME
            co2_eq = amount * ref.gwp
            
            note_str = f"Werkregistratie op {inst_id}"
            if action_type == "Gewonnen" and reason_rec:
                note_str += f" (Terugwinnen: {reason_rec})"
            elif action_type == "Verkocht/Gevuld" and reason_fill:
                note_str += f" (Bijvullen: {reason_fill})"
                
            # Try to parse work date as transaction timestamp
            tx_timestamp = datetime.datetime.now()
            if work_date_str:
                try:
                    parts = [int(p) for p in work_date_str.split("-")]
                    tx_timestamp = datetime.datetime(parts[0], parts[1], parts[2], 12, 0)
                except Exception:
                    pass
                    
            tx = models.Transaction(
                transaction_type=tx_type,
                amount=amount,
                co2_equivalent=co2_eq,
                refrigerant_id=ref.id,
                work_registration_id=work_reg.id,
                note=note_str,
                timestamp=tx_timestamp
            )
            db.add(tx)
            registrations_count += 1
            print(f"[WORK_REG] Created #{registrations_count}: Date: {work_date_str}, Inst: {inst_id}, Type: {inst_type}, Ref: {ref.name}, Action: {action_type}, Amt: {amount} kg")
            
        db.commit()
        print(f"\nSuccessfully seeded {registrations_count} registrations!")
        
    except Exception as e:
        db.rollback()
        print(f"Error seeding database from KMR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    path = "kmr"
    if len(sys.argv) > 1:
        path = sys.argv[1]
    seed_database_from_kmr(path)
