from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from models import TransactionType

class RefrigerantBase(BaseModel):
    name: str
    gwp: float
    is_natural: bool = False
    actual_stock: Optional[float] = 0.0

class RefrigerantCreate(RefrigerantBase):
    pass

class Refrigerant(RefrigerantBase):
    id: int

    class Config:
        from_attributes = True

class WorkRegistrationBase(BaseModel):
    installation_id: str
    refrigerant_id: int
    mutation_type: str # 'Nieuwbouw', 'Afbraak', 'Lekkage', 'Reparatie'
    action_type: str   # 'Gewonnen', 'Verkocht/Gevuld'
    amount: float
    work_date: Optional[str] = None
    installation_type: Optional[str] = None
    nominal_charge: Optional[float] = None
    reason_recovery: Optional[str] = None
    reason_filling: Optional[str] = None
    cylinder_id: Optional[int] = None

class WorkRegistrationCreate(WorkRegistrationBase):
    pass

class WorkRegistration(WorkRegistrationBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    transaction_type: TransactionType
    amount: float
    refrigerant_id: int
    co2_equivalent: Optional[float] = None
    work_registration_id: Optional[int] = None
    note: Optional[str] = None

class TransactionCreate(TransactionBase):
    pass

class DestructionCreate(BaseModel):
    refrigerant_id: int
    amount: float
    note: Optional[str] = None

class Transaction(TransactionBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class InstallationBase(BaseModel):
    client_name: str
    location: str
    installation_type: str
    serial_number: str
    refrigerant_id: int
    nominal_charge: float

class InstallationCreate(InstallationBase):
    id: str # Alphanumeric ID

class Installation(InstallationBase):
    id: str

    class Config:
        from_attributes = True

class CylinderBase(BaseModel):
    serial_number: str
    refrigerant_id: int
    tare_weight: float
    current_weight: float
    cylinder_card: Optional[str] = None

class CylinderCreate(CylinderBase):
    pass

class Cylinder(CylinderBase):
    id: int

    class Config:
        from_attributes = True

class RefrigerantYearlyStockBase(BaseModel):
    refrigerant_id: int
    year: int
    start_stock: float = 0.0
    actual_stock: float = 0.0

class RefrigerantYearlyStockCreate(RefrigerantYearlyStockBase):
    pass

class RefrigerantYearlyStock(RefrigerantYearlyStockBase):
    id: int

    class Config:
        from_attributes = True
