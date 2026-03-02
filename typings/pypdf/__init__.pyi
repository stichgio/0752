from collections.abc import Sequence
from typing import Any, BinaryIO


class PageObject:
    def rotate(self, angle: int) -> "PageObject": ...


class PdfReader:
    pages: Sequence[PageObject]

    def __init__(self, stream: str | bytes | BinaryIO, *args: Any, **kwargs: Any) -> None: ...


class PdfWriter:
    pages: Sequence[PageObject]

    def __init__(self, *args: Any, **kwargs: Any) -> None: ...
    def add_page(self, page: PageObject) -> None: ...
    def write(self, stream: BinaryIO) -> None: ...
