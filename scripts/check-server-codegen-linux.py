"""Check the deployed generator's Linux file writes without application login.

Compile only the existing check harness locally, then run it as cloudflow with
the deployed auth JAR and its existing dependencies. Never enable the generator
in the running service, access its database, or restart services. Retain the
small check workspace while user-directed cleanup is paused.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import time
import zipfile

import paramiko

spec = importlib.util.spec_from_file_location("native", Path(__file__).with_name("deploy-server-native.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
base = native.base
STATE = base.LOCAL / "codegen-linux-20261018.json"
OUTPUT = base.LOCAL / "codegen-linux-checks"
STAGE = base.REMOTE + "/native/codegen-linux-checks-20261018"
APP = base.REMOTE + "/runtime/apps/auth/app.jar"
SOURCE = base.ROOT / "scripts/platform-checks/CodegenBoundaryChecks.java"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def save(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def local_dependencies():
    paths = []
    raw = (base.ROOT / "cloudflow-backend/cloudflow-auth/target/approved-runtime-classpath.txt").read_text(encoding="utf-8-sig")
    for value in raw.strip().split(";"):
        path = Path(value)
        if not path.is_file():
            path = Path(value.replace("C:\\Users\\Administrator\\.m2\\repository", "D:\\CloudFlowProCache\\m2\\repository"))
        if not path.is_file():
            raise RuntimeError("Missing compiler dependency: " + path.name)
        paths.append(path)
    return paths


def java_argument(value):
    return '"' + str(value).replace("\\", "/").replace('"', '\\"') + '"'


def compile_harness():
    classes = OUTPUT / "classes"
    if classes.exists():
        raise RuntimeError("Harness output already exists; inspect its result instead of rebuilding")
    javac = shutil.which("javac")
    if not javac:
        raise RuntimeError("Local Java compiler is unavailable")
    classes.mkdir(parents=True)
    product = base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes"
    arguments = OUTPUT / "compile.args"
    classpath = os.pathsep.join(str(path) for path in [product, *local_dependencies()])
    arguments.write_text("\n".join(["-encoding", "UTF-8", "--release", "17", "-proc:none", "-cp",
        java_argument(classpath), "-d", java_argument(classes), java_argument(SOURCE)]), encoding="utf-8")
    result = subprocess.run([javac, "@" + str(arguments)], capture_output=True, timeout=60)
    (OUTPUT / "compile.log").write_bytes(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError("Harness compilation failed; see compile.log")
    return classes


def snapshot(client):
    command = "systemctl show " + " ".join(native.UNITS) + " -p Id -p MainPID -p SubState -p NRestarts"
    return {"authSha256": base.run(client, "sha256sum " + shlex.quote(APP)).split()[0],
            "units": base.run(client, command)}


def inspect(client, sftp):
    state = json.loads(native.STATE.read_text(encoding="utf-8"))
    before = snapshot(client)
    if before["authSha256"] != state["jars"]["auth"]["sha256"]:
        raise RuntimeError("Deployed auth differs from deployment record")
    with sftp.file(APP, "rb") as remote:
        with zipfile.ZipFile(remote) as archive:
            names = [name for name in archive.namelist() if name.startswith("com/cloudflow/auth/")
                     and name.endswith(".class") and ("Codegen" in name)]
            if not names:
                raise RuntimeError("No deployed generator classes found")
            code = {}
            for name in names:
                path = base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes" / name
                digest = sha(archive.read(name))
                if not path.is_file() or sha(path.read_bytes()) != digest:
                    raise RuntimeError("Deployed generator differs from local compiler inputs: " + name)
                code[name] = digest
    platform = json.loads(native.remote_python(client,
        "import json,platform; print(json.dumps({'system':platform.system(),'kernel':platform.release(),'machine':platform.machine()}))"))
    if platform["system"] != "Linux":
        raise RuntimeError("Linux verification requires a Linux server")
    return before, code, platform


def execute(client, sftp):
    if STATE.exists():
        state = json.loads(STATE.read_text(encoding="utf-8"))
        if state.get("complete"):
            print(json.dumps({"complete": True, "skipped": "already passed", "assertions": state["assertions"]}), flush=True)
            return
        raise RuntimeError("An unfinished check is recorded; inspect it before resuming")
    before, code, platform = inspect(client, sftp)
    classes = compile_harness()
    source_sha = sha(SOURCE.read_bytes())
    # Only this new, fixed check directory receives test files; no product paths are written.
    base.run(client, "test ! -e " + shlex.quote(STAGE) + " && install -d -o cloudflow -g cloudflow -m 750 " +
             shlex.quote(STAGE) + " " + shlex.quote(STAGE + "/classes") + " " + shlex.quote(STAGE + "/workspace"))
    state = {"complete": False, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "platform": platform,
             "authSha256": before["authSha256"], "productClasses": code, "harnessSha256": source_sha,
             "remoteDirectory": STAGE, "runAs": "cloudflow", "applicationLogin": False,
             "databaseWritten": False, "runtimeConfigurationWritten": False, "cleanup": "paused by user"}
    save(state)
    try:
        for path in sorted(classes.glob("CodegenBoundaryChecks*.class")):
            target = STAGE + "/classes/" + path.name
            sftp.put(str(path), target)
            sftp.chmod(target, 0o644)
            with sftp.file(target, "rb") as remote:
                if sha(remote.read()) != sha(path.read_bytes()):
                    raise RuntimeError("Uploaded harness differs: " + path.name)
        args = ["runuser", "-u", "cloudflow", "--", native.JAVA, "-Xmx128m", "-Dfile.encoding=UTF-8", "-cp",
                STAGE + "/classes:" + APP, "CodegenBoundaryChecks", STAGE + "/workspace", "--files-only"]
        command = shlex.join(args) + " > " + shlex.quote(STAGE + "/run.log") + " 2>&1"
        try:
            base.run(client, command, timeout=60)
        finally:
            with sftp.file(STAGE + "/run.log", "rb") as remote:
                log = remote.read()
            (OUTPUT / "run.log").write_bytes(log)
        match = re.search(rb"CODEGEN_BOUNDARY_CHECKS: assertions=(\d+); disabled_http_endpoints=0; enabled_control=0; runtime_database_writes=0; running_service_restarts=0", log)
        if not match:
            raise RuntimeError("File check completion marker is missing; see run.log")
        if sha(SOURCE.read_bytes()) != source_sha:
            raise RuntimeError("Harness source changed during verification")
        after = snapshot(client)
        if after != before:
            raise RuntimeError("Deployed auth or running service state changed during verification")
        # Successful synchronous SSH completion proves the Java harness has exited.
        state.update(complete=True, assertions=int(match[1]), completedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                     processExited=True, authUnchanged=True, serviceStatesUnchanged=True)
        print(log.decode("utf-8", "replace"), end="", flush=True)
    except Exception as error:
        state["failure"] = str(error)
        raise
    finally:
        save(state)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()

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
            if args.inspect:
                before, code, platform = inspect(client, sftp)
                print(json.dumps({"platform": platform, "authSha256": before["authSha256"],
                                  "matchingGeneratorClasses": len(code)}), flush=True)
            else:
                execute(client, sftp)
    finally:
        client.close()


if __name__ == "__main__":
    main()
