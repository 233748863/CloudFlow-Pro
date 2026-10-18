"""Update only the process-timeout scan class in the existing java -jar deployment.

Apply retains two bounded rollback files. Finalize removes them after the natural
job and related workflow checks have passed. Secrets are supplied by environment.
"""
import argparse
import importlib.util
import io
import json
import os
from pathlib import Path
import time
import zipfile
import paramiko

spec = importlib.util.spec_from_file_location("address_deploy", Path(__file__).with_name("deploy-server-job-address-fix.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
native = helper.native
base = helper.base
STAGE = base.REMOTE + "/native/timeout-process-update"
CLASS = "com/cloudflow/workflow/service/monitor/impl/TimeoutDetectionServiceImpl.class"
TARGET = base.REMOTE + "/runtime/apps/workflow/app.jar"


def apply(client, sftp, state):
    if state.get("timeoutProcessUpdate"):
        raise RuntimeError("An update already exists; do not apply twice")
    before = helper.read(sftp, TARGET)
    if helper.sha(before) != state["jars"]["workflow"]["sha256"]:
        raise RuntimeError("Running JAR differs from deployment record")
    compiled = (base.ROOT / "cloudflow-backend/cloudflow-service-workflow/target/classes" / CLASS).read_bytes()
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(before)) as source, zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as output:
        if CLASS not in source.namelist():
            raise RuntimeError("Expected class is missing")
        for entry in source.infolist():
            output.writestr(entry, compiled if entry.filename == CLASS else source.read(entry.filename))
    after = buffer.getvalue()
    changed = helper.code_changes(before, after, CLASS.replace(".", r"\."))
    base.run(client, "test ! -e " + STAGE + " && mkdir " + STAGE)
    helper.write(sftp, STAGE + "/before.jar", before)
    helper.write(sftp, STAGE + "/after.jar", after)
    record = {"status": "STAGED", "codeChanges": changed, "previousSha256": helper.sha(before),
              "sha256": helper.sha(after), "bytes": len(after), "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    state["timeoutProcessUpdate"] = record
    native.save(state)
    try:
        base.run(client, f"install -m 644 {STAGE}/after.jar {TARGET}.next && mv -f {TARGET}.next {TARGET} && systemctl restart cloudflow-workflow")
        helper.healthy(client, "workflow", state["jars"]["workflow"]["healthPort"])
    except Exception:
        base.run(client, f"install -m 644 {STAGE}/before.jar {TARGET}.next && mv -f {TARGET}.next {TARGET} && systemctl restart cloudflow-workflow")
        helper.healthy(client, "workflow", state["jars"]["workflow"]["healthPort"])
        record["status"] = "ROLLED_BACK"
        native.save(state)
        raise
    state["jars"]["workflow"].update({key: record[key] for key in ("sha256", "bytes")})
    manifest_path = base.REMOTE + "/runtime/manifest.json"
    manifest = json.loads(helper.read(sftp, manifest_path))
    manifest["apps/workflow/app.jar"] = {key: record[key] for key in ("sha256", "bytes")}
    helper.write(sftp, manifest_path + ".next", json.dumps(manifest, indent=2).encode())
    sftp.posix_rename(manifest_path + ".next", manifest_path)
    record.update(status="DEPLOYED", deployedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
    props = dict(line.split("=", 1) for line in base.run(client,
        "systemctl show cloudflow-workflow -p MainPID -p SubState -p NRestarts").splitlines())
    state["units"]["cloudflow-workflow"] = {"pid": int(props["MainPID"]),
        "state": props["SubState"], "restarts": int(props["NRestarts"])}
    native.save(state)
    print(json.dumps(record), flush=True)


def finalize(client, sftp, state):
    record = state["timeoutProcessUpdate"]
    if record["status"] != "DEPLOYED" or helper.sha(helper.read(sftp, TARGET)) != record["sha256"]:
        raise RuntimeError("Expected deployed update with accepted targeted verification")
    base.run(client, "systemctl is-active cloudflow-workflow")
    source = '''import hashlib,json,pathlib,shutil,os
r=pathlib.Path('/data/cloudflow')
s=r/'native/timeout-process-update'
assert s.resolve()==s and all(not p.is_symlink() for p in [s,*s.parents])
expected=EXPECTED
files=list(s.iterdir())
assert {p.name for p in files}==set(expected)
for p in files:
    assert p.is_file() and not p.is_symlink() and hashlib.sha256(p.read_bytes()).hexdigest()==expected[p.name]
ancestors={os.getpid()}
parent=os.getppid()
while parent>1 and parent not in ancestors:
    ancestors.add(parent)
    status=pathlib.Path('/proc/'+str(parent)+'/status').read_text()
    parent=int(next(line.split()[1] for line in status.splitlines() if line.startswith('PPid:')))
for proc in pathlib.Path('/proc').glob('[0-9]*'):
    if int(proc.name) in ancestors:continue
    try:
        assert str(s).encode() not in (proc/'cmdline').read_bytes(), 'Active command reference'
        for fd in (proc/'fd').iterdir():
            try:assert not str(fd.resolve()).startswith(str(s)+'/'), 'Open file reference'
            except FileNotFoundError:pass
    except (FileNotFoundError,PermissionError,ProcessLookupError):pass
before=shutil.disk_usage(str(r)).free
size=sum(p.stat().st_size for p in files)
for p in files:p.unlink()
s.rmdir()
print(json.dumps({'files':len(files),'logicalBytes':size,'diskFreeBefore':before,'diskFreeAfter':shutil.disk_usage(str(r)).free}))
'''.replace("EXPECTED", repr({"before.jar": record["previousSha256"], "after.jar": record["sha256"]}))
    record.update(status="VERIFIED_AND_CLEANED", cleanup=json.loads(native.remote_python(client, source)),
                  completedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
    native.save(state)
    print(json.dumps(record), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=("apply", "finalize"), required=True)
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
            {"apply": apply, "finalize": finalize}[args.phase](client, sftp, state)
    finally:
        client.close()


if __name__ == "__main__":
    main()
