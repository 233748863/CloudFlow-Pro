"""Read the selected test server without changing services, data or configuration.

SSH credentials come only from CLOUDFLOW_SERVER_SSH_PASSWORD. Runtime secrets stay
in memory; output contains key names and explicitly selected public settings.
"""
import hashlib
from collections import Counter
import json
import os
from pathlib import Path
import re
import shlex
import sys
from urllib.parse import urlsplit

import paramiko
import pymysql
import requests
import redis
import yaml


HOST = "192.168.1.173"
ROOT = Path(__file__).resolve().parents[2]
REMOTE = "/data/cloudflow"
MODULES = {"gateway": "cloudflow-gateway", "auth": "cloudflow-auth",
           "workflow": "cloudflow-service-workflow", "oa": "cloudflow-service-oa",
           "crm": "cloudflow-service-crm", "hr": "cloudflow-service-hr"}


class PinnedKey(paramiko.MissingHostKeyPolicy):
    def missing_host_key(self, client, hostname, key):
        if key.get_fingerprint().hex() != "51e999eb4ff3d32879e2f452c9f97f65":
            raise RuntimeError("Selected server host key changed")


def connect_ssh():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(PinnedKey())
    client.connect(HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"],
                   look_for_keys=False, allow_agent=False, timeout=15)
    return client


def run(client, command, timeout=45):
    _, output, error = client.exec_command(command, timeout=timeout)
    body = output.read().decode("utf-8", "replace")
    error.read()
    code = output.channel.recv_exit_status()
    if code:
        raise RuntimeError("Read-only remote command failed, exit=" + str(code))
    return body


def read(sftp, path):
    with sftp.open(path) as stream:
        return stream.read()


def env_values(source):
    result = {}
    for line in source.splitlines():
        if "=" not in line or line.lstrip().startswith("#"):
            continue
        key, value = line.split("=", 1)
        parsed = shlex.split(value)
        result[key.strip()] = parsed[0] if parsed else ""
    return result


def flatten(value, prefix=""):
    result = {}
    for key, item in value.items():
        name = prefix + str(key)
        if isinstance(item, dict):
            result.update(flatten(item, name + "."))
        else:
            result[name] = item
    return result


def public_environment(values):
    names = ("SERVER_ADDRESS", "SERVER_PORT", "MANAGEMENT_SERVER_ADDRESS", "MANAGEMENT_SERVER_PORT",
             "SPRING_CONFIG_ADDITIONAL_LOCATION", "SPRING_PROFILES_ACTIVE", "SPRING_REDIS_DATABASE",
             "SPRING_DATA_REDIS_DATABASE", "REDIS_HOST", "REDIS_PORT", "REDIS_DATABASE", "NACOS_SERVER_ADDR", "NACOS_SERVER",
             "NACOS_NAMESPACE", "SPRING_CLOUD_NACOS_CONFIG_NAMESPACE", "SPRING_CLOUD_NACOS_DISCOVERY_NAMESPACE",
             "CLOUDFLOW_JOB_AUTH_URL", "CLOUDFLOW_ENCRYPT_ENABLED", "CLOUDFLOW_PORTAL_ENABLED",
             "CLOUDFLOW_TOTP_ENABLED", "CLOUDFLOW_CORS_ALLOWED_ORIGINS")
    result = {name: values[name] for name in names if name in values}
    if values.get("DB_URL"):
        parsed = urlsplit(values["DB_URL"].removeprefix("jdbc:"))
        result["databaseTarget"] = {"host": parsed.hostname, "port": parsed.port or 3306, "database": parsed.path.strip("/")}
    if values.get("SPRING_APPLICATION_JSON"):
        encoded = flatten(json.loads(values["SPRING_APPLICATION_JSON"]))
        result["springApplicationJsonKeys"] = sorted(encoded)
        result["springApplicationJsonPublic"] = {key: value for key, value in encoded.items()
                if key in ("spring.data.redis.database", "spring.redis.database", "spring.redis.port",
                           "spring.data.redis.port", "spring.data.redis.host", "spring.redis.host")}
    return result


def inspect(client):
    result = {"target": HOST, "readOnly": True, "serverTime": run(client, "date -Iseconds").strip()}
    result["units"] = {}
    configs = {}
    runtime = {}
    with client.open_sftp() as sftp:
        environment = env_values(read(sftp, REMOTE + "/native.env").decode())
        result["environmentFile"] = {"path": REMOTE + "/native.env", "mode": oct(sftp.stat(REMOTE + "/native.env").st_mode & 0o777),
                                     "keys": sorted(environment), "public": public_environment(environment)}
        result["unitFiles"] = run(client, "systemctl list-unit-files 'cloudflow-*.service' --no-legend --no-pager").strip().splitlines()
        for name in [*MODULES, "frontend"]:
            unit = "cloudflow-" + name + ".service"
            properties = dict(line.split("=", 1) for line in run(client, "systemctl show " + unit
                + " -p ActiveState -p SubState -p MainPID -p NRestarts -p FragmentPath -p WorkingDirectory -p User -p Group -p ActiveEnterTimestamp").splitlines())
            source = read(sftp, properties["FragmentPath"]).decode()
            properties["unitConfiguration"] = [line for line in source.splitlines() if line.startswith(("ExecStart=", "ExecStartPre=", "WorkingDirectory=", "EnvironmentFile="))]
            pid = properties["MainPID"]
            if pid != "0":
                actual = dict(item.split("=", 1) for item in read(sftp, "/proc/" + pid + "/environ").decode().split("\0") if "=" in item)
                runtime[name] = actual
                properties["environmentKeys"] = sorted(actual)
                properties["publicEnvironment"] = public_environment(actual)
            result["units"][name] = properties
        result["externalConfigs"] = {}
        for module in ["cloudflow-common", *MODULES.values()]:
            path = REMOTE + "/runtime/config/" + module + ".yaml"
            content = read(sftp, path)
            config = yaml.safe_load(content)
            configs[module] = config
            local_path = ROOT / "config" / (module + ".yaml")
            result["externalConfigs"][module] = {"path": path, "sha256": hashlib.sha256(content).hexdigest(),
                "parsedEqualToLocal": local_path.exists() and yaml.safe_load(local_path.read_text(encoding="utf-8-sig")) == config}
        gateway = configs["cloudflow-gateway"]["spring"]["cloud"]["gateway"]
        result["gatewayRoutes"] = gateway["routes"]
        result["gatewayCors"] = gateway.get("globalcors", {})
        result["nacosExternalProperties"] = {module: {key: value for key, value in flatten(config).items()
                if "nacos" in key and not re.search(r"password|username|secret|token", key, re.I)} for module, config in configs.items()}
        nginx = read(sftp, REMOTE + "/native/nginx/nginx.conf").decode()
        result["nginxTargets"] = [line.strip() for line in nginx.splitlines()
                                  if re.match(r"\s*(listen|root|proxy_pass|client_max_body_size)\b", line)]
        try:
            manifest = json.loads(read(sftp, REMOTE + "/runtime/release-manifest.json"))
            result["releaseManifest"] = {"keys": sorted(manifest), "public": {key: manifest[key] for key in
                    ("version", "commit", "gitCommit", "sourceCommit", "release", "releaseId", "builtAt", "deployedAt") if key in manifest}}
        except FileNotFoundError:
            result["releaseManifest"] = None
    result["listeningPorts"] = run(client, "ss -lntp | awk 'NR == 1 || /:18080 |:1900[0-5] |:1910[0-5] |:3306 |:6379 |:8848 /'").strip().splitlines()
    result["containers"] = [{key: item[key] for key in ("ID", "Names", "Image", "State", "Ports")}
                            for item in (json.loads(line) for line in run(client, "docker ps --format '{{json .}}'").splitlines())]
    remote_source = '''import hashlib,json,pathlib,shutil,zipfile
r=pathlib.Path('/data/cloudflow/runtime'); out={}
for name in ['gateway','auth','workflow','oa','crm','hr']:
 p=r/'apps'/name/'app.jar'
 with zipfile.ZipFile(str(p)) as z:
  m=z.read('META-INF/MANIFEST.MF').decode().replace('\\r\\n ', '')
  data=dict(line.split(': ',1) for line in m.splitlines() if ': ' in line)
  out[name]={'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'mainClass':data.get('Main-Class'),'startClass':data.get('Start-Class'),'classPathEntries':len(data.get('Class-Path','').split()),'bootLibraryEntries':len([k for k in z.namelist() if k.startswith('BOOT-INF/lib/')])}
p=r/'frontend/index.html'; out['frontend']={'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
out['diskFreeBytes']=shutil.disk_usage(str(r)).free
print(json.dumps(out))'''
    result["artifacts"] = json.loads(run(client, "python3 -c " + shlex.quote(remote_source)))
    result["health"] = {}
    for name, values in runtime.items():
        if name == "frontend":
            continue
        port = values.get("MANAGEMENT_SERVER_PORT")
        result["health"][name] = json.loads(run(client, "curl -fsS --max-time 10 http://127.0.0.1:" + str(int(port)) + "/actuator/health"))
    result["frontendHttp"] = run(client, "curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://192.168.1.173:18080/").strip()
    values = runtime["auth"]
    spring_json = flatten(json.loads(values.get("SPRING_APPLICATION_JSON", "{}")))
    redis_database = int(spring_json.get("spring.data.redis.database", values.get("SPRING_DATA_REDIS_DATABASE", "0")))
    if redis_database != 10 or values["REDIS_HOST"] != HOST:
        raise RuntimeError("Unexpected Redis target; database enumeration is limited to the confirmed project database")
    redis_client = redis.Redis(host=values["REDIS_HOST"], port=int(values["REDIS_PORT"]),
                               password=values["REDIS_PASSWORD"], db=redis_database, socket_timeout=10)
    try:
        keyspace = redis_client.info("keyspace")
        prefixes = Counter()
        for key in redis_client.scan_iter(count=1000):
            prefix = key.decode("utf-8", "replace").split(":", 1)[0]
            prefixes[prefix if re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_{}.-]{0,63}", prefix) else "<unclassified>"] += 1
        result["redis"] = {"host": values["REDIS_HOST"], "port": int(values["REDIS_PORT"]), "database": redis_database,
                           "ping": redis_client.ping(), "keyspace": keyspace, "scannedKeyPrefixes": dict(prefixes)}
    finally:
        redis_client.close()
    parsed = urlsplit(values["DB_URL"].removeprefix("jdbc:"))
    if parsed.hostname != HOST or parsed.path != "/cloud_flow_db":
        raise RuntimeError("Unexpected current database target")
    with pymysql.connect(host=parsed.hostname, port=parsed.port or 3306, user=values["DB_USERNAME"], password=values["DB_PASSWORD"],
                         database="cloud_flow_db", charset="utf8mb4", autocommit=True, connect_timeout=15, read_timeout=30) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT VERSION(), DATABASE(), @@read_only")
            version, database, read_only = cursor.fetchone()
            cursor.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")
            tables = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE()")
            columns = cursor.fetchone()[0]
            result["database"] = {"host": parsed.hostname, "port": parsed.port or 3306, "name": database,
                                  "version": version, "readOnlySetting": read_only, "tables": tables, "columns": columns}
    # Authenticate only to perform GETs; do not create namespaces or publish configurations.
    session = requests.Session()
    session.trust_env = False
    common = flatten(configs["cloudflow-common"])
    namespaces = {values.get("NACOS_NAMESPACE"), values.get("SPRING_CLOUD_NACOS_CONFIG_NAMESPACE"),
                  values.get("SPRING_CLOUD_NACOS_DISCOVERY_NAMESPACE")}
    for key, value in common.items():
        if "nacos" in key and key.endswith("namespace") and isinstance(value, str):
            match = re.fullmatch(r"\$\{([^:}]+)(?::([^}]*))?}", value)
            namespaces.add(values.get(match.group(1), match.group(2)) if match else value)
    namespaces.discard(None)
    namespaces.discard("")
    address = values.get("NACOS_SERVER_ADDR", values.get("NACOS_SERVER", HOST + ":8848"))
    base = (address if address.startswith("http") else "http://" + address) + "/nacos/v1"
    response = session.post(base + "/auth/login", data={"username": values["NACOS_USERNAME"], "password": values["NACOS_PASSWORD"]}, timeout=15)
    response.raise_for_status()
    token = response.json()["accessToken"]
    result["nacos"] = {"address": address, "namespaces": sorted(namespaces), "configs": [], "registrations": []}
    for namespace in sorted(namespaces):
        for module in ["cloudflow-common", *MODULES.values()]:
            for suffix in (".yaml", "-prod.yaml"):
                data_id = module + suffix
                response = session.get(base + "/cs/configs", params={"accessToken": token, "tenant": namespace,
                        "group": "DEFAULT_GROUP", "dataId": data_id}, timeout=15)
                result["nacos"]["configs"].append({"namespace": namespace, "dataId": data_id, "status": response.status_code,
                         "sha256": hashlib.sha256(response.content).hexdigest() if response.status_code == 200 else None})
            response = session.get(base + "/ns/instance/list", params={"accessToken": token, "namespaceId": namespace,
                        "serviceName": module, "healthyOnly": "true"}, timeout=15)
            response.raise_for_status()
            result["nacos"]["registrations"].append({"namespace": namespace, "service": module,
                    "hosts": [{key: host.get(key) for key in ("ip", "port", "healthy", "enabled")} for host in response.json().get("hosts", [])]})
    return result


def compact(result):
    for properties in result["units"].values():
        properties.pop("environmentKeys", None)
        properties.pop("unitConfiguration", None)
    result["health"] = {name: {"status": health.get("status"), "components": {
        key: value.get("status") for key, value in health.get("components", {}).items()}}
        for name, health in result["health"].items()}
    result["nacos"]["configStatuses"] = dict(Counter(str(item["status"]) for item in result["nacos"].pop("configs")))
    return result


if __name__ == "__main__":
    client = connect_ssh()
    try:
        print(json.dumps(compact(inspect(client)), ensure_ascii=False, indent=2))
    except Exception as failure:
        # Exception class only: connector errors may contain credentials or response URLs.
        print("Native server inspection failed: " + type(failure).__name__, file=sys.stderr)
        raise SystemExit(1)
    finally:
        client.close()
