import re
from typing import Dict, List, Set

try:
    import bleach
except Exception:  # pragma: no cover
    bleach = None

from .models import TemplateJson, UserRole, ValidationIssue, ValidationResult

VARIABLE_RE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_]*)(\|[a-zA-Z_][a-zA-Z0-9_]*)?\s*}}")
RAW_JINJA_RE = re.compile(r"{{\s*([^{}]+?)\s*}}")

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
            for raw in RAW_JINJA_RE.findall(block.content or ""):
                token = "{{" + raw + "}}"
                match = VARIABLE_RE.fullmatch(token)
                path = f"sections[{s_idx}].blocks[{b_idx}].content"
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
