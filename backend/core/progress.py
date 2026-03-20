# -*- coding: utf-8 -*-
import json


def format_sse_event(data: dict, event: str = "progress") -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"
