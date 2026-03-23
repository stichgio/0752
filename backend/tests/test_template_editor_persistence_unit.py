# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from template_editor.persistence import JsonTemplateClient


def test_json_template_client_persists_templates_versions_and_storage(tmp_path):
    state_path = tmp_path / "template_editor_store.json"
    client = JsonTemplateClient(str(state_path))

    created = client.create_template(
        {
            "name": "json-persisted-template",
            "report_type": "generic",
            "status": "draft",
            "current_version": 0,
            "created_by": "qa",
            "updated_by": "qa",
        }
    )
    template_id = created["id"]

    client.upload_text("template-editor/demo/draft/editor.json", '{"templateJson":{"reportType":"generic"}}', "application/json")
    client.insert_template_version(
        {
            "template_id": template_id,
            "version_number": 1,
            "schema_version": 1,
            "editor_json_path": "template-editor/demo/v1/editor.json",
            "compiled_html_path": "template-editor/demo/v1/compiled.html",
            "checksum": "abc123",
            "created_by": "qa",
            "published_at": "2026-03-23T00:00:00+00:00",
        }
    )

    reloaded = JsonTemplateClient(str(state_path))
    assert reloaded.get_template(template_id)["name"] == "json-persisted-template"
    assert reloaded.download_text("template-editor/demo/draft/editor.json") == '{"templateJson":{"reportType":"generic"}}'

    version = reloaded.get_template_version(template_id, 1)
    assert version is not None
    assert version["checksum"] == "abc123"
    assert version["published_at"] == "2026-03-23T00:00:00+00:00"
