"""Check natural ticket expiry with deployed classes and the existing Redis database.

Only one random two-second ticket is created. Its identity exists solely in the
separate check JVM, so this does not create or reuse a production login session.
No HTTP requests, captcha attempts, clock/configuration changes or deletes occur.
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

spec = importlib.util.spec_from_file_location("codegen_helpers", Path(__file__).with_name("check-server-codegen-linux.py"))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
native = helpers.native
base = helpers.base
STATE = base.LOCAL / "download-expiry-redis-20261018.json"
OUTPUT = base.LOCAL / "download-expiry-redis-checks"
STAGE = base.REMOTE + "/native/download-expiry-redis-checks-20261018"
SOURCE = base.ROOT / "scripts/auth-checks/FileDownloadExpiryRedisChecks.java"


def save(state):
    STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def execute(client, sftp, previous=None):
    before = helpers.snapshot(client)
    deployment = json.loads(native.STATE.read_text(encoding="utf-8"))
    if before["authSha256"] != deployment["jars"]["auth"]["sha256"]:
        raise RuntimeError("Deployed auth differs from its deployment record")
    names = ["com/cloudflow/auth/download/FileDownloadTickets" + suffix + ".class"
             for suffix in ("", "$Ticket", "$Access")]
    verified = {}
    with sftp.file(helpers.APP, "rb") as stream:
        with zipfile.ZipFile(stream) as archive:
            for name in names:
                local = base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes" / name
                digest = hashlib.sha256(archive.read(name)).hexdigest()
                if not local.is_file() or helpers.sha(local.read_bytes()) != digest:
                    raise RuntimeError("Deployed ticket class differs from compiler input: " + name)
                verified[name] = digest

    # Read secrets into memory only. Never echo environment values or put them in argv/files.
    with sftp.file(base.REMOTE + "/native.env", "rb") as stream:
        values = dict((key, shlex.split(value)[0]) for key, value in
                      (line.split("=", 1) for line in stream.read().decode("utf-8").splitlines() if "=" in line))
    redis_database = int(values["SPRING_DATA_REDIS_DATABASE"])
    application_json = json.loads(values["SPRING_APPLICATION_JSON"])
    if redis_database != 10 or application_json["spring"]["data"]["redis"]["database"] != redis_database:
        raise RuntimeError("Unexpected deployed Redis database")
    redis_input = {"host": values["REDIS_HOST"], "port": int(values["REDIS_PORT"]),
                   "database": redis_database, "password": values["REDIS_PASSWORD"]}
    if OUTPUT.exists():
        raise RuntimeError("Check output exists; inspect it before retrying")
    javac = shutil.which("javac")
    if not javac:
        raise RuntimeError("Java compiler is unavailable")
    classes = OUTPUT / "classes"
    classes.mkdir(parents=True)
    classpath = os.pathsep.join(str(path) for path in [base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes",
                                                     *helpers.local_dependencies()])
    arguments = OUTPUT / "compile.args"
    arguments.write_text("\n".join(["-encoding", "UTF-8", "--release", "17", "-proc:none", "-cp",
        helpers.java_argument(classpath), "-d", helpers.java_argument(classes), helpers.java_argument(SOURCE)]), encoding="utf-8")
    result = subprocess.run([javac, "@" + str(arguments)], capture_output=True, timeout=60)
    (OUTPUT / "compile.log").write_bytes(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError("Check compilation failed; inspect compile.log")
    package = STAGE + "/classes/com/cloudflow/auth/checks"
    base.run(client, "test ! -e " + shlex.quote(STAGE) + " && install -d -o cloudflow -g cloudflow -m 750 "
             + shlex.quote(package))
    state = {"complete": False, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
             "authSha256": before["authSha256"], "productClasses": verified,
             "harnessSha256": helpers.sha(SOURCE.read_bytes()), "runAs": "cloudflow",
             "remoteDirectory": STAGE, "applicationLogin": False, "identityControlled": True,
             "businessDatabaseWritten": False, "runtimeConfigurationWritten": False,
             "systemClockChanged": False, "http": False, "redisDatabase": redis_database,
             "ticketCount": 1, "ticketTtlMillis": 2000, "explicitDeletes": 0, "cleanup": "paused by user"}
    if previous is not None:
        state["previousAttempt"] = previous
        state["retryReason"] = "Wait from completed Redis write rather than pre-serialization business timestamp"
    save(state)
    try:
        for path in sorted(classes.rglob("*.class")):
            target = package + "/" + path.name
            sftp.put(str(path), target)
            sftp.chmod(target, 0o644)
            with sftp.file(target, "rb") as stream:
                if helpers.sha(stream.read()) != helpers.sha(path.read_bytes()):
                    raise RuntimeError("Uploaded harness differs")
        command = shlex.join(["runuser", "-u", "cloudflow", "--", native.JAVA, "-Xmx128m",
                              "-Dfile.encoding=UTF-8", "-cp", STAGE + "/classes:" + helpers.APP,
                              "com.cloudflow.auth.checks.FileDownloadExpiryRedisChecks"])
        stdin, stdout, stderr = client.exec_command(command, timeout=30)
        stdin.write(json.dumps(redis_input) + "\n")
        stdin.flush()
        stdin.channel.shutdown_write()
        log = stdout.read().decode("utf-8", "replace") + stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        for key, value in values.items():
            if value and any(word in key for word in ("PASSWORD", "SECRET", "KEY")):
                log = log.replace(value, "[redacted]")
        (OUTPUT / "run.log").write_text(log, encoding="utf-8")
        with sftp.file(STAGE + "/run.log", "w") as stream:
            stream.write(log.encode("utf-8"))
        sftp.chmod(STAGE + "/run.log", 0o640)
        match = re.search(r"FILE_DOWNLOAD_EXPIRY_REDIS: assertions=(\d+); ttlMillis=2000; naturalWaitMillis=(\d+); redisDatabase=10; identity_controlled=true; real_clock=true; http=false; explicit_deletes=0", log)
        if code or not match:
            raise RuntimeError("Expiry check failed; inspect sanitized run.log")
        if helpers.snapshot(client) != before:
            raise RuntimeError("Deployed auth or running service state changed")
        if helpers.sha(SOURCE.read_bytes()) != state["harnessSha256"]:
            raise RuntimeError("Harness source changed during verification")
        state.update(complete=True, assertions=int(match[1]), naturalWaitMillis=int(match[2]),
                     processExited=True, authUnchanged=True, serviceStatesUnchanged=True,
                     completedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
        print(match[0], flush=True)
    except Exception as error:
        state["failure"] = str(error)
        raise
    finally:
        save(state)


def main():
    global OUTPUT, STAGE
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume-reviewed-wait", action="store_true")
    options = parser.parse_args()
    previous = None
    if STATE.exists():
        state = json.loads(STATE.read_text(encoding="utf-8"))
        if state.get("complete"):
            print(json.dumps({"complete": True, "skipped": "already passed; no new execution",
                              "assertions": state["assertions"]}), flush=True)
            return
        log_path = OUTPUT / "run.log"
        if (not options.resume_reviewed_wait or state.get("previousAttempt") is not None
                or not log_path.is_file()
                or "AssertionError: Redis removes expired ticket naturally" not in log_path.read_text(encoding="utf-8")):
            raise RuntimeError("Unfinished check exists; inspect it before retrying")
        previous = state
        OUTPUT = OUTPUT / "reviewed-wait"
        STAGE += "-reviewed-wait"
    elif options.resume_reviewed_wait:
        raise RuntimeError("No existing wait-boundary failure to resume")

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
            execute(client, sftp, previous)
    finally:
        client.close()


if __name__ == "__main__":
    main()
