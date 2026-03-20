# -*- coding: utf-8 -*-
import re
from typing import Dict, List, Set

try:
    import bleach
except Exception:  # pragma: no cover
    bleach = None

from .models import TemplateJson, UserRole, ValidationIssue, ValidationResult

VARIABLE_RE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)(\|[a-zA-Z_][a-zA-Z0-9_]*)?\s*}}")
RAW_JINJA_RE = re.compile(r"{{\s*([^{}]+?)\s*}}")
JINJA_BLOCK_RE = re.compile(r"{%\s*[\s\S]*?\s*%}")
JINJA_COMMENT_RE = re.compile(r"{#\s*[\s\S]*?\s*#}")

ALLOWED_TAGS = [
    "div", "section", "p", "span", "strong", "em", "table", "thead", "tbody", "tr", "td", "th",
    "img", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "br"
]
ALLOWED_ATTRIBUTES = {
    "*": ["class", "style", "data-block-id", "data-block-type", "data-protected", "data-section-id", "data-section-type"],
    "img": ["src", "alt", "width", "height"],
}


def sanitizeHtml(template_html: str) -> str:
    """
    Sanitiza HTML para prevenir XSS.
    Si bleach no está disponible, aplica sanitización básica manual.
    """
    if bleach is not None:
        cleaned = bleach.clean(
            template_html,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRIBUTES,
            strip=True,
        )
    else:
        # Fallback defensivo para no dejar el HTML sin sanitizar.
        import warnings
        warnings.warn(
            "La librería 'bleach' no está instalada. Usando sanitización básica. "
            "Se recomienda instalar bleach: pip install bleach",
            UserWarning,
        )
        cleaned = template_html

    # Siempre remover handlers inline y tags de alto riesgo.
    cleaned = re.sub(r"\son[a-zA-Z]+\s*=\s*\"[^\"]*\"", "", cleaned)
    cleaned = re.sub(r"\son[a-zA-Z]+\s*=\s*'[^']*'", "", cleaned)
    cleaned = re.sub(r"<\s*(script|iframe)[^>]*>.*?<\s*/\s*\1\s*>", "", cleaned, flags=re.IGNORECASE | re.DOTALL)
    cleaned = JINJA_BLOCK_RE.sub("", cleaned)
    cleaned = JINJA_COMMENT_RE.sub("", cleaned)

    if bleach is None:
        # Sanitización adicional en modo fallback.
        cleaned = re.sub(r"javascript\s*:", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"data\s*:(?!image/)", "blocked:", cleaned, flags=re.IGNORECASE)

    return cleaned


def validateTemplateStructure(template_json: TemplateJson) -> ValidationResult:
    issues: List[ValidationIssue] = []
    if not template_json.sections:
        issues.append(ValidationIssue(level="error", code="STRUCT_EMPTY", message="Template must include at least one section", path="sections"))

    section_ids: Set[str] = set()
    block_ids: Set[str] = set()
    for s_idx, section in enumerate(template_json.sections):
        if section.id in section_ids:
            issues.append(ValidationIssue(level="error", code="SECTION_DUPLICATE", message=f"Duplicate section id '{section.id}'", path=f"sections[{s_idx}].id"))
        section_ids.add(section.id)

        if not section.blocks:
            issues.append(ValidationIssue(level="warning", code="SECTION_EMPTY", message=f"Section '{section.id}' has no blocks", path=f"sections[{s_idx}].blocks"))

        for b_idx, block in enumerate(section.blocks):
            if block.id in block_ids:
                issues.append(ValidationIssue(level="error", code="BLOCK_DUPLICATE", message=f"Duplicate block id '{block.id}'", path=f"sections[{s_idx}].blocks[{b_idx}].id"))
            block_ids.add(block.id)

    return ValidationResult(valid=not any(i.level == "error" for i in issues), issues=issues)


def validateVariables(template_json: TemplateJson, allowed_variables: Dict[str, Dict[str, bool]], whitelist_filters: Set[str]) -> ValidationResult:
    issues: List[ValidationIssue] = []
    catalog = set(allowed_variables.keys())

    for s_idx, section in enumerate(template_json.sections):
        for b_idx, block in enumerate(section.blocks):
            path = f"sections[{s_idx}].blocks[{b_idx}].content"
            content = block.content or ""
            if JINJA_BLOCK_RE.search(content) or JINJA_COMMENT_RE.search(content):
                issues.append(
                    ValidationIssue(
                        level="error",
                        code="JINJA_CONTROL_NOT_ALLOWED",
                        message="Control-flow Jinja blocks are not allowed in editable block content",
                        path=path,
                    )
                )
            for raw in RAW_JINJA_RE.findall(block.content or ""):
                token = "{{" + raw + "}}"
                match = VARIABLE_RE.fullmatch(token)
                if not match:
                    issues.append(ValidationIssue(level="error", code="VAR_SYNTAX", message=f"Invalid variable syntax '{token}'", path=path))
                    continue

                var_name = match.group(1)
                var_filter = (match.group(2) or "").replace("|", "")

                if var_name not in catalog:
                    issues.append(ValidationIssue(level="error", code="VAR_UNKNOWN", message=f"Variable '{var_name}' is not allowed", path=path))
                    continue

                if var_filter and var_filter not in whitelist_filters:
                    issues.append(ValidationIssue(level="error", code="FILTER_NOT_ALLOWED", message=f"Filter '{var_filter}' is not allowed", path=path))

                if allowed_variables[var_name].get("optional"):
                    bindings = template_json.variableBindings or {}
                    if var_name not in bindings:
                        issues.append(ValidationIssue(level="warning", code="VAR_OPTIONAL_UNMAPPED", message=f"Optional variable '{var_name}' not mapped", path=path))

    return ValidationResult(valid=not any(i.level == "error" for i in issues), issues=issues)


def validateProtectedBlocks(template_json: TemplateJson, role: UserRole) -> ValidationResult:
    issues: List[ValidationIssue] = []
    required_ids = set(template_json.protectionRules.required_block_ids)
    editable = template_json.protectionRules.editable_placeholder_by_block

    for s_idx, section in enumerate(template_json.sections):
        for b_idx, block in enumerate(section.blocks):
            path = f"sections[{s_idx}].blocks[{b_idx}]"
            if block.id in required_ids and block.type != "protected":
                issues.append(ValidationIssue(level="error", code="PROTECTED_TYPE", message=f"Block '{block.id}' must be protected", path=path))

            if block.type == "protected":
                allowed_placeholders = set(editable.get(block.id, []))
                if role == "editor" and not block.locked:
                    issues.append(ValidationIssue(level="error", code="PROTECTED_NOT_LOCKED", message=f"Protected block '{block.id}' must be locked for editor role", path=path))

                for placeholder in block.placeholders:
                    if placeholder not in allowed_placeholders:
                        issues.append(ValidationIssue(level="error", code="PROTECTED_PLACEHOLDER", message=f"Placeholder '{placeholder}' is not editable in protected block '{block.id}'", path=path))

    return ValidationResult(valid=not any(i.level == "error" for i in issues), issues=issues)


def validateCanvasMetadata(template_json: TemplateJson) -> ValidationResult:
    issues: List[ValidationIssue] = []
    metadata = template_json.metadata or {}
    raw_pages = metadata.get("pages") if isinstance(metadata.get("pages"), list) else []
    page_settings = metadata.get("pageSettings") if isinstance(metadata.get("pageSettings"), dict) else {}
    page_width = float(page_settings.get("width", 210) or 210)
    page_height = float(page_settings.get("height", 297) or 297)

    page_ids: List[str] = []
    page_names: Dict[str, str] = {}
    for index, raw_page in enumerate(raw_pages):
        if not isinstance(raw_page, dict):
            continue
        page_id = str(raw_page.get("id") or "").strip()
        if not page_id:
            continue
        page_ids.append(page_id)
        page_names[page_id] = str(raw_page.get("name") or f"Pagina {index + 1}")

    if not page_ids:
        page_ids = ["page-1"]
        page_names["page-1"] = "Pagina 1"

    fallback_page_id = page_ids[0]
    page_block_counts: Dict[str, int] = {page_id: 0 for page_id in page_ids}

    asset_library = template_json.assetLibrary or []
    asset_ids = {str(asset.get("id")) for asset in asset_library if isinstance(asset, dict) and asset.get("id")}
    brand_kits = metadata.get("brandKits") if isinstance(metadata.get("brandKits"), list) else []
    brand_kit_ids = {str(item.get("id")) for item in brand_kits if isinstance(item, dict) and item.get("id")}
    binding_map = metadata.get("bindingMap") if isinstance(metadata.get("bindingMap"), dict) else {}
    variants = metadata.get("variants") if isinstance(metadata.get("variants"), list) else []

    for s_idx, section in enumerate(template_json.sections):
        for b_idx, block in enumerate(section.blocks):
            path = f"sections[{s_idx}].blocks[{b_idx}]"
            block_meta = block.metadata or {}
            block_page_id = str(block_meta.get("pageId") or fallback_page_id)
            if block_page_id not in page_block_counts:
                issues.append(
                    ValidationIssue(
                        level="error",
                        code="PAGE_ORPHAN_BLOCK",
                        message=f"El bloque '{block.id}' no pertenece a una pagina valida",
                        path=f"{path}.metadata.pageId",
                    )
                )
            else:
                page_block_counts[block_page_id] += 1

            layout = block_meta.get("layout") if isinstance(block_meta.get("layout"), dict) else {}
            x = float(layout.get("x", 0) or 0)
            y = float(layout.get("y", 0) or 0)
            width = float(layout.get("width", 0) or 0)
            height = float(layout.get("height", 0) or 0)
            if x < 0 or y < 0 or (x + width) > page_width or (y + height) > page_height:
                issues.append(
                    ValidationIssue(
                        level="warning",
                        code="ELEMENT_OUT_OF_BOUNDS",
                        message=f"El bloque '{block.id}' excede los limites de la pagina",
                        path=path,
                    )
                )

            variable_name = str(block_meta.get("variableName") or "").strip()
            if block.type == "variable" and not variable_name and block.id not in binding_map:
                issues.append(
                    ValidationIssue(
                        level="warning",
                        code="VARIABLE_BINDING_MISSING",
                        message=f"El bloque '{block.id}' no tiene binding configurado",
                        path=f"{path}.metadata.variableName",
                    )
                )

            asset_ref_id = str(block_meta.get("assetRefId") or "").strip()
            if asset_ref_id and asset_ref_id not in asset_ids:
                issues.append(
                    ValidationIssue(
                        level="error",
                        code="ASSET_REF_MISSING",
                        message=f"El bloque '{block.id}' referencia un asset inexistente",
                        path=f"{path}.metadata.assetRefId",
                    )
                )

    for index, page_id in enumerate(page_ids):
        if page_block_counts.get(page_id, 0) == 0:
            issues.append(
                ValidationIssue(
                    level="warning",
                    code="PAGE_EMPTY",
                    message=f"La pagina '{page_names.get(page_id, page_id)}' esta vacia",
                    path=f"metadata.pages[{index}]",
                )
            )

    for index, variant in enumerate(variants):
        if not isinstance(variant, dict):
            continue
        brand_kit_id = str(variant.get("brandKitId") or "").strip()
        if brand_kit_id and brand_kit_id not in brand_kit_ids:
            issues.append(
                ValidationIssue(
                    level="warning",
                    code="VARIANT_BRAND_KIT_MISSING",
                    message=f"La variante '{variant.get('name', index + 1)}' referencia un brand kit inexistente",
                    path=f"metadata.variants[{index}].brandKitId",
                )
            )

    return ValidationResult(valid=not any(i.level == "error" for i in issues), issues=issues)
