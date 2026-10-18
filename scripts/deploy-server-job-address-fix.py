"""Incrementally deploy the task instance-address fix to the native development server.

Only the two changed classes (and JobPlatformService's generated nested classes)
may differ from the deployed code. Retain bounded rollback files until the two
ordinary HTTP task checks pass; finalize then removes those files and the unused
old dependency. Credentials remain in environment variables.
"""

import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import time
import zipfile

import paramiko


spec = importlib.util.spec_from_file_location("native_deploy", Path(__file__).with_name("deploy-server-native.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
base = native.base
STAGE = base.REMOTE + "/native/job-address-update"
JOB_NAME = "cloudflow-common-job-1.0.0.jar"


def sha(contents):
    return hashlib.sha256(contents).hexdigest()


def read(sftp, path):
    with sftp.file(path, "rb") as stream:
        return stream.read()


def write(sftp, path, contents):
    with sftp.file(path, "wb") as stream:
        stream.write(contents)
    sftp.chmod(path, 0o644)
    if sha(read(sftp, path)) != sha(contents):
        raise RuntimeError("Uploaded content mismatch: " + path)


def attributes(contents):
    with zipfile.ZipFile(io.BytesIO(contents)) as archive:
        manifest = archive.read("META-INF/MANIFEST.MF").decode("ascii").replace("\r\n ", "")
    return dict(line.split(": ", 1) for line in manifest.splitlines() if ": " in line)


def code_changes(before, after, allowed):
    with zipfile.ZipFile(io.BytesIO(before)) as old, zipfile.ZipFile(io.BytesIO(after)) as new:
        names = set(old.namelist()) | set(new.namelist())
        changed = sorted(name for name in names if not name.endswith("/")
                         and name != "META-INF/MANIFEST.MF"
                         and (name not in old.namelist() or name not in new.namelist()
                              or old.read(name) != new.read(name)))
    if not changed or any(not re.fullmatch(allowed, name) for name in changed):
        raise RuntimeError("Unexpected code changes: " + json.dumps(changed))
    return changed


def executable(contents, manifest):
    output = io.BytesIO()
    encoded = b"".join(native.manifest_line(key, value) for key, value in manifest.items()) + b"\r\n"
    with zipfile.ZipFile(io.BytesIO(contents)) as source, zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        target.writestr("META-INF/MANIFEST.MF", encoded)
        for entry in source.infolist():
            if entry.filename.upper() != "META-INF/MANIFEST.MF":
                target.writestr(entry, source.read(entry.filename))
    return output.getvalue()


def healthy(client, name, port):
    deadline = time.monotonic() + 150
    while time.monotonic() < deadline:
        response = base.run(client, f"curl -s --max-time 2 http://127.0.0.1:{port}/actuator/health || true")
        try:
            if json.loads(response).get("status") == "UP":
                print("HEALTH " + name + " UP", flush=True)
                return
        except ValueError:
            pass
        time.sleep(3)
    raise RuntimeError("Service did not become healthy: " + name)


def apply(client, sftp, state):
    if state["status"] != "VERIFIED" or state.get("jobAddressUpdate"):
        raise RuntimeError("Expected verified native deployment without a previous address update")
    base.run(client, "test ! -e " + STAGE)
    backend = base.ROOT / "cloudflow-backend"
    auth = (backend / "cloudflow-auth/target/cloudflow-auth-1.0.0.jar.original").read_bytes()
    dependency = (backend / "cloudflow-common/cloudflow-common-job/target" / JOB_NAME).read_bytes()
    new_relative = "lib/" + sha(dependency) + "/" + JOB_NAME
    apps = {}
    previous_dependency = None
    for name in base.SERVICES:
        before = read(sftp, base.REMOTE + "/runtime/apps/" + name + "/app.jar")
        manifest = attributes(before)
        paths = manifest.get("Class-Path", "").split()
        selected = [path for path in paths if path.endswith("/" + JOB_NAME)]
        if not selected:
            continue
        if len(selected) != 1 or not re.fullmatch(r"../../lib/[0-9a-f]{64}/" + re.escape(JOB_NAME), selected[0]):
            raise RuntimeError("Unexpected task dependency: " + name)
        old_relative = selected[0][6:]
        if previous_dependency and previous_dependency != old_relative:
            raise RuntimeError("Deployed task dependency differs between services")
        previous_dependency = old_relative
        if sha(before) != state["jars"][name]["sha256"]:
            raise RuntimeError("Application differs from recorded deployment: " + name)
        changes = []
        if name == "auth":
            changes = code_changes(before, auth, r"com/cloudflow/auth/service/JobPlatformService(?:\$[^/]+)?\.class")
        manifest["Class-Path"] = " ".join("../../" + new_relative if path == selected[0] else path for path in paths)
        after = executable(auth if name == "auth" else before, manifest)
        apps[name] = {"before": before, "after": after, "changes": changes}
    if set(apps) != {"auth", "workflow", "oa", "crm", "hr"}:
        raise RuntimeError("Unexpected affected service set")
    old_dependency = read(sftp, base.REMOTE + "/runtime/" + previous_dependency)
    if sha(old_dependency) != previous_dependency.split("/")[1]:
        raise RuntimeError("Deployed dependency digest mismatch")
    changes = code_changes(old_dependency, dependency, r"com/cloudflow/common/job/service/JobExecutionService\.class")
    manifest_path = base.REMOTE + "/runtime/manifest.json"
    runtime_manifest = json.loads(read(sftp, manifest_path))
    record = {"status": "STAGED", "stage": STAGE, "oldDependency": previous_dependency,
              "newDependency": new_relative, "dependencyChanges": changes, "jars": {},
              "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    # Prepare every file before restarting any service; no full runtime copy.
    base.run(client, "mkdir " + STAGE + " && mkdir -p " + base.REMOTE + "/runtime/" + new_relative.rsplit("/", 1)[0])
    write(sftp, base.REMOTE + "/runtime/" + new_relative, dependency)
    for name, item in apps.items():
        write(sftp, STAGE + "/" + name + ".before.jar", item["before"])
        write(sftp, STAGE + "/" + name + ".after.jar", item["after"])
        record["jars"][name] = {"sha256": sha(item["after"]), "bytes": len(item["after"]),
                                "previousSha256": sha(item["before"]), "codeChanges": item["changes"]}
    state["jobAddressUpdate"] = record
    native.save(state)
    restarted = []
    try:
        for name in apps:
            target = base.REMOTE + "/runtime/apps/" + name + "/app.jar"
            restarted.append(name)
            # Atomic replacement avoids truncating the JAR used by the old JVM.
            base.run(client, f"install -m 644 {STAGE}/{name}.after.jar {target}.next && mv -f {target}.next {target} && systemctl restart cloudflow-{name}", timeout=60)
            healthy(client, name, state["jars"][name]["healthPort"])
    except Exception:
        for name in reversed(restarted):
            target = base.REMOTE + "/runtime/apps/" + name + "/app.jar"
            base.run(client, f"install -m 644 {STAGE}/{name}.before.jar {target}.next && mv -f {target}.next {target} && systemctl restart cloudflow-{name}", timeout=60)
            healthy(client, name, state["jars"][name]["healthPort"])
        record["status"] = "ROLLED_BACK"
        native.save(state)
        raise
    for name, item in record["jars"].items():
        state["jars"][name].update({key: item[key] for key in ("sha256", "bytes")})
        runtime_manifest["apps/" + name + "/app.jar"] = {key: item[key] for key in ("sha256", "bytes")}
        props = dict(line.split("=", 1) for line in base.run(client,
            f"systemctl show cloudflow-{name} -p MainPID -p SubState -p NRestarts").splitlines())
        state["units"]["cloudflow-" + name] = {"pid": int(props["MainPID"]),
            "state": props["SubState"], "restarts": int(props["NRestarts"])}
    runtime_manifest[new_relative] = {"sha256": sha(dependency), "bytes": len(dependency)}
    write(sftp, manifest_path + ".next", json.dumps(runtime_manifest, indent=2).encode())
    sftp.posix_rename(manifest_path + ".next", manifest_path)
    record.update({"status": "DEPLOYED", "deployedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    native.save(state)
    print(json.dumps(record), flush=True)


def finalize(client, sftp, state):
    record = state["jobAddressUpdate"]
    if record["status"] != "DEPLOYED":
        raise RuntimeError("Expected deployed address fix after successful HTTP checks")
    # Fixed owned paths, hashes and /proc references are checked before unlinking.
    source = '''import hashlib,json,os,pathlib,shutil,subprocess
r=pathlib.Path('/data/cloudflow')
s=r/'native/job-address-update'
old=r/'runtime'/OLD
expected=EXPECTED
for name,digest in expected.items():
    app=r/'runtime/apps'/name/'app.jar'
    assert hashlib.sha256(app.read_bytes()).hexdigest()==digest
    assert subprocess.check_output(['systemctl','is-active','cloudflow-'+name]).strip()==b'active'
for app in (r/'runtime/apps').glob('*/app.jar'):
    import zipfile
    with zipfile.ZipFile(str(app)) as archive:
        assert OLD.encode() not in archive.read('META-INF/MANIFEST.MF').replace(b'\\r\\n ',b'')
files=list(s.iterdir())+[old]
assert len(files)==11 and all(p.is_file() and not p.is_symlink() for p in files)
assert list(old.parent.iterdir())==[old], 'Old digest directory contains other files'
for p in files:
    assert p.resolve()==p and str(p).startswith(str(r)+'/')
    assert all(not a.is_symlink() for a in p.parents)
    assert p==old or p.name in NAMES
targets=[str(s),str(old)]
ancestors={os.getpid()}
parent=os.getppid()
while parent>1 and parent not in ancestors:
    ancestors.add(parent)
    status=pathlib.Path('/proc/'+str(parent)+'/status').read_text()
    parent=int(next(line.split()[1] for line in status.splitlines() if line.startswith('PPid:')))
for proc in pathlib.Path('/proc').glob('[0-9]*'):
    if int(proc.name) in ancestors:continue
    try:
        command=(proc/'cmdline').read_bytes().decode('utf-8','replace')
        assert not any(t in command for t in targets), 'Active process reference'
        for fd in (proc/'fd').iterdir():
            try:
                link=str(fd.resolve())
                assert not any(link==t or link.startswith(t+'/') for t in targets), 'Open file reference'
            except FileNotFoundError: pass
    except (FileNotFoundError,PermissionError,ProcessLookupError): pass
before=shutil.disk_usage(str(r)).free
size=sum(p.stat().st_size for p in files)
m=r/'runtime/manifest.json'
manifest=json.loads(m.read_text());manifest.pop(OLD,None)
next=m.with_suffix('.json.next');next.write_text(json.dumps(manifest,indent=2));next.chmod(m.stat().st_mode & 0o777);next.replace(m)
for p in files:p.unlink()
s.rmdir();old.parent.rmdir()
print(json.dumps({'files':len(files),'logicalBytes':size,'diskFreeBefore':before,'diskFreeAfter':shutil.disk_usage(str(r)).free}))
'''.replace("OLD", repr(record["oldDependency"])).replace("EXPECTED", repr({name: item["sha256"] for name, item in record["jars"].items()})).replace("NAMES", repr([name + suffix for name in record["jars"] for suffix in (".before.jar", ".after.jar")]))
    result = json.loads(native.remote_python(client, source))
    record.update({"status": "VERIFIED_AND_CLEANED", "cleanup": result,
                   "completedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    native.save(state)
    print(json.dumps(record), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=("apply", "finalize"), required=True)
    args = parser.parse_args()
    state = json.loads(native.STATE.read_text(encoding="utf-8"))
    client = paramiko.SSHClient()

    class VerifiedHost(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh, hostname, key):
            if key.get_fingerprint().hex() != base.HOST_FINGERPRINT:
                raise RuntimeError("Server SSH host key changed")

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
