import os
import sys
from copy import deepcopy
from uuid import uuid4

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from template_editor.models import EditorBlock, EditorSection, ProtectionRules, TemplateJson  # pyre-ignore[21]
from template_editor.service import SupabaseTemplateStore  # pyre-ignore[21]


def _sample_json(content: str = "<p>{{cs}}</p>") -> TemplateJson:
    return TemplateJson(
        reportType="technical-report",
        sections=[
            EditorSection(
                id="sec-1",
                type="body",
                title="Body",
                blocks=[
                    EditorBlock(
                        id="blk-1",
                        type="text",
                        content=content,
                        variables=["cs"],
                        placeholders=[],
                        metadata={},
                        locked=False,
                    ),
                    EditorBlock(
                        id="blk-2",
                        type="protected",
                        content="<p>{{contratista}}</p>",
                        variables=["contratista"],
                        placeholders=["contratista"],
                        metadata={},
                        locked=True,
                    ),
                ],
                metadata={},
            )
        ],
        metadata={},
        variableBindings={"cs": "header.cs"},
        protectionRules=ProtectionRules(
            required_block_ids=["blk-2"],
            editable_placeholder_by_block={"blk-2": ["contratista"]},
        ),
    )


def _sample_canvas_json() -> TemplateJson:
    return TemplateJson(
        reportType="technical-report",
        sections=[
            EditorSection(
                id="sec-canvas",
                type="body",
                title="Canvas",
                blocks=[
                    EditorBlock(
                        id="blk-canvas-heading",
                        type="heading",
                        content="PANEL FOTOGRAFICO",
                        variables=[],
                        placeholders=[],
                        metadata={
                            "layout": {"x": 10, "y": 8, "width": 120, "height": 12, "zIndex": 2},
                            "style": {"fontSize": 13, "fontWeight": "bold"},
                        },
                        locked=False,
                    ),
                    EditorBlock(
                        id="blk-canvas-grid",
                        type="photo-grid",
                        content="Panel fotografico",
                        variables=[],
                        placeholders=[],
                        metadata={
                            "layout": {"x": 10, "y": 47, "width": 190, "height": 215, "zIndex": 7},
                            "style": {"backgroundColor": "#f7f6ff", "borderColor": "#6d4cff", "borderWidth": 1.2},
                            "photoConfig": {
                                "count": 4,
                                "labels": ["ANTES", "DURANTE", "DESPUES", "DETALLE"],
                                "showLabels": True,
                                "oddPosition": "center",
                            },
                        },
                        locked=False,
                    ),
                ],
                metadata={},
            )
        ],
        metadata={},
        variableBindings={},
        protectionRules=ProtectionRules(required_block_ids=[], editable_placeholder_by_block={}),
    )


class FakeSupabaseTemplateClient:
    def __init__(self):
        self.templates = {}
        self.template_versions = []
        self.storage = {}

    def _copy(self, data):
        return deepcopy(data)

    def create_template(self, payload):
        row = {
            "id": str(uuid4()),
            **payload,
        }
        self.templates[row["id"]] = row
        return self._copy(row)

    def get_template(self, template_id):
        row = self.templates.get(template_id)
        return self._copy(row) if row else None

    def update_template(self, template_id, payload):
        if template_id not in self.templates:
            raise ValueError("Plantilla no encontrada")
        self.templates[template_id] = {**self.templates[template_id], **payload}
        return self._copy(self.templates[template_id])

    def list_template_versions(self, template_id):
        rows = [v for v in self.template_versions if v["template_id"] == template_id]
        rows.sort(key=lambda x: int(x["version_number"]))
        return self._copy(rows)

    def get_template_version(self, template_id, version_number):
        for row in self.template_versions:
            if row["template_id"] == template_id and int(row["version_number"]) == int(version_number):
                return self._copy(row)
        return None

    def insert_template_version(self, payload):
        existing = self.get_template_version(payload["template_id"], payload["version_number"])
        if existing:
            raise RuntimeError("La clave duplicada viola la restricción de unicidad")
        self.template_versions.append(self._copy(payload))
        return self._copy(payload)

    def upload_text(self, path, content, content_type):
        _ = content_type
        self.storage[path] = content

    def download_text(self, path):
        return self.storage.get(path)

    def copy_object(self, source_path, target_path, content_type):
        _ = content_type
        if source_path not in self.storage:
            raise RuntimeError("Objeto fuente no encontrado")
        self.storage[target_path] = self.storage[source_path]

    def list_templates_by_name(self, name, status=None):
        rows = []
        for row in self.templates.values():
            if row["name"] != name:
                continue
            if status is not None and row.get("status") != status:
                continue
            rows.append(self._copy(row))
        rows.sort(key=lambda x: str(x.get("updated_at", "")), reverse=True)
        return rows

    def list_published_templates(self):
        rows = [self._copy(row) for row in self.templates.values() if row.get("status") == "published"]
        rows.sort(key=lambda x: str(x.get("updated_at", "")), reverse=True)
        return rows


def test_supabase_store_publish_is_idempotent_and_increments_version():
    store = SupabaseTemplateStore(FakeSupabaseTemplateClient())
    created = store.create_template(
        name="visual-supa-template",
        report_type="technical-report",
        template_json=_sample_json(),
        author="qa",
        feature_flag=True,
    )
    assert created.currentVersion == 0

    updated, validation = store.update_template(created.id, _sample_json("<p>{{cs|upper}}</p>"), author="qa", role="admin")
    assert validation.valid is True
    assert updated.id == created.id

    published = store.publish_template(created.id, author="qa")
    assert published.status == "published"
    assert published.currentVersion == 1

    published_again = store.publish_template(created.id, author="qa")
    assert published_again.currentVersion == 1


def test_supabase_store_rollback_updates_pointer_without_deleting_versions():
    fake_client = FakeSupabaseTemplateClient()
    store = SupabaseTemplateStore(fake_client)
    created = store.create_template(
        name="rollback-template",
        report_type="technical-report",
        template_json=_sample_json(),
        author="qa",
        feature_flag=True,
    )
    store.publish_template(created.id, author="qa")

    store.update_template(created.id, _sample_json("<p>{{cs|lower}}</p>"), author="qa", role="admin")
    second_publish = store.publish_template(created.id, author="qa")
    assert second_publish.currentVersion == 2
    assert len(fake_client.list_template_versions(created.id)) == 2

    rolled_back = store.rollback_template(created.id, target_version=1, author="qa")
    assert rolled_back.currentVersion == 1
    assert rolled_back.status == "published"
    assert len(fake_client.list_template_versions(created.id)) == 2


def test_supabase_store_can_resolve_published_template_by_name():
    store = SupabaseTemplateStore(FakeSupabaseTemplateClient())
    created = store.create_template(
        name="resolver-template",
        report_type="technical-report",
        template_json=_sample_json(),
        author="qa",
        feature_flag=True,
    )
    store.publish_template(created.id, author="qa")
    compiled = store.get_published_template_by_name("resolver-template")
    assert compiled is not None
    assert "<!DOCTYPE html>" in compiled


def test_supabase_store_update_after_publish_sets_template_back_to_draft():
    store = SupabaseTemplateStore(FakeSupabaseTemplateClient())
    created = store.create_template(
        name="draft-after-save-template",
        report_type="technical-report",
        template_json=_sample_json(),
        author="qa",
        feature_flag=True,
    )
    published = store.publish_template(created.id, author="qa")
    assert published.status == "published"

    updated, validation = store.update_template(created.id, _sample_json("<p>{{cs|lower}}</p>"), author="qa", role="admin")
    assert validation.valid is True
    assert updated.status == "draft"


def test_get_published_template_by_name_recompiles_canvas_templates():
    fake_client = FakeSupabaseTemplateClient()
    store = SupabaseTemplateStore(fake_client)
    created = store.create_template(
        name="canvas-resolver-template",
        report_type="technical-report",
        template_json=_sample_canvas_json(),
        author="qa",
        feature_flag=True,
    )
    published = store.publish_template(created.id, author="qa")
    assert published.status == "published"

    current_version = fake_client.get_template(created.id)["current_version"]  # pyre-ignore[16, 29]
    version_row = fake_client.get_template_version(created.id, current_version)
    compiled_path = str(version_row.get("compiled_html_path"))  # pyre-ignore[16]
    fake_client.storage[compiled_path] = "<!-- stale compiled html -->"

    compiled = store.get_published_template_by_name("canvas-resolver-template")
    assert compiled is not None
    assert "<!-- stale compiled html -->" not in compiled
    assert '<table class="photo-grid-table">' in compiled
