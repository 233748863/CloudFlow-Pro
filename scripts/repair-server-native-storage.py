"""Prepare only the missing native HR storage and Nacos naming directories.

No deletion, recursive ownership changes, service restart or credential output.
Defaults to inspection; --apply creates the listed directories and records it.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shlex
import time

import paramiko

spec = importlib.util.spec_from_file_location("native", Path(__file__).with_name("deploy-server-native.py"))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
base = native.base
PATHS = tuple(base.REMOTE + suffix for suffix in ("/.cloudflow", "/.cloudflow/hr", "/.cloudflow/hr/files",
    "/nacos", "/nacos/naming", "/nacos/naming/" + base.NAMESPACE))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
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
        # Validate every resolved path before any permission change, including ancestors.
        source = "import pathlib,json; paths=" + repr(PATHS) + "; rows=[]\n"
        source += "for raw in paths:\n p=pathlib.Path(raw)\n if str(p.resolve())!=raw: raise RuntimeError('Linked path: '+raw)\n if p.exists() and not p.is_dir(): raise RuntimeError('Not a directory: '+raw)\n rows.append({'path':raw,'exists':p.exists(),'mode':oct(p.stat().st_mode & 0o777) if p.exists() else None})\nprint(json.dumps(rows))"
        before = json.loads(native.remote_python(client, source))
        print("BEFORE", json.dumps(before), flush=True)
        if not args.apply:
            return
        # Parent permissions stay 750 root:cloudflow; only application-owned leaves change.
        base.run(client, "install -d -o cloudflow -g cloudflow -m 750 " + " ".join(map(shlex.quote, PATHS)))
        for target in (PATHS[2], PATHS[-1]):
            base.run(client, "runuser -u cloudflow -- test -w " + shlex.quote(target))
        after = json.loads(native.remote_python(client, source))
        record = {"status": "APPLIED", "appliedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "paths": after, "before": before, "runtimeUserWriteCheck": "PASS", "serviceRestart": False}
        state = json.loads(native.STATE.read_text(encoding="utf-8"))
        state["storageDirectoryFix"] = record
        native.save(state)
        print("RESULT", json.dumps(record), flush=True)
    finally:
        client.close()


if __name__ == "__main__":
    main()
