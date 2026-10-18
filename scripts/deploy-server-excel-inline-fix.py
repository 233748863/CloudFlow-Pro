"""Update only PrintExcelRenderer in the existing native auth service.

Verify the running digest and exact changed ZIP entry; retain rollback files while
cleanup is paused. Do not rebuild a package or restart unrelated services.
"""
import argparse
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import time
import zipfile

import paramiko

spec = importlib.util.spec_from_file_location("address_deploy", Path(__file__).with_name("deploy-server-job-address-fix.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
native, base = helper.native, helper.base
CLASS = "com/cloudflow/auth/printing/PrintExcelRenderer.class"
TARGET = base.REMOTE + "/runtime/apps/auth/app.jar"
STAGE = base.REMOTE + "/native/excel-inline-update"


def apply(client, sftp, state, inspect_only, record_key="printExcelInlineUpdate", classes=None):
    if state.get(record_key):
        raise RuntimeError("Renderer update already recorded; inspect its state instead of repeating")
    before = helper.read(sftp, TARGET)
    if helper.sha(before) != state["jars"]["auth"]["sha256"]:
        raise RuntimeError("Running JAR differs from deployment record")
    classes = [CLASS] if classes is None else classes
    compiled = {name: (base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes" / name).read_bytes() for name in classes}
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(before)) as source, zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as output:
        if any(source.namelist().count(name) != 1 for name in classes):
            raise RuntimeError("Expected unique renderer class is missing")
        for entry in source.infolist():
            output.writestr(entry, compiled.get(entry.filename, source.read(entry.filename)))
    after = buffer.getvalue()
    changes = helper.code_changes(before, after, "(?:" + "|".join(re.escape(name) for name in classes) + ")")
    if inspect_only:
        print(json.dumps({"previousSha256": helper.sha(before), "sha256": helper.sha(after),
                          "codeChanges": changes, "bytes": len(after)}), flush=True)
        return
    base.run(client, "test ! -e " + STAGE + " && mkdir " + STAGE)
    helper.write(sftp, STAGE + "/before.jar", before)
    helper.write(sftp, STAGE + "/after.jar", after)
    record = {"status": "STAGED", "codeChanges": changes, "previousSha256": helper.sha(before),
              "sha256": helper.sha(after), "bytes": len(after), "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    state[record_key] = record
    native.save(state)
    try:
        base.run(client, f"install -m 644 {STAGE}/after.jar {TARGET}.next && mv -f {TARGET}.next {TARGET} && systemctl restart cloudflow-auth")
        helper.healthy(client, "auth", state["jars"]["auth"]["healthPort"])
    except Exception:
        base.run(client, f"install -m 644 {STAGE}/before.jar {TARGET}.next && mv -f {TARGET}.next {TARGET} && systemctl restart cloudflow-auth")
        helper.healthy(client, "auth", state["jars"]["auth"]["healthPort"])
        record["status"] = "ROLLED_BACK"
        native.save(state)
        raise
    state["jars"]["auth"].update({key: record[key] for key in ("sha256", "bytes")})
    path = base.REMOTE + "/runtime/manifest.json"
    manifest = json.loads(helper.read(sftp, path))
    manifest["apps/auth/app.jar"] = {key: record[key] for key in ("sha256", "bytes")}
    helper.write(sftp, path + ".next", json.dumps(manifest, indent=2).encode())
    sftp.posix_rename(path + ".next", path)
    props = dict(line.split("=", 1) for line in base.run(client,
        "systemctl show cloudflow-auth -p MainPID -p SubState -p NRestarts").splitlines())
    state["units"]["cloudflow-auth"] = {"pid": int(props["MainPID"]), "state": props["SubState"], "restarts": int(props["NRestarts"])}
    record.update(status="DEPLOYED", deployedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                  rollbackFiles="retained; cleanup paused by user")
    native.save(state)
    print(json.dumps(record), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()
    state = json.loads(native.STATE.read_text(encoding="utf-8"))

    class VerifiedHost(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh, hostname, key):
            if key.get_fingerprint().hex() != base.HOST_FINGERPRINT:
                raise RuntimeError("Server SSH host key changed")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(VerifiedHost())
    try:
        client.connect(base.HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"],
                       timeout=15, allow_agent=False, look_for_keys=False)
        with client.open_sftp() as sftp:
            apply(client, sftp, state, args.inspect)
    finally:
        client.close()


if __name__ == "__main__":
    main()
