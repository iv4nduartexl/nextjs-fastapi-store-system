import uuid

from fastapi_users import schemas
from pydantic import BaseModel
from uuid import UUID


class UserRead(schemas.BaseUser[uuid.UUID]):
    username: str | None = None


class UserCreate(schemas.BaseUserCreate):
    username: str | None = None


class UserUpdate(schemas.BaseUserUpdate):
    username: str | None = None


class ItemBase(BaseModel):
    name: str
    description: str | None = None
    quantity: int | None = None


class ItemCreate(ItemBase):
    pass


class ItemRead(ItemBase):
    id: UUID
    user_id: UUID

    model_config = {"from_attributes": True}
