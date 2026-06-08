from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from database import engine, get_db
import models, schemas, services
from contextlib import asynccontextmanager
import datetime
import os

# Maak de tabellen aan (in productie gebruik je Alembic)
models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Zorg dat er minimaal één technicus is voor testdoeleinden
    db = next(get_db())
    technician = db.query(models.Technician).filter(models.Technician.id == 1).first()
    if not technician:
        default_tech = models.Technician(
            name="Standaard Technicus",
            certificate_number="CERT-001"
        )
        db.add(default_tech)
        db.commit()

    # Koudemiddelen check
    refrigerants = db.query(models.Refrigerant).all()
    if not refrigerants:
        default_refrigerants = [
            models.Refrigerant(name="R134a", gwp=1430, is_natural=False),
            models.Refrigerant(name="R32", gwp=675, is_natural=False),
            models.Refrigerant(name="R410A", gwp=2088, is_natural=False),
            models.Refrigerant(name="R404A", gwp=3922, is_natural=False),
            models.Refrigerant(name="R407C", gwp=1774, is_natural=False),
            models.Refrigerant(name="R407F", gwp=1430, is_natural=False),
            models.Refrigerant(name="R448A", gwp=1387, is_natural=False),
            models.Refrigerant(name="R449A", gwp=1387, is_natural=False),
            models.Refrigerant(name="R507", gwp=3985, is_natural=False),
            models.Refrigerant(name="R290 (Propaan)", gwp=3, is_natural=True),
            models.Refrigerant(name="CO2 (R744)", gwp=1, is_natural=True),
            models.Refrigerant(name="R600a (Isobutaan)", gwp=3, is_natural=True),
            models.Refrigerant(name="R1234yf", gwp=4, is_natural=False),
            models.Refrigerant(name="R1234ze", gwp=1, is_natural=False),
            models.Refrigerant(name="R454C", gwp=465, is_natural=False),
        ]
        db.add_all(default_refrigerants)
        db.commit()
    db.close()
    yield

app = FastAPI(title="BRL 100 Koudemiddel Registratie API", lifespan=lifespan)

# CORS Configuration
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "BRL 100 API is running"}

# Refrigerants
@app.get("/refrigerants/", response_model=List[schemas.Refrigerant])
def read_refrigerants(db: Session = Depends(get_db)):
    return services.get_refrigerants(db)

@app.post("/refrigerants/", response_model=schemas.Refrigerant)
def create_refrigerant(refrigerant: schemas.RefrigerantCreate, db: Session = Depends(get_db)):
    return services.create_refrigerant(db, refrigerant)

@app.put("/refrigerants/{id}", response_model=schemas.Refrigerant)
def update_refrigerant(id: int, refrigerant: schemas.RefrigerantCreate, db: Session = Depends(get_db)):
    return services.update_refrigerant(db, id, refrigerant)

@app.delete("/refrigerants/{id}")
def delete_refrigerant(id: int, db: Session = Depends(get_db)):
    return services.delete_refrigerant(db, id)

@app.get("/refrigerants/stock")
def get_refrigerant_stock(year: int = None, db: Session = Depends(get_db)):
    return services.get_refrigerant_stock(db, year)

@app.post("/refrigerants/destruction")
def destroy_refrigerant(data: schemas.DestructionCreate, db: Session = Depends(get_db)):
    return services.destroy_refrigerant(db, data)

# Work Registrations
@app.get("/work-registrations/", response_model=List[schemas.WorkRegistration])
def read_work_registrations(db: Session = Depends(get_db)):
    return db.query(models.WorkRegistration).all()

@app.post("/work-registrations/", response_model=schemas.WorkRegistration)
def create_work_registration(work: schemas.WorkRegistrationCreate, db: Session = Depends(get_db)):
    return services.create_work_registration(db, work)

@app.put("/work-registrations/{id}", response_model=schemas.WorkRegistration)
def update_work_registration(id: int, work: schemas.WorkRegistrationCreate, db: Session = Depends(get_db)):
    return services.update_work_registration(db, id, work)

# Auditor Report
@app.get("/auditor-report/")
def get_auditor_report(year: int = None, db: Session = Depends(get_db)):
    return services.get_auditor_report(db, year)

# Update stocks (start_stock and actual_stock) for a refrigerant
@app.put("/refrigerants/{id}/stocks")
def update_refrigerant_stocks(id: int, start_stock: float, actual_stock: float, year: int = None, db: Session = Depends(get_db)):
    return services.update_refrigerant_stocks(db, id, start_stock, actual_stock, year)

@app.post("/refrigerants/transition-year")
def transition_year(from_year: int, to_year: int, db: Session = Depends(get_db)):
    return services.transition_to_new_year(db, from_year, to_year)

# Cylinders
@app.get("/cylinders/", response_model=List[schemas.Cylinder])
def read_cylinders(db: Session = Depends(get_db)):
    return db.query(models.Cylinder).all()

@app.post("/cylinders/", response_model=schemas.Cylinder)
def create_cylinder(cylinder: schemas.CylinderCreate, db: Session = Depends(get_db)):
    db_cylinder = models.Cylinder(**cylinder.dict())
    db.add(db_cylinder)
    db.commit()
    db.refresh(db_cylinder)
    return db_cylinder

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
