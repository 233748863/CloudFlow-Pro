"""只读核对 Codex 有效上下文与本批新增图片之和。"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import uuid


IMAGE_LIMIT = 48
IMAGE_TYPES = {"input_image", "output_image", "image", "image_url", "local_image"}


class CountUnknown(ValueError):
    pass


def count_images(value):
    if isinstance(value, list):
        return sum(count_images(item) for item in value)
    if not isinstance(value, dict):
        return 0
    content_type = value.get("type", "")
    if content_type in IMAGE_TYPES:
        return 1
    if isinstance(content_type, str) and (
        "image" in content_type.lower() or "video" in content_type.lower()
    ):
        raise CountUnknown("遇到未支持的图片或视频格式：" + content_type)
    if "image_url" in value:
        raise CountUnknown("发现未识别的图片载荷，必须核实后再追加图片")
    return sum(count_images(item) for item in value.values())


def scan_rollout(stream):
    history_images = 0
    auxiliary_snapshot_images = 0
    session_id = None
    last_compaction_line = None
    lines = 0
    digest = hashlib.sha256()
    for lines, raw_line in enumerate(stream, 1):
        digest.update(raw_line)
        if not raw_line.endswith(b"\n"):
            raise CountUnknown("会话末行尚未写完，请等待写入完成后重查")
        try:
            record = json.loads(raw_line)
        except (ValueError, UnicodeError) as error:
            raise CountUnknown(f"会话第 {lines} 行无法解析") from error
        if not isinstance(record, dict) or not isinstance(record.get("payload"), dict):
            raise CountUnknown(f"会话第 {lines} 行结构未识别")
        payload = record["payload"]
        record_type = record.get("type")
        if record_type == "session_meta":
            if session_id is not None or not isinstance(payload.get("id"), str):
                raise CountUnknown("会话身份记录无效")
            session_id = payload["id"]
        elif record_type == "response_item":
            history_images += count_images(payload)
        elif record_type == "compacted":
            replacement = payload.get("replacement_history")
            if not isinstance(replacement, list):
                raise CountUnknown("压缩记录缺少明确的有效上下文，不能将历史图片清零")
            if count_images(payload.get("retained_context", {})):
                raise CountUnknown("额外保留上下文含图片，需要核实其装载方式")
            # 压缩后的替换记录才是主对话上下文；审查快照单独报告，不重复相加。
            history_images = count_images(replacement)
            auxiliary_snapshot_images = count_images(payload.get("guardian_history", []))
            last_compaction_line = lines
        elif record_type == "event_msg":
            if "rollback" in str(payload.get("type", "")).lower() or "rolled_back" in str(
                payload.get("type", "")
            ).lower():
                raise CountUnknown("会话含回退操作，需先核实回退后的有效上下文")
            # 展示事件是界面镜像；附件和工具图片已由 response_item 计数。
            if payload.get("type") == "item_completed":
                continue
            if count_images(payload):
                raise CountUnknown("事件记录含未归类图片，不能确认实际发送数量")
        elif count_images(payload):
            raise CountUnknown("发现未支持记录中的图片：" + str(record_type))
    if session_id is None:
        raise CountUnknown("缺少会话身份记录，图片数量未核实")
    return {
        "session_id": session_id,
        "history_images": history_images,
        "auxiliary_snapshot_images": auxiliary_snapshot_images,
        "last_compaction_line": last_compaction_line,
        "rollout_lines": lines,
        "rollout_sha256": digest.hexdigest(),
    }


def inspect_file(path):
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        result = scan_rollout(stream)
        after = os.fstat(stream.fileno())
    current = path.stat()
    signatures = {
        (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns)
        for stat in (before, after, current)
    }
    if len(signatures) != 1:
        raise CountUnknown("核查期间会话发生写入或替换，请在上一批写入完成后重查")
    result["rollout_bytes"] = after.st_size
    return result


def find_rollout(session_id, codex_home):
    try:
        uuid.UUID(session_id)
    except (ValueError, AttributeError) as error:
        raise CountUnknown("必须提供完整有效的会话编号") from error
    database = codex_home / "state_5.sqlite"
    if database.is_file():
        connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=3)
        try:
            connection.execute("PRAGMA query_only=ON")
            row = connection.execute(
                "SELECT rollout_path FROM threads WHERE id=?", (session_id,)
            ).fetchone()
            if row and Path(row[0]).is_file():
                return Path(row[0])
        finally:
            connection.close()
    matches = [
        path
        for directory in ("sessions", "archived_sessions")
        for path in (codex_home / directory).glob("**/*" + session_id + ".jsonl")
    ]
    if len(matches) != 1:
        raise CountUnknown("无法唯一定位该会话，图片数量未核实")
    return matches[0]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--session-id", help="默认使用 CODEX_THREAD_ID")
    source.add_argument("--session-file", type=Path, help="指定离线会话或核验副本")
    parser.add_argument("--new-images", type=int, required=True, help="本批全部新增图片数")
    arguments = parser.parse_args(argv)
    try:
        if arguments.new_images < 0:
            raise CountUnknown("本批图片数不能为负数")
        session_id = arguments.session_id or os.environ.get("CODEX_THREAD_ID")
        if arguments.session_file is None and not session_id:
            raise CountUnknown("无法识别当前会话，请显式提供 --session-id")
        codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))).resolve()
        path = arguments.session_file or find_rollout(session_id, codex_home)
        result = inspect_file(path)
        if arguments.session_file is None and result["session_id"] != session_id:
            raise CountUnknown("会话索引与文件中的会话编号不一致")
        total = result["history_images"] + arguments.new_images
        passed = total <= IMAGE_LIMIT
        result.update(
            {
                "passed": passed,
                "limit": IMAGE_LIMIT,
                "new_images": arguments.new_images,
                "request_images": total,
                "remaining_after_batch": max(0, IMAGE_LIMIT - total),
                "session_file": str(path),
                "message": (
                    "本批总量通过；整批返回后再检查下一批"
                    if passed
                    else "总量超过 48 张；先整理图片上下文，再核查同一完整批次"
                ),
            }
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0 if passed else 1
    except (CountUnknown, OSError, sqlite3.Error) as error:
        print(json.dumps({"passed": False, "count_known": False, "message": str(error)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
