"""
# -*- coding: utf-8 -*-
Tests for BaseJsonDB - atomic writes, thread safety, CRUD operations.
"""
import json
import os
import tempfile
import threading
import shutil
import pytest
import sys

# Ensure backend is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from db.base_json_db import BaseJsonDB
from pydantic import BaseModel


class SimpleItem(BaseModel):
    id: str
    name: str = ""


class TestBaseJsonDB:
    def setup_method(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.db_file = os.path.join(self.tmp_dir, "test.json")

    def teardown_method(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def _make_db(self):
        return BaseJsonDB(self.db_file, SimpleItem, label="Test")

    # --- Basic CRUD ---

    def test_create_and_get(self):
        db = self._make_db()
        item = SimpleItem(id="1", name="Alice")
        db.create(item)
        result = db.get("1")
        assert result is not None
        assert result.name == "Alice"

    def test_get_nonexistent_returns_none(self):
        db = self._make_db()
        assert db.get("nonexistent") is None

    def test_get_all_empty(self):
        db = self._make_db()
        assert db.get_all() == []

    def test_get_all_returns_all(self):
        db = self._make_db()
        db.create(SimpleItem(id="1", name="A"))
        db.create(SimpleItem(id="2", name="B"))
        items = db.get_all()
        assert len(items) == 2
        names = {i.name for i in items}
        assert names == {"A", "B"}

    def test_update(self):
        db = self._make_db()
        db.create(SimpleItem(id="1", name="Alice"))
        db.update("1", SimpleItem(id="1", name="Bob"))
        assert db.get("1").name == "Bob"

    def test_delete_existing(self):
        db = self._make_db()
        db.create(SimpleItem(id="1", name="Alice"))
        assert db.delete("1") is True
        assert db.get("1") is None

    def test_delete_nonexistent(self):
        db = self._make_db()
        assert db.delete("nope") is False

    def test_clear_all(self):
        db = self._make_db()
        for i in range(5):
            db.create(SimpleItem(id=str(i), name=f"Item {i}"))
        count = db.clear_all()
        assert count == 5
        assert len(db.get_all()) == 0

    # --- Persistence (atomic write) ---

    def test_data_persists_across_instances(self):
        db1 = self._make_db()
        db1.create(SimpleItem(id="1", name="Persisted"))

        # New instance reads from disk
        db2 = BaseJsonDB(self.db_file, SimpleItem, label="Test2")
        result = db2.get("1")
        assert result is not None
        assert result.name == "Persisted"

    def test_file_is_valid_json_after_save(self):
        db = self._make_db()
        db.create(SimpleItem(id="1", name="Test"))
        with open(self.db_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert "1" in data
        assert data["1"]["name"] == "Test"

    def test_empty_db_creates_file(self):
        assert not os.path.exists(self.db_file)
        self._make_db()
        assert os.path.exists(self.db_file)
        with open(self.db_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert data == {}

    # --- Thread safety ---

    def test_concurrent_creates(self):
        db = self._make_db()
        errors = []

        def create_item(idx):
            try:
                db.create(SimpleItem(id=str(idx), name=f"Item {idx}"))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=create_item, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        assert len(db.get_all()) == 20

    def test_concurrent_mixed_operations(self):
        db = self._make_db()
        # Pre-populate
        for i in range(10):
            db.create(SimpleItem(id=str(i), name=f"Init {i}"))

        errors = []

        def worker(idx):
            try:
                if idx % 3 == 0:
                    db.delete(str(idx))
                elif idx % 3 == 1:
                    db.update(str(idx), SimpleItem(id=str(idx), name=f"Updated {idx}"))
                else:
                    db.get(str(idx))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0
        # Verify data is still valid JSON on disk
        with open(self.db_file, "r", encoding="utf-8") as f:
            json.load(f)
