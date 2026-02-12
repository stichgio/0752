import os
from typing import Optional

from db.base_json_db import BaseJsonDB

from .models import TemplateEditorRecord


class TemplateEditorDB(BaseJsonDB[TemplateEditorRecord]):
    def __init__(self, storage_dir: Optional[str] = None):
        if storage_dir is None:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            backend_dir = os.path.dirname(current_dir)
            storage_dir = os.path.join(backend_dir, "data")
        db_file = os.path.join(storage_dir, "template_editor.json")
        super().__init__(db_file, TemplateEditorRecord, label="TemplateEditor")


db = TemplateEditorDB()
