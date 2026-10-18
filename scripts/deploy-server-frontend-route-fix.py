"""Publish changed frontend files only, retaining old assets and entry rollback data.

No backend restart, historical cleanup or infrastructure change is performed.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import time

import paramiko
import requests

spec = importlib.util.spec_from_file_location("native_deploy", Path(__file__).with_name("deploy-server-native.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
base = native.base


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(sftp, target, data):
    with sftp.file(target + ".next", "wb") as stream:
        stream.write(data)
    sftp.chmod(target + ".next", 0o644)
    with sftp.file(target + ".next", "rb") as stream:
        assert sha(stream.read()) == sha(data), "Static upload hash mismatch"
    sftp.posix_rename(target + ".next", target)


def deploy(client):
    root = base.ROOT / "cloudflow-frontend/dist"
    files = {p.relative_to(root).as_posix(): p for p in root.rglob("*") if p.is_file()}
    assert "index.html" in files and not any(p.is_symlink() for p in root.rglob("*"))
    remote = base.REMOTE + "/runtime/frontend"
    old = json.loads(native.remote_python(client, """import hashlib,json,pathlib
r=pathlib.Path('/data/cloudflow/runtime/frontend')
assert r.resolve()==r and not any(p.is_symlink() for p in r.rglob('*'))
print(json.dumps({p.relative_to(r).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in r.rglob('*') if p.is_file()}))
"""))
    manifest = {name: {"sha256": base.digest(p), "bytes": p.stat().st_size} for name, p in files.items()}
    changed = [name for name in files if old.get(name) != manifest[name]["sha256"]]
    # Hash-named dependency files are present before service worker and entry switch.
    changed.sort(key=lambda name: (name == "index.html", name == "sw.js", name))
    stamp = time.strftime("%Y%m%d%H%M%S")
    stage = base.REMOTE + "/native/frontend-route-" + stamp
    record = {"status": "UPLOADING", "startedAt": stamp, "changedFiles": changed,
              "rollbackDirectory": stage, "oldAssetsRetained": True}
    state = json.loads(native.STATE.read_text(encoding="utf-8"))
    state["frontendRouteFix"] = record
    native.save(state)
    originals = {}
    with client.open_sftp() as sftp:
        sftp.mkdir(stage)
        try:
            directories = set()
            for name in changed:
                # Retain only small mutable entry files; hashed old assets stay online.
                if name in old and not name.startswith("assets/"):
                    with sftp.file(remote + "/" + name, "rb") as stream:
                        originals[name] = stream.read()
                    assert sha(originals[name]) == old[name]
                    write(sftp, stage + "/" + name.replace("/", "_"), originals[name])
                parent = Path(name).parent.as_posix()
                if parent != "." and parent not in directories:
                    base.run(client, "install -d -m 755 " + shlex.quote(remote + "/" + parent))
                    directories.add(parent)
                write(sftp, remote + "/" + name, files[name].read_bytes())
            http = requests.Session()
            http.trust_env = False
            try:
                entry = http.get(state["entry"] + "/", timeout=20)
                assert entry.status_code == 200 and sha(entry.content) == manifest["index.html"]["sha256"]
                match = re.search(r'<script[^>]+src="([^"]+)"', entry.text)
                assert match, "Published entry must reference its module"
                asset = http.get(state["entry"] + match.group(1), timeout=20)
                assert asset.status_code == 200
                assert sha(asset.content) == manifest[match.group(1).lstrip("/")]["sha256"]
            finally:
                http.close()
        except Exception:
            for name, data in originals.items():
                write(sftp, remote + "/" + name, data)
            record["status"] = "ENTRY_ROLLED_BACK"
            native.save(state)
            raise
        manifest_path = base.REMOTE + "/runtime/manifest.json"
        with sftp.file(manifest_path, "rb") as stream:
            runtime = json.loads(stream.read())
        runtime.update({"frontend/" + name: item for name, item in manifest.items()})
        write(sftp, manifest_path, json.dumps(runtime, ensure_ascii=False, indent=2).encode())
    record.update({"status": "DEPLOYED", "deployedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                   "indexSha256": manifest["index.html"]["sha256"], "entryAsset": match.group(1),
                   "uploadedBytes": sum(manifest[name]["bytes"] for name in changed),
                   "httpEntryAndAsset": "PASS"})
    native.save(state)
    print(json.dumps(record), flush=True)


def main():
    client = paramiko.SSHClient()

    class VerifiedHost(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh, hostname, key):
            if key.get_fingerprint().hex() != base.HOST_FINGERPRINT:
                raise RuntimeError("Server SSH host key changed")

    client.set_missing_host_key_policy(VerifiedHost())
    try:
        client.connect(base.HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"],
                       timeout=15, allow_agent=False, look_for_keys=False)
        deploy(client)
    finally:
        client.close()


if __name__ == "__main__":
    main()
