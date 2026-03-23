# -*- coding: utf-8 -*-
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from .models import TemplateEditorRecord, TemplateJson, TemplateVersion, UserRole, ValidationResult


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


class PreviewTemplateJsonPayload(BaseModel):
    templateJson: TemplateJson
    sampleData: Dict[str, Any] = Field(default_factory=dict)
    logo_left: Optional[str] = None
    logo_right: Optional[str] = None


class PreviewMatrixSamplePayload(BaseModel):
    id: str
    sampleData: Dict[str, Any] = Field(default_factory=dict)


class PreviewMatrixPayload(BaseModel):
    samples: list[PreviewMatrixSamplePayload] = Field(default_factory=list)


class PublishTemplatePayload(BaseModel):
    author: str = Field(default="system", min_length=1, max_length=120)


class RollbackTemplatePayload(BaseModel):
    author: str = Field(default="system", min_length=1, max_length=120)
    targetVersion: Optional[int] = None


class UpdateTemplateResponse(BaseModel):
    template: TemplateEditorRecord
    validation: ValidationResult


class TemplatePreviewResponse(BaseModel):
    previewHtml: str
    templateId: Optional[str] = None


class TemplateVersionsResponse(BaseModel):
    templateId: str
    versions: list[TemplateVersion] = Field(default_factory=list)


class TemplateVersionResponse(BaseModel):
    templateId: str
    version: TemplateVersion
