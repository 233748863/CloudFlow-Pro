"""Patch only Office file identification in the three direct native consumers.

Build the dependency from the exact deployed JAR, replace one compiled class,
and point only auth/workflow/hr at its new digest. No cleanup is performed.
Credentials are supplied through environment variables.
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
SERVICES = ("auth", "workflow", "hr")
DEPENDENCY = "cloudflow-common-core-1.0.0.jar"
CLASS = "com/cloudflow/common/core/utils/file/FileUploadUtils.class"
STAGE = base.REMOTE + "/native/office-upload-update"
STATE_KEY = "officeUploadUpdate"


def prepare(sftp, state):
    if state.get(STATE_KEY):
        raise RuntimeError("Office update already recorded; inspect state before retrying")
    apps, old_relative = {}, None
    for name in SERVICES:
        before = helper.read(sftp, base.REMOTE + "/runtime/apps/" + name + "/app.jar")
        if helper.sha(before) != state["jars"][name]["sha256"]:
            raise RuntimeError("Application differs from recorded deployment: " + name)
        manifest = helper.attributes(before)
        paths = manifest.get("Class-Path", "").split()
        selected = [path for path in paths if path.endswith("/" + DEPENDENCY)]
        if len(selected) != 1 or not re.fullmatch(r"../../lib/[0-9a-f]{64}/" + re.escape(DEPENDENCY), selected[0]):
            raise RuntimeError("Unexpected core dependency: " + name)
        relative = selected[0][6:]
        if old_relative and old_relative != relative:
            raise RuntimeError("Direct consumers do not share the same current dependency")
        old_relative = relative
        apps[name] = {"before": before, "manifest": manifest, "paths": paths, "selected": selected[0]}
    old_dependency = helper.read(sftp, base.REMOTE + "/runtime/" + old_relative)
    if helper.sha(old_dependency) != old_relative.split("/")[1]:
        raise RuntimeError("Core dependency digest mismatch")
    compiled = (base.ROOT / ".cloudflow-runtime/office-upload-order-basic" / CLASS).read_bytes()
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(old_dependency)) as source, zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as output:
        if CLASS not in source.namelist():
            raise RuntimeError("File upload implementation missing from deployed dependency")
        for entry in source.infolist():
            output.writestr(entry, compiled if entry.filename == CLASS else source.read(entry.filename))
    dependency = buffer.getvalue()
    changes = helper.code_changes(old_dependency, dependency, re.escape(CLASS))
    new_relative = "lib/" + helper.sha(dependency) + "/" + DEPENDENCY
    for item in apps.values():
        item["manifest"]["Class-Path"] = " ".join("../../" + new_relative if path == item["selected"] else path for path in item["paths"])
        item["after"] = helper.executable(item["before"], item["manifest"])
        with zipfile.ZipFile(io.BytesIO(item["before"])) as before, zipfile.ZipFile(io.BytesIO(item["after"])) as after:
            if set(before.namelist()) != set(after.namelist()) or any(before.read(name) != after.read(name)
                    for name in before.namelist() if name != "META-INF/MANIFEST.MF"):
                raise RuntimeError("Application code changed during dependency switch")
    return apps, dependency, old_relative, new_relative, changes


def apply(client, sftp, state, prepared):
    apps, dependency, old_relative, new_relative, changes = prepared
    manifest_path = base.REMOTE + "/runtime/manifest.json"
    runtime_manifest = json.loads(helper.read(sftp, manifest_path))
    for name, item in apps.items():
        if runtime_manifest["apps/" + name + "/app.jar"]["sha256"] != helper.sha(item["before"]):
            raise RuntimeError("Runtime manifest differs: " + name)
    record = {"status": "STAGED", "stage": STAGE, "oldDependency": old_relative,
              "newDependency": new_relative, "dependencyChanges": changes, "jars": {},
              "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    base.run(client, "test ! -e " + STAGE + " && mkdir " + STAGE + " && mkdir -p "
             + base.REMOTE + "/runtime/" + new_relative.rsplit("/", 1)[0])
    helper.write(sftp, base.REMOTE + "/runtime/" + new_relative, dependency)
    for name, item in apps.items():
        helper.write(sftp, STAGE + "/" + name + ".before.jar", item["before"])
        helper.write(sftp, STAGE + "/" + name + ".after.jar", item["after"])
        record["jars"][name] = {"previousSha256": helper.sha(item["before"]),
                                "sha256": helper.sha(item["after"]), "bytes": len(item["after"])}
    state[STATE_KEY] = record
    native.save(state)
    restarted = []
    try:
        for name in SERVICES:
            target = base.REMOTE + "/runtime/apps/" + name + "/app.jar"
            restarted.append(name)
            base.run(client, f"install -m 644 {STAGE}/{name}.after.jar {target}.next && mv -f {target}.next {target} && systemctl restart cloudflow-{name}")
            helper.healthy(client, name, state["jars"][name]["healthPort"])
    except Exception:
        for name in reversed(restarted):
            target = base.REMOTE + "/runtime/apps/" + name + "/app.jar"
            base.run(client, f"install -m 644 {STAGE}/{name}.before.jar {target}.next && mv -f {target}.next {target} && systemctl restart cloudflow-{name}")
            helper.healthy(client, name, state["jars"][name]["healthPort"])
        record["status"] = "ROLLED_BACK"
        native.save(state)
        raise
    for name, item in record["jars"].items():
        state["jars"][name].update({key: item[key] for key in ("sha256", "bytes")})
        runtime_manifest["apps/" + name + "/app.jar"] = {key: item[key] for key in ("sha256", "bytes")}
        props = dict(line.split("=", 1) for line in base.run(client,
            f"systemctl show cloudflow-{name} -p MainPID -p SubState -p NRestarts").splitlines())
        state["units"]["cloudflow-" + name] = {"pid": int(props["MainPID"]), "state": props["SubState"], "restarts": int(props["NRestarts"])}
    runtime_manifest[new_relative] = {"sha256": helper.sha(dependency), "bytes": len(dependency)}
    helper.write(sftp, manifest_path + ".next", json.dumps(runtime_manifest, indent=2).encode())
    sftp.posix_rename(manifest_path + ".next", manifest_path)
    record.update(status="DEPLOYED", deployedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                  rollbackFiles="retained; cleanup paused by user")
    native.save(state)
    print(json.dumps(record), flush=True)


def main():
    global STAGE, STATE_KEY
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--revision", choices=("order", "zip64"), default="order")
    args = parser.parse_args()
    if args.revision == "zip64":
        STAGE = base.REMOTE + "/native/office-zip64-update"
        STATE_KEY = "officeZip64Update"
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
            prepared = prepare(sftp, state)
            print(json.dumps({"services": SERVICES, "oldDependency": prepared[2],
                              "newDependency": prepared[3], "codeChanges": prepared[4]}), flush=True)
            if args.apply:
                apply(client, sftp, state, prepared)
    finally:
        client.close()


if __name__ == "__main__":
    main()
