from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
import models, schemas
from fastapi import HTTPException

def get_refrigerants(db: Session):
    return db.query(models.Refrigerant).all()

def create_refrigerant(db: Session, refrigerant: schemas.RefrigerantCreate):
    # Normalize name
    name = refrigerant.name.upper().strip()

    # Check for uniqueness
    existing = db.query(models.Refrigerant).filter(models.Refrigerant.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Refrigerant name already exists")

    db_refrigerant = models.Refrigerant(
        name=name,
        gwp=refrigerant.gwp,
        is_natural=refrigerant.is_natural
    )
    db.add(db_refrigerant)
    db.commit()
    db.refresh(db_refrigerant)
    return db_refrigerant

def update_refrigerant(db: Session, id: int, refrigerant: schemas.RefrigerantCreate):
    db_ref = db.query(models.Refrigerant).filter(models.Refrigerant.id == id).first()
    if not db_ref:
        raise HTTPException(status_code=404, detail="Refrigerant not found")

    existing = db.query(models.Refrigerant).filter(
        models.Refrigerant.name == refrigerant.name,
        models.Refrigerant.id != id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Refrigerant name already exists")

    db_ref.name = refrigerant.name.upper().strip()
    db_ref.gwp = refrigerant.gwp
    db_ref.is_natural = refrigerant.is_natural

    db.commit()
    db.refresh(db_ref)
    return db_ref

def delete_refrigerant(db: Session, id: int):
    db_ref = db.query(models.Refrigerant).filter(models.Refrigerant.id == id).first()
    if not db_ref:
        raise HTTPException(status_code=404, detail="Refrigerant not found")

    # We automatically delete yearly stock records as they are derived/automatic
    db.query(models.RefrigerantYearlyStock).filter(models.RefrigerantYearlyStock.refrigerant_id == id).delete()

    # Check for more critical references (Audit/Legal history)
    has_installations = db.query(models.Installation).filter(models.Installation.refrigerant_id == id).first()
    has_cylinders = db.query(models.Cylinder).filter(models.Cylinder.refrigerant_id == id).first()
    has_work_regs = db.query(models.WorkRegistration).filter(models.WorkRegistration.refrigerant_id == id).first()
    has_transactions = db.query(models.Transaction).filter(models.Transaction.refrigerant_id == id).first()

    if any([has_installations, has_cylinders, has_work_regs, has_transactions]):
        raise HTTPException(
            status_code=400,
            detail=f"Koudemiddel {db_ref.name} kan niet worden verwijderd omdat er nog actieve koppelingen zijn met installaties, cilinders of werkregistraties. Verwijder eerst deze koppelingen."
        )

    db.delete(db_ref)
    db.commit()
    return {"message": f"Refrigerant {db_ref.name} deleted successfully"}

def get_refrigerant_stock(db: Session, year: int = None):

    if year is None:
        year = datetime.now().year

    refrigerants = db.query(models.Refrigerant).all()
    stock_report = []

    for r in refrigerants:
        yearly_stock = db.query(models.RefrigerantYearlyStock).filter(
            models.RefrigerantYearlyStock.refrigerant_id == r.id,
            models.RefrigerantYearlyStock.year == year
        ).first()
        start_stock = yearly_stock.start_stock if yearly_stock else 0.0

        # SQL Optimized: Sum income and outcome for this refrigerant in this year
        income = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.INCOME,
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        outcome = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.OUTCOME,
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        stock_report.append({
            "name": r.name,
            "current_stock": start_stock + income - outcome,
            "total_recovered": income,
            "total_consumed": outcome
        })
    return stock_report

def destroy_refrigerant(db: Session, data: schemas.DestructionCreate):
    refrigerant = db.query(models.Refrigerant).filter(models.Refrigerant.id == data.refrigerant_id).first()
    if not refrigerant:
        raise HTTPException(status_code=404, detail="Refrigerant not found")

    co2_eq = data.amount * refrigerant.gwp if refrigerant else 0.0

    db_transaction = models.Transaction(
        transaction_type=models.TransactionType.OUTCOME,
        amount=data.amount,
        refrigerant_id=data.refrigerant_id,
        co2_equivalent=co2_eq,
        note=f"Vernietiging: {data.note if data.note else ''}"
    )
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

def create_work_registration(db: Session, work: schemas.WorkRegistrationCreate):
    # If a cylinder is specified, let's validate and update its weight
    if work.cylinder_id is not None:
        cylinder = db.query(models.Cylinder).filter(models.Cylinder.id == work.cylinder_id).first()
        if not cylinder:
            raise HTTPException(status_code=404, detail="Geselecteerde cilinder bestaat niet")
        if cylinder.refrigerant_id != work.refrigerant_id:
            raise HTTPException(
                status_code=400, 
                detail="Koudemiddel van geselecteerde cilinder komt niet overeen met werkregistratie"
            )
        
        # Calculate new weight
        if work.action_type == "Gewonnen":
            cylinder.current_weight += work.amount
        elif work.action_type == "Verkocht/Gevuld":
            # Check for weight underflow (cannot go below tare weight)
            if cylinder.current_weight - work.amount < cylinder.tare_weight:
                raise HTTPException(
                    status_code=400,
                    detail=f"Onvoldoende koudemiddel in geselecteerde cilinder. Huidig gewicht ({cylinder.current_weight:.2f} kg) minus gevulde hoeveelheid ({work.amount:.2f} kg) is minder dan leeggewicht ({cylinder.tare_weight:.2f} kg)."
                )
            cylinder.current_weight -= work.amount

    db_work = models.WorkRegistration(**work.dict())
    db.add(db_work)
    db.flush()

    t_type = models.TransactionType.INCOME if work.action_type == "Gewonnen" else models.TransactionType.OUTCOME

    refrigerant = db.query(models.Refrigerant).filter(models.Refrigerant.id == work.refrigerant_id).first()
    if not refrigerant:
        raise HTTPException(status_code=404, detail="Refrigerant not found")
    co2_eq = work.amount * refrigerant.gwp if refrigerant else 0.0

    tx_timestamp = datetime.now()
    if work.work_date:
        try:
            tx_timestamp = datetime.strptime(work.work_date, "%Y-%m-%d")
        except ValueError:
            pass

    note_str = f"Werkregistratie op {work.installation_id}"
    if work.action_type == "Gewonnen" and work.reason_recovery:
        note_str += f" (Terugwinnen: {work.reason_recovery})"
    elif work.action_type == "Verkocht/Gevuld" and work.reason_filling:
        note_str += f" (Bijvullen: {work.reason_filling})"

    db_transaction = models.Transaction(
        transaction_type=t_type,
        amount=work.amount,
        refrigerant_id=work.refrigerant_id,
        co2_equivalent=co2_eq,
        work_registration_id=db_work.id,
        note=note_str,
        timestamp=tx_timestamp
    )
    db.add(db_transaction)
    db.commit()
    db.refresh(db_work)
    return db_work

def update_work_registration(db: Session, id: int, work: schemas.WorkRegistrationCreate):
    db_work = db.query(models.WorkRegistration).filter(models.WorkRegistration.id == id).first()
    if not db_work:
        raise HTTPException(status_code=404, detail="Work registration not found")

    # Capture old cylinder, action_type, and amount to revert weight changes
    old_cylinder_id = db_work.cylinder_id
    old_action_type = db_work.action_type
    old_amount = db_work.amount

    # If the old cylinder exists, temporarily revert its weight change
    if old_cylinder_id is not None:
        old_cylinder = db.query(models.Cylinder).filter(models.Cylinder.id == old_cylinder_id).first()
        if old_cylinder:
            if old_action_type == "Gewonnen":
                old_cylinder.current_weight -= old_amount
            elif old_action_type == "Verkocht/Gevuld":
                old_cylinder.current_weight += old_amount

    # Now check if we can apply the new cylinder and its weight change
    if work.cylinder_id is not None:
        new_cylinder = db.query(models.Cylinder).filter(models.Cylinder.id == work.cylinder_id).first()
        if not new_cylinder:
            raise HTTPException(status_code=404, detail="Geselecteerde nieuwe cilinder bestaat niet")
        if new_cylinder.refrigerant_id != work.refrigerant_id:
            raise HTTPException(
                status_code=400,
                detail="Koudemiddel van geselecteerde cilinder komt niet overeen met werkregistratie"
            )
        
        # Calculate and check new weight
        if work.action_type == "Gewonnen":
            new_cylinder.current_weight += work.amount
        elif work.action_type == "Verkocht/Gevuld":
            if new_cylinder.current_weight - work.amount < new_cylinder.tare_weight:
                raise HTTPException(
                    status_code=400,
                    detail=f"Onvoldoende koudemiddel in geselecteerde cilinder. Huidig gewicht ({new_cylinder.current_weight:.2f} kg) minus gevulde hoeveelheid ({work.amount:.2f} kg) is minder dan leeggewicht ({new_cylinder.tare_weight:.2f} kg)."
                )
            new_cylinder.current_weight -= work.amount

    # Apply the new values to the database model
    for key, value in work.dict().items():
        setattr(db_work, key, value)

    tx = db.query(models.Transaction).filter(models.Transaction.work_registration_id == id).first()

    t_type = models.TransactionType.INCOME if work.action_type == "Gewonnen" else models.TransactionType.OUTCOME
    refrigerant = db.query(models.Refrigerant).filter(models.Refrigerant.id == work.refrigerant_id).first()
    if not refrigerant:
        raise HTTPException(status_code=404, detail="Refrigerant not found")
    co2_eq = work.amount * refrigerant.gwp if refrigerant else 0.0

    tx_timestamp = datetime.now()
    if work.work_date:
        try:
            tx_timestamp = datetime.strptime(work.work_date, "%Y-%m-%d")
        except ValueError:
            pass

    note_str = f"Werkregistratie op {work.installation_id}"
    if work.action_type == "Gewonnen" and work.reason_recovery:
        note_str += f" (Terugwinnen: {work.reason_recovery})"
    elif work.action_type == "Verkocht/Gevuld" and work.reason_filling:
        note_str += f" (Bijvullen: {work.reason_filling})"

    if not tx:
        tx = models.Transaction(
            transaction_type=t_type,
            amount=work.amount,
            refrigerant_id=work.refrigerant_id,
            co2_equivalent=co2_eq,
            work_registration_id=db_work.id,
            note=note_str,
            timestamp=tx_timestamp
        )
        db.add(tx)
    else:
        tx.transaction_type = t_type
        tx.amount = work.amount
        tx.refrigerant_id = work.refrigerant_id
        tx.co2_equivalent = co2_eq
        tx.note = note_str
        tx.timestamp = tx_timestamp

    db.commit()
    db.refresh(db_work)
    return db_work

def get_auditor_report(db: Session, year: int = None):
    if year is None:
        year = datetime.now().year

    work_regs = db.query(models.WorkRegistration).all()
    refrigerants = db.query(models.Refrigerant).all()

    details = []
    for wr in work_regs:
        refr = db.query(models.Refrigerant).filter(models.Refrigerant.id == wr.refrigerant_id).first()

        wr_year = year
        if wr.work_date:
            try:
                wr_year = int(wr.work_date.split("-")[0])
            except (ValueError, IndexError):
                pass
        elif wr.timestamp:
            wr_year = wr.timestamp.year

        if wr_year == year:
            cylinder_sn = "Geen"
            if wr.cylinder_id:
                cyl = db.query(models.Cylinder).filter(models.Cylinder.id == wr.cylinder_id).first()
                if cyl:
                    cylinder_sn = cyl.serial_number

            details.append({
                "id": wr.id,
                "timestamp": wr.timestamp,
                "work_date": wr.work_date,
                "installation": wr.installation_id,
                "refrigerant": refr.name if refr else "Onbekend",
                "mutation": wr.mutation_type,
                "action": wr.action_type,
                "amount": wr.amount,
                "installation_type": wr.installation_type,
                "nominal_charge": wr.nominal_charge,
                "reason_recovery": wr.reason_recovery,
                "reason_filling": wr.reason_filling,
                "cylinder_id": wr.cylinder_id,
                "cylinder_serial": cylinder_sn
            })

    balans = []
    for r in refrigerants:
        yearly_stock = db.query(models.RefrigerantYearlyStock).filter(
            models.RefrigerantYearlyStock.refrigerant_id == r.id,
            models.RefrigerantYearlyStock.year == year
        ).first()

        if not yearly_stock:
            start_val = 0.0
            # Maintain legacy seed for 2023
            if year == 2023:
                seeds = {"R410A": 1.25, "R407C": 9.75, "MIX FLES RECLAIM": 1.00, "R32": 7.75}
                start_val = seeds.get(r.name, 0.0)

            yearly_stock = models.RefrigerantYearlyStock(
                refrigerant_id=r.id,
                year=year,
                start_stock=start_val,
                actual_stock=start_val
            )
            db.add(yearly_stock)
            db.commit()
            db.refresh(yearly_stock)

        start_stock = yearly_stock.start_stock
        actual_stock = yearly_stock.actual_stock

        # SQL Optimized: Aggregates
        purchased = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.INCOME,
            models.Transaction.work_registration_id == None,
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        recovered = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.INCOME,
            models.Transaction.work_registration_id != None,
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        # Outcome breakdowns using notes
        filled = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.OUTCOME,
            ~models.Transaction.note.ilike("%vernietiging%"),
            ~models.Transaction.note.ilike("%destruction%"),
            ~models.Transaction.note.ilike("%recycling%"),
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        destroyed = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.OUTCOME,
            (models.Transaction.note.ilike("%vernietiging%") | models.Transaction.note.ilike("%destruction%")),
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        recycled = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.OUTCOME,
            models.Transaction.note.ilike("%recycling%"),
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        calculated_stock = start_stock + purchased + recovered - filled - destroyed - recycled

        # CO2 Equivalence Calculation for the year
        total_co2 = db.query(func.sum(models.Transaction.co2_equivalent)).filter(
            models.Transaction.refrigerant_id == r.id,
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        balans.append({
            "id": r.id,
            "refrigerant": r.name,
            "start_stock": start_stock,
            "purchased": purchased,
            "recovered": recovered,
            "filled": filled,
            "destroyed": destroyed,
            "recycled": recycled,
            "calculated_stock": calculated_stock,
            "actual_stock": actual_stock,
            "diff": actual_stock - calculated_stock,
            "total_co2_equivalent": total_co2
        })

    ki_report = []
    for r in refrigerants:
        recovered_retrofit = 0.0
        recovered_onderhoud = 0.0
        recovered_ontmanteling = 0.0
        filled_nieuwbouw = 0.0
        filled_retrofit = 0.0
        filled_lekkage = 0.0

        regs = db.query(models.WorkRegistration).filter(models.WorkRegistration.refrigerant_id == r.id).all()
        for wr in regs:
            wr_year = year
            if wr.work_date:
                try:
                    wr_year = int(wr.work_date.split("-")[0])
                except (ValueError, IndexError):
                    pass
            elif wr.timestamp:
                wr_year = wr.timestamp.year

            if wr_year != year:
                continue

            amt = wr.amount
            if wr.action_type == "Gewonnen":
                rec_reason = (wr.reason_recovery or "").lower()
                if "retrofit" in rec_reason:
                    recovered_retrofit += amt
                elif any(x in rec_reason for x in ["afbraak", "ontmanteling", "sloop"]):
                    recovered_ontmanteling += amt
                else:
                    recovered_onderhoud += amt
            elif wr.action_type == "Verkocht/Gevuld":
                fill_reason = (wr.reason_filling or "").lower()
                if any(x in fill_reason for x in ["nieuwbouw", "nieuwe"]):
                    filled_nieuwbouw += amt
                elif "retrofit" in fill_reason:
                    filled_retrofit += amt
                else:
                    filled_lekkage += amt

        destroyed_amt = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.OUTCOME,
            (models.Transaction.note.ilike("%vernietiging%") | models.Transaction.note.ilike("%destruction%")),
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        recycled_amt = db.query(func.sum(models.Transaction.amount)).filter(
            models.Transaction.refrigerant_id == r.id,
            models.Transaction.transaction_type == models.TransactionType.OUTCOME,
            models.Transaction.note.ilike("%recycling%"),
            func.extract('year', models.Transaction.timestamp) == year
        ).scalar() or 0.0

        ki_report.append({
            "refrigerant": r.name,
            "recovered": {
                "retrofit": recovered_retrofit,
                "onderhoud": recovered_onderhoud,
                "ontmanteling": recovered_ontmanteling
            },
            "filled": {
                "nieuwbouw": filled_nieuwbouw,
                "retrofit": filled_retrofit,
                "lekkage": filled_lekkage
            },
            "destroyed": destroyed_amt,
            "recycled": recycled_amt
        })

    return {
        "details": details,
        "balans": balans,
        "ki_report": ki_report
    }

def update_refrigerant_stocks(db: Session, id: int, start_stock: float, actual_stock: float, year: int = None):
    if year is None:
        year = datetime.now().year

    ref = db.query(models.Refrigerant).filter(models.Refrigerant.id == id).first()
    if not ref:
        raise HTTPException(status_code=404, detail="Refrigerant not found")

    yearly_stock = db.query(models.RefrigerantYearlyStock).filter(
        models.RefrigerantYearlyStock.refrigerant_id == id,
        models.RefrigerantYearlyStock.year == year
    ).first()

    if not yearly_stock:
        yearly_stock = models.RefrigerantYearlyStock(
            refrigerant_id=id,
            year=year,
            start_stock=start_stock,
            actual_stock=actual_stock
        )
        db.add(yearly_stock)
    else:
        yearly_stock.start_stock = start_stock
        yearly_stock.actual_stock = actual_stock

    start_tx = db.query(models.Transaction).filter(
        models.Transaction.refrigerant_id == ref.id,
        models.Transaction.transaction_type == models.TransactionType.START_STOCK,
        func.extract('year', models.Transaction.timestamp) == year
    ).first()

    if not start_tx:
        start_tx = models.Transaction(
            transaction_type=models.TransactionType.START_STOCK,
            amount=start_stock,
            co2_equivalent=start_stock * ref.gwp,
            refrigerant_id=ref.id,
            timestamp=datetime(year, 1, 1, 12, 0),
            note=f"Beginvoorraad van {ref.name} (Year {year})"
        )
        db.add(start_tx)
    else:
        start_tx.amount = start_stock
        start_tx.co2_equivalent = start_stock * ref.gwp

    db.commit()
    return {"message": "Voorraad geüpdatet", "refrigerant_id": id, "year": year, "start_stock": start_stock, "actual_stock": actual_stock}

def transition_to_new_year(db: Session, from_year: int, to_year: int):
    """
    Closes the current year and initializes the next year.
    The 'actual_stock' of each refrigerant at the end of from_year
    becomes the 'start_stock' for to_year.
    """
    refrigerants = db.query(models.Refrigerant).all()

    for r in refrigerants:
        # Get the final state of the previous year
        yearly_stock = db.query(models.RefrigerantYearlyStock).filter(
            models.RefrigerantYearlyStock.refrigerant_id == r.id,
            models.RefrigerantYearlyStock.year == from_year
        ).first()

        # The actual stock at the end of the year is the starting stock for the next
        start_val = yearly_stock.actual_stock if yearly_stock else 0.0

        # Create or update the record for the new year
        new_yearly = db.query(models.RefrigerantYearlyStock).filter(
            models.RefrigerantYearlyStock.refrigerant_id == r.id,
            models.RefrigerantYearlyStock.year == to_year
        ).first()

        if not new_yearly:
            new_yearly = models.RefrigerantYearlyStock(
                refrigerant_id=r.id,
                year=to_year,
                start_stock=start_val,
                actual_stock=start_val
            )
            db.add(new_yearly)
        else:
            new_yearly.start_stock = start_val
            new_yearly.actual_stock = start_val

    db.commit()
    return {"message": f"Transition from {from_year} to {to_year} completed."}
