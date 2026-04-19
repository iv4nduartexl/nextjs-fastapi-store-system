import enum

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, String, ForeignKey, Enum, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from uuid import uuid4


class Base(DeclarativeBase):
    pass


class UnitType(str, enum.Enum):
    unit = "unit"       # sold by piece/count (e.g. bottles, cans)
    kg = "kg"           # sold by kilogram (e.g. flour, meat)
    gram = "gram"       # sold by gram (e.g. spices)
    liter = "liter"     # sold by liter (e.g. oil, milk)
    pack = "pack"       # sold by pack/box


class User(SQLAlchemyBaseUserTableUUID, Base):
    username = Column(String, unique=True, nullable=True, index=True)
    items = relationship("Item", back_populates="user", cascade="all, delete-orphan")


class Item(Base):
    __tablename__ = "items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    sku = Column(String, nullable=True, unique=True, index=True)
    category = Column(String, nullable=True)
    unit_type = Column(Enum(UnitType), nullable=False, default=UnitType.unit)
    stock = Column(Numeric(10, 3), nullable=False, default=0)
    min_stock = Column(Numeric(10, 3), nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user.id"), nullable=False)

    user = relationship("User", back_populates="items")
