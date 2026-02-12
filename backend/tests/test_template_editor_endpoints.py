import json
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
from template_editor.database import db as template_editor_db


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def reset_template_editor_db():
    snapshot = dict(template_editor_db._items)
    try:
        template_editor_db._items = {}
        template_editor_db._save()
        yield
    finally:
        template_editor_db._items = snapshot
        template_editor_db._save()


def _template_payload(name: str = "visual-tech-template"):
    return {
        "name": name,
        "reportType": "technical-report",
        "author": "qa",
        "featureFlag": True,
        "templateJson": {
            "reportType": "technical-report",
            "sections": [
                {
                    "id": "sec-1",
                    "type": "body",
                    "title": "Body",
                    "blocks": [
                        {"id": "blk-1", "type": "text", "content": "<p>{{cs}}</p>", "variables": ["cs"], "placeholders": [], "metadata": {}, "locked": False},
                        {"id": "blk-2", "type": "protected", "content": "<p>{{contratista}}</p>", "variables": ["contratista"], "placeholders": ["contratista"], "metadata": {}, "locked": True},
                    ],
                    "metadata": {},
                }
            ],
            "metadata": {},
            "variableBindings": {"cs": "header.cs"},
            "protectionRules": {
                "required_block_ids": ["blk-2"],
                "editable_placeholder_by_block": {"blk-2": ["contratista"]},
            },
        },
    }


def test_template_editor_crud_validate_preview_publish_and_rollback(client, monkeypatch):
    monkeypatch.setenv("FEATURE_TEMPLATE_EDITOR", "true")

    create_res = client.post("/api/template-editor/templates", json=_template_payload())
    assert create_res.status_code == 200
    created = create_res.json()
    template_id = created["id"]

    get_res = client.get(f"/api/template-editor/templates/{template_id}")
    assert get_res.status_code == 200

    validate_res = client.post(
        f"/api/template-editor/templates/{template_id}/validate",
        json={"role": "editor", "templateJson": _template_payload()["templateJson"]},
    )
    assert validate_res.status_code == 200
    assert validate_res.json()["valid"] is True

    update_payload = _template_payload()
    update_payload["templateJson"]["sections"][0]["blocks"][0]["content"] = "<p>{{cs|upper}}</p>"
    update_res = client.put(f"/api/template-editor/templates/{template_id}", json=update_payload)
    assert update_res.status_code == 200

    preview_res = client.post(
        f"/api/template-editor/templates/{template_id}/preview",
        json={"sampleData": {"cs": "ATE"}},
    )
    assert preview_res.status_code == 200
    assert "ATE" in preview_res.json()["previewHtml"]

    publish_res = client.post(f"/api/template-editor/templates/{template_id}/publish", json={"author": "qa"})
    assert publish_res.status_code == 200
    assert publish_res.json()["status"] == "published"

    rollback_res = client.post(f"/api/template-editor/templates/{template_id}/rollback", json={"author": "qa"})
    assert rollback_res.status_code == 200
    assert rollback_res.json()["status"] == "published"


def test_legacy_template_endpoints_snapshot_baseline(client):
    list_res = client.get("/api/templates")
    assert list_res.status_code == 200
    templates = list_res.json()["templates"]
    assert isinstance(templates, list)

    if templates:
        tpl_name = templates[0]
        read_res = client.get(f"/api/templates/{tpl_name}")
        assert read_res.status_code == 200
        body = read_res.json()
        assert body["name"] == tpl_name
        assert "<" in body["content"]


def test_template_list_includes_editor_status_and_legacy_endpoint_includes_published(client, monkeypatch):
    monkeypatch.setenv("FEATURE_TEMPLATE_EDITOR", "true")

    draft_res = client.post("/api/template-editor/templates", json=_template_payload(name="selector-draft-template"))
    assert draft_res.status_code == 200
    draft_id = draft_res.json()["id"]

    published_res = client.post("/api/template-editor/templates", json=_template_payload(name="selector-published-template"))
    assert published_res.status_code == 200
    published_id = published_res.json()["id"]

    publish_res = client.post(f"/api/template-editor/templates/{published_id}/publish", json={"author": "qa"})
    assert publish_res.status_code == 200
    assert publish_res.json()["status"] == "published"

    editor_list_res = client.get("/api/template-editor/templates")
    assert editor_list_res.status_code == 200
    editor_templates = editor_list_res.json()["templates"]
    assert isinstance(editor_templates, list)
    assert any(t["id"] == draft_id and t["status"] == "draft" for t in editor_templates)
    assert any(t["id"] == published_id and t["status"] == "published" for t in editor_templates)

    published_idx = next(i for i, t in enumerate(editor_templates) if t["id"] == published_id)
    draft_idx = next(i for i, t in enumerate(editor_templates) if t["id"] == draft_id)
    assert published_idx < draft_idx

    legacy_list_res = client.get("/api/templates")
    assert legacy_list_res.status_code == 200
    legacy_editor_templates = legacy_list_res.json().get("editorTemplates", [])
    assert any(t["name"] == "selector-published-template" for t in legacy_editor_templates)


def test_generate_pdf_can_use_published_visual_template_without_contract_change(client, monkeypatch):
    monkeypatch.setenv("FEATURE_TEMPLATE_EDITOR", "true")
    create_res = client.post("/api/template-editor/templates", json=_template_payload())
    template_id = create_res.json()["id"]
    client.post(f"/api/template-editor/templates/{template_id}/publish", json={"author": "qa"})

    class DummyService:
        async def generate_batch_pdf(self, reports_payload, output_path=None, logo_left=None, logo_right=None, custom_template_str=None, template_name=None):
            with open(output_path, "wb") as f:
                f.write(b"%PDF-1.4\n%mock\n")
            assert custom_template_str is not None
            assert template_name is None

        async def close(self):
            return None

    app.state.report_service = DummyService()
    payload = {"id": "RPT-1", "valvulas": {}}
    res = client.post(
        "/api/generate-pdf",
        data={"data": json.dumps(payload), "templateName": "visual-tech-template"},
    )
    assert res.status_code == 200
    assert "application/pdf" in res.headers.get("content-type", "")


def test_generate_pdf_falls_back_to_legacy_template_resolution_when_not_in_db(client):
    class DummyService:
        async def generate_batch_pdf(self, reports_payload, output_path=None, logo_left=None, logo_right=None, custom_template_str=None, template_name=None):
            with open(output_path, "wb") as f:
                f.write(b"%PDF-1.4\n%mock\n")
            assert custom_template_str is None
            assert template_name == "legacy-template.html"

        async def close(self):
            return None

    app.state.report_service = DummyService()
    payload = {"id": "RPT-2", "valvulas": {}}
    res = client.post(
        "/api/generate-pdf",
        data={"data": json.dumps(payload), "templateName": "legacy-template.html"},
    )
    assert res.status_code == 200
    assert "application/pdf" in res.headers.get("content-type", "")


def test_create_template_payload_validation_rejects_missing_name(client):
    payload = _template_payload()
    payload.pop("name", None)
    res = client.post("/api/template-editor/templates", json=payload)
    assert res.status_code == 422
