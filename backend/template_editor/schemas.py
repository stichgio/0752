from typing import Any, Dict, Optional

from pydantic import BaseModel, Field  # pyre-ignore[21]

from .models import TemplateEditorRecord, TemplateJson, UserRole, ValidationResult  # pyre-ignore[21]


class CreateTemplatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    reportType: str = Field(default="generic")
    author: str = Field(default="system", min_length=1, max_length=120)
    featureFlag: bool = False
    templateJson: TemplateJson


class UpdateTemplatePayload(BaseModel):
    author: str = Field(default="system", min_length=1, max_length=120)
    templateJson: TemplateJson


class ValidateTemplatePayload(BaseModel):
    role: UserRole = "editor"
    templateJson: TemplateJson


class PreviewTemplatePayload(BaseModel):
    sampleData: Dict[str, Any] = Field(default_factory=dict)
    logo_left: Optional[str] = None   # URL or base64 data URI
    logo_right: Optional[str] = None  # URL or base64 data URI


class PublishTemplatePayload(BaseModel):
    author: str = Field(default="system", min_length=1, max_length=120)


class RollbackTemplatePayload(BaseModel):
    author: str = Field(default="system", min_length=1, max_length=120)
    targetVersion: Optional[int] = None


class UpdateTemplateResponse(BaseModel):
    template: TemplateEditorRecord
    validation: ValidationResult
