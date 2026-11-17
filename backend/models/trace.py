from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


SearchType = Literal["seller_id", "rut", "email", "phone", "name"]


class AudiencePreviewRequest(BaseModel):
    raw_input: str = Field(max_length=1_000_000)
    search_type: SearchType = "seller_id"
    filters: dict[str, list[str]] = Field(default_factory=dict)


class AudienceExportRequest(AudiencePreviewRequest):
    template: str = Field(min_length=1, max_length=256)
    confirm_warnings: bool = False


class AudienceSearchRequest(BaseModel):
    search: str | None = Field(default=None, max_length=256)
    created_by: str | None = Field(default=None, max_length=256)
    created_from: date | None = None
    created_to: date | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=50)
    members_only: bool = True


class TraceSendDetailQuery(BaseModel):
    template: str = Field(min_length=1, max_length=256)
    seller_id: str | None = None
    status: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=1, le=200)