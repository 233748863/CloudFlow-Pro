"""Connection helpers for the existing, explicitly selected development database."""
import os
import paramiko
import pymysql

HOST = "192.168.1.173"
DATABASE = "cloud_flow_db"
SERVICES = ["cloudflow-" + name + ".service" for name in
            ("frontend", "gateway", "auth", "workflow", "oa", "crm", "hr")]


def connect():
    class PinnedKey(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, client, hostname, key):
            if key.get_fingerprint().hex() != "51e999eb4ff3d32879e2f452c9f97f65":
                raise RuntimeError("Development server host key changed")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(PinnedKey())
    try:
        ssh.connect(HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"],
                    look_for_keys=False, allow_agent=False, timeout=15)
        with ssh.open_sftp() as sftp:
            with sftp.open("/data/cloudflow/native.env") as stream:
                source = stream.read().decode("utf-8")
        env = dict(line.split("=", 1) for line in source.splitlines() if "=" in line and not line.startswith("#"))
        env = {key: value.strip().strip('"').strip("'") for key, value in env.items()}
        db = pymysql.connect(host=HOST, user="root", password=env["DB_PASSWORD"],
                             database=DATABASE, charset="utf8mb4", autocommit=True,
                             connect_timeout=15, read_timeout=120, write_timeout=120)
    except Exception:
        ssh.close()
        raise
    return ssh, db, env


def run(ssh, command, timeout=60):
    _, output, error = ssh.exec_command(command, timeout=timeout)
    data = output.read().decode("utf-8", "replace")
    detail = error.read().decode("utf-8", "replace")
    code = output.channel.recv_exit_status()
    if code:
        raise RuntimeError(f"Development server command failed ({code}): {detail[:400]}")
    return data.strip()
