import json
from typing import Optional, Callable, Awaitable

ProgressCallback = Optional[Callable[[str, int, int, str], Awaitable[None]]]


async def noop_progress(phase: str, current: int, total: int, detail: str = ""):
    pass


def format_sse_event(data: dict, event: str = "progress") -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"
