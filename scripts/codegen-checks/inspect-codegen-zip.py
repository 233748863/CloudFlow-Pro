import hashlib
import json
import pathlib
import sys
import zipfile


def main():
    if len(sys.argv) != 3:
        raise ValueError("Expected an actual downloaded ZIP and its original product receipt")
    archive_path = pathlib.Path(sys.argv[1]).resolve(strict=True)
    receipt_path = pathlib.Path(sys.argv[2]).resolve(strict=True)
    receipt = json.loads(receipt_path.read_text(encoding="utf-8-sig"))
    expected = {entry["name"]: entry for entry in receipt["files"]}
    if len(expected) != len(receipt["files"]) or not expected:
        raise ValueError("Original preview filenames must be unique and nonempty")
    observations = []
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        if any(entry.is_dir() for entry in entries):
            raise ValueError("Unexpected extra ZIP directory entry")
        if len({entry.filename for entry in entries}) != len(entries):
            raise ValueError("Duplicate ZIP filenames")
        if {entry.filename for entry in entries} != set(expected):
            raise ValueError("Downloaded file set differs from the actual preview")
        for entry in entries:
            relative = pathlib.PurePosixPath(entry.filename)
            if relative.is_absolute() or ".." in relative.parts or "\\" in entry.filename or ":" in entry.filename:
                raise ValueError("Unsafe ZIP path")
            original = expected[entry.filename]
            original_path = pathlib.Path(original["path"])
            if original_path.is_symlink() or not original_path.is_file():
                raise ValueError("Original preview file is missing or redirected")
            original_bytes = original_path.read_bytes()
            downloaded_bytes = archive.read(entry)
            actual_hash = hashlib.sha256(downloaded_bytes).hexdigest()
            if hashlib.sha256(original_bytes).hexdigest() != original["hash"]:
                raise ValueError("Retained preview content changed")
            if actual_hash != original["hash"] or downloaded_bytes != original_bytes:
                raise ValueError("Downloaded file differs from the actual preview: " + entry.filename)
            observations.append({"name": entry.filename, "bytes": len(downloaded_bytes), "hash": actual_hash})
    print(json.dumps({"passed": True, "actuallyDownloaded": True,
                      "zipHash": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                      "files": observations, "allFilesMatchOriginalPreview": True}, ensure_ascii=False))


if __name__ == "__main__":
    main()
