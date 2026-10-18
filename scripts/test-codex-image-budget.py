import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location(
    "codex_image_budget", Path(__file__).with_name("check-codex-image-budget.py")
)
BUDGET = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUDGET)
SESSION_ID = "01a13daa-5b10-7e52-9d87-ea613243de37"
IMAGE = {"type": "input_image", "image_url": "data:image/jpeg;base64,fixture"}
META = {"type": "session_meta", "payload": {"id": SESSION_ID}}


def record(record_type, payload):
    return {"type": record_type, "payload": payload}


def message(role, images):
    return record("response_item", {"type": "message", "role": role, "content": images})


def encoded(records):
    return b"".join((json.dumps(item) + "\n").encode() for item in [META, *records])


class ImageBudgetTests(unittest.TestCase):
    def scan(self, records):
        return BUDGET.scan_rollout(io.BytesIO(encoded(records)))

    def test_attachment_tool_images_and_repeated_reads_all_count(self):
        result = self.scan(
            [
                message("user", [IMAGE]),
                record("response_item", {"type": "custom_tool_call_output", "output": [IMAGE, IMAGE]}),
            ]
        )
        self.assertEqual(result["history_images"], 3)

    def test_next_turn_does_not_clear_history(self):
        result = self.scan(
            [
                message("user", [IMAGE]),
                record("event_msg", {"type": "task_complete"}),
                record("event_msg", {"type": "task_started"}),
                message("user", [{"type": "input_text", "text": "继续"}, IMAGE]),
            ]
        )
        self.assertEqual(result["history_images"], 2)

    def test_compaction_uses_retained_images_in_replacement(self):
        result = self.scan(
            [
                message("user", [IMAGE] * 30),
                record(
                    "compacted",
                    {
                        "replacement_history": [{"type": "message", "content": [IMAGE, IMAGE]}],
                        "guardian_history": [{"type": "message", "content": [IMAGE] * 30}],
                    },
                ),
                message("user", [IMAGE]),
            ]
        )
        self.assertEqual(result["history_images"], 3)
        self.assertEqual(result["auxiliary_snapshot_images"], 30)

    def test_unclear_compaction_fails_closed(self):
        with self.assertRaises(BUDGET.CountUnknown):
            self.scan([record("compacted", {"message": "只有文字摘要，装载范围不明"})])

    def test_image_view_event_does_not_double_count_payload(self):
        result = self.scan(
            [
                record("event_msg", {"type": "item_completed", "item": {"type": "ImageView", "path": "a.jpg"}}),
                message("user", [IMAGE]),
            ]
        )
        self.assertEqual(result["history_images"], 1)

    def test_user_attachment_display_event_does_not_double_count(self):
        result = self.scan(
            [
                message("user", [IMAGE]),
                record("event_msg", {"type": "item_completed", "item": {"type": "UserMessage", "content": [IMAGE]}}),
            ]
        )
        self.assertEqual(result["history_images"], 1)

    def test_partial_write_fails_closed(self):
        with self.assertRaises(BUDGET.CountUnknown):
            BUDGET.scan_rollout(io.BytesIO(encoded([]) + b'{"type":'))

    def test_unknown_image_format_fails_closed(self):
        with self.assertRaises(BUDGET.CountUnknown):
            self.scan([message("user", [{"type": "future_image", "data": "fixture"}])])

    def test_rollback_needs_verified_context(self):
        with self.assertRaises(BUDGET.CountUnknown):
            self.scan([record("event_msg", {"type": "thread_rolled_back", "num_turns": 1})])

    def test_entire_batch_boundary_and_negative_count(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "session.jsonl"
            path.write_bytes(encoded([message("user", [IMAGE] * 33)]))
            for added, expected in [(15, 0), (16, 1), (-1, 2)]:
                with self.subTest(added=added), contextlib.redirect_stdout(io.StringIO()):
                    actual = BUDGET.main(["--session-file", str(path), "--new-images", str(added)])
                self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
