"""Deploy only the PDF renderer and its nested bounded-output class.

Require the focused local layout check first. Reuse the established JAR update,
exact two-entry diff check, health gate and rollback; restart only auth.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path

spec = importlib.util.spec_from_file_location("single_renderer_deploy", Path(__file__).with_name("deploy-server-excel-inline-fix.py"))
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)
update.CLASS = "com/cloudflow/auth/printing/PrintPdfRenderer.class"
update.STAGE = update.base.REMOTE + "/native/print-pdf-font-update"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    options = parser.parse_args()
    check = json.loads((update.base.LOCAL / "print-layout-font-local-20261018.json").read_text(encoding="utf-8"))
    compiled = (update.base.ROOT / "cloudflow-backend/cloudflow-auth/target/classes" / update.CLASS).read_bytes()
    if not check.get("automaticChecksPassed") or check.get("rendererSha256") != update.helper.sha(compiled):
        raise RuntimeError("Exact renderer class must pass the focused local layout check before deployment")
    state = json.loads(update.native.STATE.read_text(encoding="utf-8"))

    class VerifiedHost(update.paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh, hostname, key):
            if key.get_fingerprint().hex() != update.base.HOST_FINGERPRINT:
                raise RuntimeError("Server SSH host key changed")

    client = update.paramiko.SSHClient()
    client.set_missing_host_key_policy(VerifiedHost())
    try:
        client.connect(update.base.HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"],
                       timeout=15, allow_agent=False, look_for_keys=False)
        with client.open_sftp() as sftp:
            update.apply(client, sftp, state, options.inspect, record_key="printPdfFontUpdate",
                         classes=[update.CLASS, update.CLASS.replace(".class", "$BoundedOutput.class")])
    finally:
        client.close()


if __name__ == "__main__":
    main()
