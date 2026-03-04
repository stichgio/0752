import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from utils.file_utils import build_safe_upload_path, sanitize_upload_filename  # pyre-ignore[21]


def test_sanitize_upload_filename_strips_traversal_segments_and_unsafe_chars():
    sanitized = sanitize_upload_filename("../../evil name?.pdf", default_name="document.pdf")

    assert sanitized == "evil_name_.pdf"
    assert ".." not in sanitized
    assert "/" not in sanitized
    assert "\\" not in sanitized


def test_build_safe_upload_path_keeps_result_inside_target_directory():
    directory = os.path.join("tmp", "uploads")
    path = build_safe_upload_path(directory, "..\\..\\nested/evil name?.pdf", prefix="0001_", default_name="document.pdf")

    assert os.path.dirname(path) == directory
    assert os.path.basename(path) == "0001_evil_name_.pdf"
