#!/bin/bash
cd "$(dirname "$0")/.."
uvicorn msheets.main_msheets:app --host 0.0.0.0 --port 7861 --reload
