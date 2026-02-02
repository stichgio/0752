
import json
import sys

try:
    with open('backend/data/fichas_tecnicas.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    print("JSON is valid.")
    print(f"Keys count: {len(data)}")
except Exception as e:
    print(f"JSON is invalid: {e}")
    sys.exit(1)
