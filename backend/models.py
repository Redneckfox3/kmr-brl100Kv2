from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum

class TransactionType(enum.Enum):
    INCOME = "Inkomend"     # Stock increase (e.g. Purchase, Recovery from installation)
    OUTCOME = "Uitgaand"    # Stock decrease (e.g. Filled in installation, Destruction)
    START_STOCK = "Beginvoorraad"

class Refrigerant(Base):
    __tablename__ = "refrigerants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    gwp = Column(Float)
    is_natural = Column(Boolean, default=False)
    actual_stock = Column(Float, default=0.0)

class RefrigerantYearlyStock(Base):
    __tablename__ = "refrigerant_yearly_stocks"
    id = Column(Integer, primary_key=True, index=True)
    refrigerant_id = Column(Integer, ForeignKey("refrigerants.id"))
    year = Column(Integer)
    start_stock = Column(Float, default=0.0)
    actual_stock = Column(Float, default=0.0)

class Technician(Base):
    __tablename__ = "technicians"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    certificate_number = Column(String, unique=True)

class Installation(Base):
    __tablename__ = "installations"
    id = Column(String, primary_key=True, index=True) # Alphanumeric Installation ID
    client_name = Column(String)
    location = Column(String)
    installation_type = Column(String)
    serial_number = Column(String, unique=True)
    refrigerant_id = Column(Integer, ForeignKey("refrigerants.id"))
    nominal_charge = Column(Float)

class Cylinder(Base):
    __tablename__ = "cylinders"
    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String, unique=True)
    refrigerant_id = Column(Integer, ForeignKey("refrigerants.id"))
    tare_weight = Column(Float)
    current_weight = Column(Float)
    cylinder_card = Column(String, nullable=True)

class WorkRegistration(Base):
    __tablename__ = "work_registrations"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    installation_id = Column(String) # Removed ForeignKey to installations.id
    refrigerant_id = Column(Integer, ForeignKey("refrigerants.id"))
    cylinder_id = Column(Integer, ForeignKey("cylinders.id"), nullable=True)

    # BRL 100 v2 specific fields
    mutation_type = Column(String) # 'Nieuwbouw', 'Afbraak', 'Lekkage', 'Reparatie'
    action_type = Column(String)   # 'Gewonnen', 'Verkocht/Gevuld'
    amount = Column(Float)         # Amount in kg

    work_date = Column(String, nullable=True) # Changed from note to work_date
    
    # KMR Sheet 2 columns
    installation_type = Column(String, nullable=True) # 'Commerciële koeling', 'Transportkoeling', etc.
    nominal_charge = Column(Float, nullable=True)     # nominal capacity in kg
    reason_recovery = Column(String, nullable=True)   # reason for recovery (reden mutatie terugwinnen)
    reason_filling = Column(String, nullable=True)    # reason for filling (reden mutatie bijvullen)


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    transaction_type = Column(Enum(TransactionType))
    amount = Column(Float)  # Always positive, type determines +/-
    co2_equivalent = Column(Float, nullable=True)

    refrigerant_id = Column(Integer, ForeignKey("refrigerants.id"))
    work_registration_id = Column(Integer, ForeignKey("work_registrations.id"), nullable=True)
    note = Column(String, nullable=True)

