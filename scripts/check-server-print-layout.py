"""Run one fixed PDF layout sample using deployed classes and bundled font.

No application login, database access, configuration edits or service restarts.
Successful automatic checks are retained for a separate visual review; do not
rerender the sample just to update documentation or inspect its three JPG pages.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import time
import zipfile

import paramiko

spec = importlib.util.spec_from_file_location("codegen_checks", Path(__file__).with_name("check-server-codegen-linux.py"))
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
native = helpers.native
base = helpers.base
STATE = base.LOCAL / "print-layout-20261018.json"
OUTPUT = base.LOCAL / "print-layout-checks"
STAGE = base.REMOTE + "/native/print-layout-checks-20261018"
SOURCE = base.ROOT / "scripts/auth-checks/PrintPdfLayoutChecks.java"


def save(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    global STATE, OUTPUT, STAGE
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume-existing", action="store_true", help="inspect the existing PDF after the corrected page-count assertion; never rerender")
    parser.add_argument("--local", action="store_true", help="check the changed renderer locally before deployment")
    parser.add_argument("--fixed", action="store_true", help="check the deployed font fix in a separate recorded sample")
    parser.add_argument("--retry-local", action="store_true", help="check a reviewed second font fix, retaining the first local sample")
    options = parser.parse_args()
    if options.local or options.fixed:
        if options.resume_existing:
            raise RuntimeError("Existing old sample must not be reused for a changed renderer")
        label = "print-layout-font-local" if options.local else "print-layout-font"
        STATE = base.LOCAL / (label + "-20261018.json")
        OUTPUT = base.LOCAL / (label + "-checks")
        STAGE = base.REMOTE + "/native/" + label + "-checks-20261018"
    previous = None
    previous_local = None
    if STATE.exists():
        state = json.loads(STATE.read_text(encoding="utf-8"))
        if state.get("automaticChecksPassed"):
            print(json.dumps({"skipped": "sample already passed automatic checks; inspect saved pages", "complete": state.get("complete", False)}))
            return
        if options.local and options.retry_local and state.get("localOnly"):
            previous_local = state
        elif not options.resume_existing:
            raise RuntimeError("Unfinished check exists; inspect it before any retry")
        else:
            log = (OUTPUT / "run.log").read_text(encoding="utf-8")
            if "AssertionError: 48-row sample naturally occupies two pages" not in log or state.get("inspectionResumed"):
                raise RuntimeError("Resume only the inspected page-count assertion; other failures require review")
            previous = state
    elif options.resume_existing:
        raise RuntimeError("No existing PDF check to resume")
    javac = shutil.which("javac")
    if not javac:
        raise RuntimeError("Local Java compiler unavailable")
    if OUTPUT.exists() and previous is None and previous_local is None:
        raise RuntimeError("Output directory exists; inspect before compiling")
    classes = OUTPUT / "classes"
    classes.mkdir(parents=True, exist_ok=previous is not None or previous_local is not None)
    classpath = os.pathsep.join(str(path) for path in [base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes", *helpers.local_dependencies()])
    args = ["-encoding", "UTF-8", "--release", "17", "-proc:none", "-cp", helpers.java_argument(classpath),
            "-d", helpers.java_argument(classes), helpers.java_argument(SOURCE)]
    compile_args = OUTPUT / "compile.args"
    compile_args.write_text("\n".join(args), encoding="utf-8")
    result = subprocess.run([javac, "@" + str(compile_args)], capture_output=True, timeout=60)
    (OUTPUT / "compile.log").write_bytes(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError("Harness compilation failed; see compile.log")

    if options.local:
        renderer_digest = helpers.sha((base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes/com/cloudflow/auth/printing/PrintPdfRenderer.class").read_bytes())
        sample_output = OUTPUT / ("revision-" + renderer_digest[:12] if previous_local is not None else "output")
        sample_output.mkdir()
        runtime_classpath = os.pathsep.join([str(classes), classpath])
        run_args = OUTPUT / "run.args"
        run_args.write_text("\n".join(["-Xmx192m", "-Djava.awt.headless=true", "-Dfile.encoding=UTF-8", "-cp",
            helpers.java_argument(runtime_classpath), "com.cloudflow.auth.checks.PrintPdfLayoutChecks",
            helpers.java_argument(sample_output)]), encoding="utf-8")
        result = subprocess.run([shutil.which("java"), "@" + str(run_args)], capture_output=True, timeout=60)
        (OUTPUT / "run.log").write_bytes(result.stdout + result.stderr)
        state = {"complete": False, "localOnly": True, "harnessSha256": helpers.sha(SOURCE.read_bytes()),
                 "automaticChecksPassed": result.returncode == 0, "rendererSha256": renderer_digest, "cleanup": "paused by user"}
        if previous_local is not None:
            state.update(initialFailure="CSS root inheritance and a separate earlier margin-box rule did not fix Chinese generated footer text",
                         revisedSampleDirectory=str(sample_output))
        if result.returncode == 0:
            state.update(automaticResult=json.loads((sample_output / "result.json").read_text(encoding="utf-8")),
                         rendererSha256=helpers.sha((base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes/com/cloudflow/auth/printing/PrintPdfRenderer.class").read_bytes()),
                         completedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
        save(state)
        if result.returncode:
            raise RuntimeError("Local layout check failed; see run.log")
        print(json.dumps(state), flush=True)
        return

    class VerifiedHost(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh, hostname, key):
            if key.get_fingerprint().hex() != base.HOST_FINGERPRINT:
                raise RuntimeError("Server SSH host key changed")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(VerifiedHost())
    state = None
    try:
        client.connect(base.HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"],
                       timeout=15, allow_agent=False, look_for_keys=False)
        with client.open_sftp() as sftp:
            before = helpers.snapshot(client)
            deployment = json.loads(native.STATE.read_text(encoding="utf-8"))
            if before["authSha256"] != deployment["jars"]["auth"]["sha256"]:
                raise RuntimeError("Deployed auth differs from deployment record")
            if previous is not None and before["authSha256"] != previous["authSha256"]:
                raise RuntimeError("Deployed auth changed since the existing sample was rendered")
            verified = {}
            with sftp.file(helpers.APP, "rb") as remote:
                with zipfile.ZipFile(remote) as archive:
                    names = [name for name in archive.namelist() if name.startswith("com/cloudflow/auth/printing/PrintPdfRenderer")
                             and name.endswith(".class")]
                    names += ["com/cloudflow/auth/domain/SysPrintTemplate.class", "fonts/NotoSansSC-Regular.ttf"]
                    if len(names) != 4:
                        raise RuntimeError("Unexpected PDF renderer class set")
                    for name in names:
                        local = base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes" / name
                        digest = hashlib.sha256(archive.read(name)).hexdigest()
                        if not local.is_file() or helpers.sha(local.read_bytes()) != digest:
                            raise RuntimeError("Deployed PDF input differs from compiler input: " + name)
                        verified[name] = digest
            if previous is None:
                base.run(client, "test ! -e " + shlex.quote(STAGE) + " && install -d -o cloudflow -g cloudflow -m 750 "
                         + " ".join(shlex.quote(path) for path in [STAGE, STAGE + "/classes", STAGE + "/output"]))
            state = {"complete": False, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "runAs": "cloudflow",
                     "authSha256": before["authSha256"], "verifiedInputs": verified, "harnessSha256": helpers.sha(SOURCE.read_bytes()),
                     "remoteDirectory": STAGE, "applicationLogin": False, "databaseWritten": False,
                     "configurationWritten": False, "cleanup": "paused by user"}
            if previous is not None:
                state.update(inspectionResumed=True, initialFailure=previous["failure"], initialHarnessSha256=previous["harnessSha256"],
                             sampleRerendered=False, existingPdfSha256=helpers.sha((OUTPUT / "layout.pdf").read_bytes()))
                with sftp.file(STAGE + "/output/layout.pdf", "rb") as remote:
                    if helpers.sha(remote.read()) != state["existingPdfSha256"]:
                        raise RuntimeError("Existing PDF differs from the inspected local copy")
            save(state)
            for path in classes.rglob("*.class"):
                relative = path.relative_to(classes).as_posix()
                parent = STAGE + "/classes/" + str(Path(relative).parent).replace("\\", "/")
                base.run(client, "install -d -o cloudflow -g cloudflow -m 750 " + shlex.quote(parent))
                target = STAGE + "/classes/" + relative
                sftp.put(str(path), target)
                sftp.chmod(target, 0o644)
                with sftp.file(target, "rb") as remote:
                    if helpers.sha(remote.read()) != helpers.sha(path.read_bytes()):
                        raise RuntimeError("Uploaded harness differs")
            command_args = ["runuser", "-u", "cloudflow", "--", native.JAVA, "-Xmx192m", "-Djava.awt.headless=true",
                                 "-Dfile.encoding=UTF-8", "-cp", STAGE + "/classes:" + helpers.APP,
                                 "com.cloudflow.auth.checks.PrintPdfLayoutChecks", STAGE + "/output"]
            if previous is not None:
                command_args.append("--existing-pdf")
            command = shlex.join(command_args)
            try:
                base.run(client, command + " > " + shlex.quote(STAGE + "/run.log") + " 2>&1", timeout=60)
            finally:
                sftp.get(STAGE + "/run.log", str(OUTPUT / "run.log"))
            for name in ["layout.pdf", "sample.html", "result.json"]:
                sftp.get(STAGE + "/output/" + name, str(OUTPUT / name))
            result = json.loads((OUTPUT / "result.json").read_text(encoding="utf-8"))
            for page in range(1, result["pages"] + 1):
                for extension in ["txt", "jpg"]:
                    name = "page-" + str(page) + "." + extension
                    sftp.get(STAGE + "/output/" + name, str(OUTPUT / name))
            if previous is not None and helpers.sha((OUTPUT / "layout.pdf").read_bytes()) != state["existingPdfSha256"]:
                raise RuntimeError("Existing PDF changed during inspection")
            if helpers.snapshot(client) != before:
                raise RuntimeError("Runtime JAR or service state changed during sample check")
            if helpers.sha(SOURCE.read_bytes()) != state["harnessSha256"]:
                raise RuntimeError("Harness source changed during verification")
            state.update(automaticChecksPassed=True, visualReview="pending", automaticResult=result,
                         processExited=True, authUnchanged=True, serviceStatesUnchanged=True,
                         automaticCompletedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
            print(json.dumps({"automaticChecksPassed": True, "visualReview": "pending", "result": result}), flush=True)
    except Exception as error:
        if state is not None:
            state["failure"] = str(error)
        raise
    finally:
        if state is not None:
            save(state)
        client.close()


if __name__ == "__main__":
    main()
