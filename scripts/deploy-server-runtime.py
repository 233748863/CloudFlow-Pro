"""Deploy the approved thin jars to the existing server without replacing shared infrastructure.

Credentials come from environment variables; the server keeps them in a mode-0600 env file.
The prepare phase stages files only. Database backup/installation precedes the start phase.
"""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shlex
import tarfile
import time

import paramiko
import requests


ROOT = Path(__file__).resolve().parents[1]
LOCAL = ROOT / ".cloudflow-runtime" / "server-deployment-20261018"
REMOTE = "/data/cloudflow"
HOST = "192.168.1.173"
HOST_FINGERPRINT = "51e999eb4ff3d32879e2f452c9f97f65"
NAMESPACE = "cloudflow-prod"
NETWORK = "cloudflow-runtime"
SERVICES = {
    "gateway": ("cloudflow-gateway", "com.cloudflow.gateway.GatewayApplication", 9000, 9100),
    "auth": ("cloudflow-auth", "com.cloudflow.auth.AuthApplication", 9001, 9101),
    "workflow": ("cloudflow-service-workflow", "com.cloudflow.workflow.WorkflowApplication", 9002, 9102),
    "oa": ("cloudflow-service-oa", "com.cloudflow.oa.OaApplication", 9003, 9103),
    "crm": ("cloudflow-service-crm", "com.cloudflow.crm.CrmApplication", 9004, 9104),
    "hr": ("cloudflow-service-hr", "com.cloudflow.hr.HrServiceApplication", 9005, 9105),
}


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def run(client, command, timeout=60):
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    output = stdout.read().decode("utf-8", "replace")
    error = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    if code:
        # Shell commands contain paths and public settings only; env contents never enter them.
        raise RuntimeError(f"Remote command failed ({code}): {error[:500]}")
    return output.strip()


def write_remote(sftp, relative, contents, mode=0o640):
    with sftp.file(REMOTE + "/" + relative, "w") as stream:
        stream.write(contents.encode("utf-8"))
    sftp.chmod(REMOTE + "/" + relative, mode)


def inventory(client):
    data = json.loads(run(client, "docker inspect $(docker ps -aq)"))
    return {
        item["Name"].lstrip("/"): {
            "id": item["Id"],
            "status": item["State"]["Status"],
            "health": item["State"].get("Health", {}).get("Status"),
        }
        for item in data
        if not item["Name"].lstrip("/").startswith("cloudflow-")
    }


def package():
    files = {}
    classpaths = {}
    for name, (module, main, port, health) in SERVICES.items():
        target = ROOT / "cloudflow-backend" / module / "target"
        files[f"apps/{name}/app.jar"] = target / f"{module}-1.0.0.jar"
        dependencies = (target / "approved-runtime-classpath.txt").read_text(encoding="utf-8-sig").strip().split(";")
        paths = [f"/app/apps/{name}/app.jar"]
        for dependency in dependencies:
            source = Path(dependency)
            if not source.is_file():
                raise RuntimeError("Missing compiled dependency: " + source.name)
            # Different Maven groups can publish different jars under the same basename.
            relative = "lib/" + digest(source) + "/" + source.name
            if relative in files and files[relative] != source and digest(files[relative]) != digest(source):
                raise RuntimeError("Conflicting dependency name: " + source.name)
            files[relative] = source
            paths.append("/app/" + relative)
        classpaths[name] = ":".join(paths)
    files["config/cloudflow-common.yaml"] = ROOT / "config/cloudflow-common.yaml"
    for module, _, _, _ in SERVICES.values():
        files[f"config/{module}.yaml"] = ROOT / f"config/{module}.yaml"
    frontend = ROOT / "cloudflow-frontend/dist"
    if not (frontend / "index.html").is_file():
        raise RuntimeError("Build the frontend first")
    for path in frontend.rglob("*"):
        if path.is_file():
            files["frontend/" + path.relative_to(frontend).as_posix()] = path
    manifest = {relative: {"sha256": digest(path), "bytes": path.stat().st_size} for relative, path in files.items()}
    archive = LOCAL / "runtime.tar.gz"
    with tarfile.open(archive, "w:gz", compresslevel=1) as tar:
        for relative, path in files.items():
            tar.add(path, arcname=relative, recursive=False)
        contents = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        item = tarfile.TarInfo("manifest.json")
        item.size = len(contents)
        tar.addfile(item, io.BytesIO(contents))
    return archive, classpaths, manifest


def ensure_namespace():
    session = requests.Session()
    session.trust_env = False
    base = f"http://{HOST}:8848/nacos/v1"
    response = session.post(base + "/auth/login", data={"username": os.environ["NACOS_USERNAME"], "password": os.environ["NACOS_PASSWORD"]}, timeout=15)
    response.raise_for_status()
    token = response.json().get("accessToken")
    if not token:
        raise RuntimeError("Nacos authentication failed")
    params = {"accessToken": token}
    response = session.get(base + "/console/namespaces", params=params, timeout=15)
    response.raise_for_status()
    if not any(item["namespace"] == NAMESPACE for item in response.json()["data"]):
        response = session.post(base + "/console/namespaces", params=params, data={"customNamespaceId": NAMESPACE, "namespaceName": "CloudFlow Pro", "namespaceDesc": "CloudFlow server deployment; external integrations deferred"}, timeout=15)
        response.raise_for_status()
        if response.json() is not True:
            raise RuntimeError("Nacos namespace creation failed")
    print("NACOS_NAMESPACE_READY=" + NAMESPACE, flush=True)


def compose(classpaths):
    common = {
        "image": "ma-java17-runtime:phase2-378",
        "restart": "unless-stopped",
        "user": "10001:10001",
        "working_dir": "/app",
        "env_file": ["runtime.env"],
        "entrypoint": ["java"],
        "volumes": [REMOTE + "/runtime:/app:ro", REMOTE + "/data:/data/cloudflow"],
        "networks": [NETWORK],
        "mem_limit": "1536m",
        "logging": {"driver": "json-file", "options": {"max-size": "10m", "max-file": "2"}},
        "labels": {"cloudflow.owner": "CloudFlowPro", "cloudflow.release": "20261018"},
    }
    services = {}
    for name, (module, main, port, health) in SERVICES.items():
        service = dict(common)
        service["container_name"] = "cloudflow-" + name
        service["volumes"] = common["volumes"] + [REMOTE + "/data/logs/" + name + ":/app/logs"]
        service["command"] = ["-Xms128m", "-Xmx768m", "-Dfile.encoding=UTF-8", "-Duser.timezone=Asia/Shanghai", "-cp", classpaths[name], main]
        # Nacos uses the container address, reachable by other CloudFlow containers.
        service["environment"] = {
            "MANAGEMENT_SERVER_PORT": str(health),
            "SPRING_CONFIG_ADDITIONAL_LOCATION": f"optional:file:/app/config/cloudflow-common.yaml,optional:file:/app/config/{module}.yaml",
        }
        service["ports"] = [f"127.0.0.1:{health + 10000}:{health}"]
        if name == "gateway":
            service["ports"].append(f"{HOST}:19000:9000")
        service["healthcheck"] = {"test": ["CMD", "curl", "-fsS", f"http://127.0.0.1:{health}/actuator/health"], "interval": "15s", "timeout": "5s", "retries": 5, "start_period": "90s"}
        services[name] = service
    services["frontend"] = {
        "image": "ma-nginx:1.30.5", "container_name": "cloudflow-frontend", "restart": "unless-stopped",
        "ports": [f"{HOST}:18080:80"],
        "volumes": [REMOTE + "/runtime/frontend:/usr/share/nginx/html:ro", REMOTE + "/nginx.conf:/etc/nginx/conf.d/default.conf:ro"],
        "networks": [NETWORK], "mem_limit": "128m", "logging": common["logging"], "labels": common["labels"],
        "healthcheck": {"test": ["CMD", "wget", "-q", "--spider", "http://127.0.0.1/"], "interval": "15s", "timeout": "5s", "retries": 3},
    }
    return {"version": "2.4", "services": services, "networks": {NETWORK: {"external": True}}}


def prepare(client):
    ensure_namespace()
    archive, classpaths, manifest = package()
    baseline = inventory(client)
    # Refuse to replace an existing deployment or a symlinked target.
    run(client, f"test ! -L {REMOTE} && test ! -e {REMOTE}/runtime && mkdir -p {REMOTE}/runtime {REMOTE}/data && chmod 750 {REMOTE} && chown 10001:10001 {REMOTE}/data")
    for name in SERVICES:
        run(client, f"mkdir -p {REMOTE}/data/logs/{name} && chown 10001:10001 {REMOTE}/data/logs/{name}")
    sftp = client.open_sftp()
    try:
        sftp.put(str(archive), REMOTE + "/runtime.tar.gz")
        if run(client, f"sha256sum {REMOTE}/runtime.tar.gz").split()[0] != digest(archive):
            raise RuntimeError("Uploaded package digest mismatch")
        run(client, f"tar -xzf {REMOTE}/runtime.tar.gz -C {REMOTE}/runtime && mkdir -p {REMOTE}/runtime/logs && chmod -R a+rX {REMOTE}/runtime")
        # Verify only the staged manifest; no cross-project regression or input scans.
        verification = "import hashlib,json,pathlib; r=pathlib.Path('" + REMOTE + "/runtime'); m=json.loads((r/'manifest.json').read_text()); assert all(hashlib.sha256((r/p).read_bytes()).hexdigest()==v['sha256'] for p,v in m.items()); print(len(m))"
        verified = int(run(client, "python3 -c " + shlex.quote(verification)))
        run(client, f"rm -f -- {REMOTE}/runtime.tar.gz")
        required = ["DB_USERNAME", "DB_PASSWORD", "NACOS_USERNAME", "NACOS_PASSWORD", "REDIS_PASSWORD", "CLOUDFLOW_JOB_AUTH_KEY", "CLOUDFLOW_JOB_HR_KEY", "CLOUDFLOW_JOB_WORKFLOW_KEY", "CLOUDFLOW_JOB_OA_KEY", "CLOUDFLOW_JOB_CRM_KEY", "CLOUDFLOW_MESSAGE_SECRET_KEY", "TOTP_ENCRYPTION_KEY"]
        values = {name: os.environ[name] for name in required}
        values.update({
            "SPRING_PROFILES_ACTIVE": "prod", "NACOS_SERVER": f"{HOST}:8848", "NACOS_NAMESPACE": NAMESPACE,
            "DB_URL": f"jdbc:mysql://{HOST}:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai",
            "REDIS_HOST": HOST, "REDIS_PORT": "6379", "SPRING_DATA_REDIS_DATABASE": "10",
            "CLOUDFLOW_JOB_AUTH_URL": "http://cloudflow-auth:9001", "CLOUDFLOW_CODEGEN_ENABLED": "true",
            "CLOUDFLOW_PORTAL_ENABLED": "false", "CLOUDFLOW_TOTP_ENABLED": "false", "AI_ENABLED": "false",
            "SPRING_CONFIG_ADDITIONAL_LOCATION": "optional:file:/app/config/cloudflow-common.yaml",
            "SPRING_APPLICATION_JSON": json.dumps({"spring": {"data": {"redis": {"database": 10}}, "datasource": {"dynamic": {"hikari": {"minimum-idle": 2, "maximum-pool-size": 20}}}}, "cloudflow": {"audit": {"archive": {"dry-run": False}}}}, separators=(",", ":")),
            "CLOUDFLOW_CORS_ALLOWED_ORIGINS": f"http://{HOST}:18080", "TZ": "Asia/Shanghai",
        })
        if any("\n" in value or "\r" in value or "$" in value for value in values.values()):
            raise RuntimeError("Environment values cannot contain newlines or Compose interpolation")
        write_remote(sftp, "runtime.env", "".join(f"{key}={value}\n" for key, value in values.items()), 0o600)
        write_remote(sftp, "runtime-compose.json", json.dumps(compose(classpaths), indent=2))
        nginx = (ROOT / "docker/frontend/nginx.conf").read_text(encoding="utf-8-sig")
        # The server already owns ports 80/443; expose this LAN deployment on 18080.
        start = nginx.index("server {", nginx.index("server {") + 1)
        nginx = nginx[:nginx.index("server {")] + nginx[start:]
        nginx = nginx.replace("listen 443 ssl;", "listen 80;").replace("http2 on;", "")
        nginx = nginx.replace("http://gateway:9000", "http://cloudflow-gateway:9000")
        nginx = "\n".join(line for line in nginx.splitlines() if not line.strip().startswith("ssl_") and "Strict-Transport-Security" not in line)
        write_remote(sftp, "nginx.conf", nginx)
        run(client, f"docker network inspect {NETWORK} >/dev/null 2>&1 || docker network create --label cloudflow.owner=CloudFlowPro {NETWORK}")
        # Validate configuration before starting containers; avoid printing resolved secrets.
        run(client, f"cd {REMOTE} && docker-compose -p cloudflow -f runtime-compose.json config --quiet")
        state = {"status": "STAGED", "target": HOST, "redisDatabase": 10, "namespace": NAMESPACE, "filesVerified": verified, "packageSha256": digest(archive), "baseline": baseline, "preparedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
        (LOCAL / "deployment.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"REMOTE_STAGED files={verified}; services=6; frontend=1; shared_infrastructure_unchanged=true", flush=True)
    finally:
        sftp.close()


def start(client):
    state = json.loads((LOCAL / "deployment.json").read_text(encoding="utf-8"))
    database = json.loads((ROOT / ".cloudflow-runtime/full-prd-20260915/approved-runtime/deployment-state.json").read_text(encoding="utf-8-sig"))
    if database["status"] != "INITIALIZED" or database["redis"]["database"] != 10:
        raise RuntimeError("Approved database installation and isolated Redis preparation must pass first")
    if state["target"] != HOST:
        raise RuntimeError("Deployment state target mismatch")
    output = run(client, f"cd {REMOTE} && docker-compose -p cloudflow -f runtime-compose.json up -d --no-build", timeout=180)
    # Nginx resolves an upstream at startup; refresh its address after gateway recreation.
    run(client, "docker exec cloudflow-frontend nginx -t && docker exec cloudflow-frontend nginx -s reload")
    print(output, flush=True)
    state["status"] = "STARTING"
    (LOCAL / "deployment.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print("REMOTE_CONTAINERS_STARTED=true", flush=True)


def status(client):
    state = json.loads((LOCAL / "deployment.json").read_text(encoding="utf-8"))
    data = json.loads(run(client, "docker inspect " + " ".join("cloudflow-" + name for name in [*SERVICES, "frontend"])))
    health = {item["Name"].lstrip("/"): {"status": item["State"]["Status"], "health": item["State"].get("Health", {}).get("Status"), "restarts": item["RestartCount"]} for item in data}
    others = inventory(client)
    unchanged = all(others.get(name, {}).get("id") == previous["id"] and others[name]["status"] == previous["status"] for name, previous in state["baseline"].items())
    passed = all(item["status"] == "running" and item["health"] == "healthy" for item in health.values()) and unchanged
    state.update({"status": "RUNNING" if passed else "STARTING_OR_FAILED", "health": health, "existingContainersUnchanged": unchanged, "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    (LOCAL / "deployment.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"target": HOST, "passed": passed, "health": health, "existingContainersUnchanged": unchanged}, ensure_ascii=False), flush=True)
    return passed


def verify(client):
    if not status(client):
        raise RuntimeError("Server containers are not all healthy; inspect startup before retrying")
    sftp = client.open_sftp()
    try:
        with sftp.file(REMOTE + "/runtime.env") as stream:
            values = dict(line.split("=", 1) for line in stream.read().decode("utf-8").splitlines() if "=" in line)
    finally:
        sftp.close()
    session = requests.Session()
    session.trust_env = False
    checks = {}
    base = f"http://{HOST}:18080"
    response = session.get(base + "/", timeout=20)
    response.raise_for_status()
    if '<div id="root"' not in response.text:
        raise RuntimeError("Frontend did not return the application shell")
    checks["frontend"] = response.status_code
    import re
    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', response.text)
    if not assets:
        raise RuntimeError("Frontend assets are missing")
    response = session.get(base + assets[0], timeout=20)
    response.raise_for_status()
    checks["staticAsset"] = response.status_code
    for name, path in {"tenantDatabaseRead": "/api/auth/tenant/options", "captchaRedisWrite": "/api/auth/captcha/slider"}.items():
        response = session.get(base + path, timeout=20)
        response.raise_for_status()
        result = response.json()
        if result.get("code") != 200 or result.get("data") is None:
            raise RuntimeError(f"Public startup check failed: {name}; code={result.get('code')}")
        checks[name] = response.status_code
    nacos = f"http://{HOST}:8848/nacos/v1"
    response = session.post(nacos + "/auth/login", data={"username": values["NACOS_USERNAME"], "password": values["NACOS_PASSWORD"]}, timeout=15)
    response.raise_for_status()
    token = response.json()["accessToken"]
    registered = {}
    for module, _, port, _ in SERVICES.values():
        response = session.get(nacos + "/ns/instance/list", params={"accessToken": token, "namespaceId": NAMESPACE, "serviceName": module, "healthyOnly": "true"}, timeout=15)
        response.raise_for_status()
        hosts = response.json().get("hosts", [])
        if len(hosts) != 1 or not hosts[0].get("healthy") or hosts[0]["port"] != port:
            raise RuntimeError("Expected one healthy server instance: " + module)
        registered[module] = {"ip": hosts[0]["ip"], "port": port}
    state = json.loads((LOCAL / "deployment.json").read_text(encoding="utf-8"))
    state.update({"status": "VERIFIED", "entry": base, "startupChecks": checks, "registeredServices": registered, "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    (LOCAL / "deployment.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"entry": base, "startupChecks": checks, "registeredServices": registered}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["prepare", "start", "status", "verify"], required=True)
    arguments = parser.parse_args()
    LOCAL.mkdir(parents=True, exist_ok=True)
    client = paramiko.SSHClient()
    class VerifiedHost(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh, hostname, key):
            if key.get_fingerprint().hex() != HOST_FINGERPRINT:
                raise RuntimeError("Server SSH host key changed")
    client.set_missing_host_key_policy(VerifiedHost())
    try:
        client.connect(HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"], timeout=15, look_for_keys=False, allow_agent=False)
        {"prepare": prepare, "start": start, "status": status, "verify": verify}[arguments.phase](client)
    finally:
        client.close()


if __name__ == "__main__":
    main()
