"""Deploy the two opportunity preview classes to the existing native CRM service.

Verify the deployed digest and exact class changes, retain rollback files, and
restore the previous JAR if the updated service does not become healthy.
"""
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
CLASSES = {"com/cloudflow/crm/service/deal/CrmOpportunityTeamService.class",
           "com/cloudflow/crm/service/opportunity/CrmOpportunityWriteService.class"}
TARGET = base.REMOTE + "/runtime/apps/crm/app.jar"
STAGE = base.REMOTE + "/native/opportunity-preview-update"


def apply(client, sftp, state):
    if state.get("opportunityPreviewUpdate"):
        raise RuntimeError("Opportunity preview update already recorded")
    before = helper.read(sftp, TARGET)
    if helper.sha(before) != state["jars"]["crm"]["sha256"]:
        raise RuntimeError("CRM JAR differs from deployment record")
    manifest_path = base.REMOTE + "/runtime/manifest.json"
    manifest = json.loads(helper.read(sftp, manifest_path))
    if manifest["apps/crm/app.jar"]["sha256"] != helper.sha(before):
        raise RuntimeError("CRM runtime manifest differs from deployed JAR")
    root = base.ROOT / "cloudflow-backend/cloudflow-service-crm/target/classes"
    compiled = {name: (root / name).read_bytes() for name in CLASSES}
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(before)) as source, zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as output:
        if not CLASSES.issubset(source.namelist()):
            raise RuntimeError("Expected opportunity classes are missing")
        for entry in source.infolist():
            output.writestr(entry, compiled.get(entry.filename, source.read(entry.filename)))
    after = buffer.getvalue()
    changes = helper.code_changes(before, after, "(?:" + "|".join(re.escape(name) for name in CLASSES) + ")")
    if set(changes) != CLASSES:
        raise RuntimeError("Both opportunity classes must change together")
    base.run(client, "test ! -e " + STAGE + " && mkdir " + STAGE)
    helper.write(sftp, STAGE + "/before.jar", before)
    helper.write(sftp, STAGE + "/after.jar", after)
    record = {"status": "STAGED", "codeChanges": changes, "previousSha256": helper.sha(before),
              "sha256": helper.sha(after), "bytes": len(after), "startedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    state["opportunityPreviewUpdate"] = record
    native.save(state)
    try:
        base.run(client, f"install -m 644 {STAGE}/after.jar {TARGET}.next && mv -f {TARGET}.next {TARGET} && systemctl restart cloudflow-crm")
        helper.healthy(client, "crm", state["jars"]["crm"]["healthPort"])
    except Exception:
        base.run(client, f"install -m 644 {STAGE}/before.jar {TARGET}.next && mv -f {TARGET}.next {TARGET} && systemctl restart cloudflow-crm")
        helper.healthy(client, "crm", state["jars"]["crm"]["healthPort"])
        record["status"] = "ROLLED_BACK"
        native.save(state)
        raise
    state["jars"]["crm"].update({key: record[key] for key in ("sha256", "bytes")})
    manifest["apps/crm/app.jar"] = {key: record[key] for key in ("sha256", "bytes")}
    helper.write(sftp, manifest_path + ".next", json.dumps(manifest, indent=2).encode())
    sftp.posix_rename(manifest_path + ".next", manifest_path)
    props = dict(line.split("=", 1) for line in base.run(client,
        "systemctl show cloudflow-crm -p MainPID -p SubState -p NRestarts").splitlines())
    state["units"]["cloudflow-crm"] = {"pid": int(props["MainPID"]), "state": props["SubState"], "restarts": int(props["NRestarts"])}
    record.update(status="DEPLOYED", deployedAt=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                  rollbackFiles="retained; cleanup paused by user")
    native.save(state)
    print(json.dumps(record), flush=True)


def main():
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
            apply(client, sftp, state)
    finally:
        client.close()


if __name__ == "__main__":
    main()
