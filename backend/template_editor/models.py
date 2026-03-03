from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field  # pyre-ignore


TemplateStatus = Literal["draft", "published", "archived"]
UserRole = Literal["admin", "editor"]


class EditorBlock(BaseModel):
    id: str
    type: Literal[
        "text", "table", "image", "variables", "protected", "signature", "footer", "header",
        # Block-editor types
        "info-bar", "info_bar", "section-title", "section_title",
        "data-grid", "data_grid", "photo-grid", "photo_grid",
        "signatures", "spacer",
        # Canvas-editor types
        "heading", "logo", "rectangle", "circle", "shape", "divider",
        "variable", "container", "qr", "line",
    ]
    content: str = ""
    variables: List[str] = Field(default_factory=list)
    placeholders: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    locked: bool = False


class EditorSection(BaseModel):
    id: str
    type: Literal["header", "body", "footer", "signatures", "tables", "images"]
    title: str
    blocks: List[EditorBlock] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ProtectionRules(BaseModel):
    required_block_ids: List[str] = Field(default_factory=list)
    editable_placeholder_by_block: Dict[str, List[str]] = Field(default_factory=dict)


class TemplateJson(BaseModel):
    reportType: str
    sections: List[EditorSection] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    variableBindings: Dict[str, Any] = Field(default_factory=dict)
    protectionRules: ProtectionRules = Field(default_factory=ProtectionRules)
    dataSourceDefinition: Dict[str, Any] = Field(default_factory=dict)
    assetLibrary: List[Dict[str, Any]] = Field(default_factory=list)


class TemplateVersion(BaseModel):
    version: int
    status: TemplateStatus
    author: str
    createdAt: str
    templateJson: TemplateJson
    compiledJinja: str
    diffSummary: Dict[str, Any] = Field(default_factory=dict)


class TemplateEditorRecord(BaseModel):
    id: str
    name: str
    reportType: str
    status: TemplateStatus = "draft"
    currentVersion: int = 1
    createdAt: str
    updatedAt: str
    createdBy: str
    updatedBy: str
    featureFlag: bool = False
    versions: List[TemplateVersion] = Field(default_factory=list)


class ValidationIssue(BaseModel):
    level: Literal["error", "warning"]
    code: str
    message: str
    path: Optional[str] = None


class ValidationResult(BaseModel):
    valid: bool
    issues: List[ValidationIssue] = Field(default_factory=list)
