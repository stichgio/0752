"""
# -*- coding: utf-8 -*-
Base JSON database with atomic writes and thread-safe operations.
"""
import json
import os
import tempfile
import threading
from typing import Any, Dict, List, Optional, TypeVar, Generic

from pydantic import BaseModel  

T = TypeVar("T", bound=BaseModel)


class BaseJsonDB(Generic[T]):
    """
    Thread-safe JSON file database with:
    - Single load on init (no reload on every CRUD)
    - Atomic writes (write to temp file in same dir, then os.replace)
    - threading.Lock for concurrent request safety
    """

    def __init__(self, db_file: str, model_class: type, label: str = "DB"):
        self._db_file = db_file
        self._model_class = model_class
        self._label = label
        self._lock = threading.Lock()
        self._items: Dict[str, Any] = {}

        os.makedirs(os.path.dirname(db_file), exist_ok=True)
        print(f"[{self._label}] DB file: {self._db_file}")
        self._load()

    def _load(self) -> None:
        """Load from disk. Called ONCE at init."""
        if os.path.exists(self._db_file):
            try:
                with open(self._db_file, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                # Handle legacy list format: convert [{id: "x", ...}] → {"x": {...}}
                if isinstance(raw, list):
                    self._items = {item["id"]: item for item in raw if isinstance(item, dict) and "id" in item}
                elif isinstance(raw, dict):
                    self._items = raw
                else:
                    self._items = {}
                print(f"[{self._label}] Loaded {len(self._items)} items")
            except Exception as e:
                print(f"[{self._label}] Error loading: {e}")
                self._items = {}
        else:
            self._items = {}
            self._save()

    def _save(self) -> None:
        """Atomic write: temp file in same directory + os.replace."""
        try:
            dir_name = os.path.dirname(self._db_file)
            fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(self._items, f, ensure_ascii=False, indent=2)
                os.replace(tmp_path, self._db_file)
            except Exception:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
                raise
            print(f"[{self._label}] Saved {len(self._items)} items successfully")
        except Exception as e:
            print(f"[{self._label}] Error saving: {e}")

    def get_all(self) -> List[T]:
        with self._lock:
            return [self._model_class(**data) for data in self._items.values()]

    def get(self, item_id: str) -> Optional[T]:
        with self._lock:
            data = self._items.get(item_id)
            return self._model_class(**data) if data else None

    def create(self, item) -> T:
        with self._lock:
            self._items[item.id] = item.model_dump()
            self._save()
            return item

    def update(self, item_id: str, item) -> T:
        with self._lock:
            self._items[item_id] = item.model_dump()
            self._save()
            return item

    def delete(self, item_id: str) -> bool:
        with self._lock:
            if item_id in self._items:
                self._items.pop(item_id)
                self._save()
                return True
            return False

    def clear_all(self) -> int:
        with self._lock:
            count = len(self._items)
            self._items = {}
            self._save()
            print(f"[{self._label}] Cleared {count} items")
            return count
