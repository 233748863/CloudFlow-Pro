"""Run the development server as six java -jar systemd services and host Nginx.

Reuse the installed database, verified runtime files and existing secret values.
Never change shared infrastructure or the system Java alternative.
"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shlex
import time
import zipfile

import paramiko
import requests


spec = importlib.util.spec_from_file_location("cloudflow_deployment", Path(__file__).with_name("deploy-server-runtime.py"))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
STATE = base.LOCAL / "native-deployment.json"
JARS = base.LOCAL / "native-jars"
REMOTE = base.REMOTE
JAVA = "/usr/lib/jvm/jre-17/bin/java"
NGINX = "/opt/gitlab/embedded/sbin/nginx"
UNITS = ["cloudflow-" + name for name in base.SERVICES] + ["cloudflow-frontend"]


def save(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def remote_python(client, source):
    return base.run(client, "python3 -c " + shlex.quote(source))


def put_text(sftp, path, value, mode=0o640):
    with sftp.file(path, "w") as stream:
        stream.write(value.encode("utf-8"))
    sftp.chmod(path, mode)


def manifest_line(name, value):
    raw = (name + ": " + value).encode("ascii")
    lines = [raw[:70]]
    raw = raw[70:]
    while raw:
        lines.append(b" " + raw[:69])
        raw = raw[69:]
    return b"\r\n".join(lines) + b"\r\n"


def prepare(client):
    if STATE.exists():
        raise RuntimeError("Native staging already exists; use switch/verify for the recorded stage")
    previous = json.loads((base.LOCAL / "deployment.json").read_text(encoding="utf-8"))
    if previous["status"] != "VERIFIED":
        raise RuntimeError("Verified source deployment required")
    base.run(client, "test -x " + JAVA + " && test -x " + NGINX + " && test ! -e /data/cloudflow/native")
    base.run(client, JAVA + " -version")
    sftp = client.open_sftp()
    try:
        with sftp.file(REMOTE + "/runtime-compose.json") as stream:
            compose = json.loads(stream.read().decode("utf-8"))
        with sftp.file(REMOTE + "/runtime.env") as stream:
            values = dict(line.split("=", 1) for line in stream.read().decode("utf-8").splitlines() if "=" in line)
        # Keep every existing cryptographic key and password; change only host runtime settings.
        values.update({"CLOUDFLOW_JOB_AUTH_URL": f"http://{base.HOST}:19001", "SPRING_CLOUD_NACOS_DISCOVERY_IP": base.HOST})
        values.pop("SPRING_CONFIG_ADDITIONAL_LOCATION", None)
        env = "".join(key + '=\"' + value.replace("\\", "\\\\").replace('"', '\\"') + '\"\n' for key, value in values.items())
        base.run(client, "getent passwd cloudflow >/dev/null || useradd --system --home-dir /data/cloudflow --shell /sbin/nologin cloudflow")
        base.run(client, f"mkdir -p {REMOTE}/native/staging {REMOTE}/native/nginx {REMOTE}/data/logs/nginx {REMOTE}/uploads && chown root:cloudflow {REMOTE} && chmod 750 {REMOTE} && chown -R cloudflow:cloudflow {REMOTE}/data {REMOTE}/uploads {REMOTE}/native/nginx")
        # File storage uses cloudflow.profile, independently of cloudflow.file-upload.path.
        base.run(client, f"install -d -o cloudflow -g cloudflow -m 750 {REMOTE}/profile {REMOTE}/profile/upload")
        # HR uses user.home for local PDFs; Nacos also writes its naming cache there.
        base.run(client, "install -d -o cloudflow -g cloudflow -m 750 " + " ".join(
            REMOTE + suffix for suffix in ("/.cloudflow", "/.cloudflow/hr", "/.cloudflow/hr/files",
                "/nacos", "/nacos/naming", "/nacos/naming/" + base.NAMESPACE)))
        put_text(sftp, REMOTE + "/native.env", env, 0o600)
        JARS.mkdir(parents=True, exist_ok=True)
        manifests = {}
        for index, (name, (module, main, _, _)) in enumerate(base.SERVICES.items()):
            service = compose["services"][name]
            command = service["command"]
            classpath = command[command.index("-cp") + 1].split(":")
            dependencies = [item.removeprefix("/app/") for item in classpath[1:]]
            if any(not item.startswith("lib/") or ".." in item.split("/") for item in dependencies):
                raise RuntimeError("Unexpected dependency path")
            source = base.ROOT / "cloudflow-backend" / module / "target" / (module + "-1.0.0.jar")
            remote_jar = REMOTE + "/runtime/apps/" + name + "/app.jar"
            if base.run(client, "sha256sum " + remote_jar).split()[0] != base.digest(source):
                raise RuntimeError("Source JAR differs from the verified deployed JAR: " + name)
            manifest = manifest_line("Manifest-Version", "1.0") + manifest_line("Main-Class", main) + manifest_line("Class-Path", " ".join("../../" + item for item in dependencies)) + b"\r\n"
            target = JARS / (name + ".jar")
            with zipfile.ZipFile(source) as source_zip, zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as target_zip:
                if main.replace(".", "/") + ".class" not in source_zip.namelist():
                    raise RuntimeError("Application entry class absent")
                target_zip.writestr("META-INF/MANIFEST.MF", manifest)
                for entry in source_zip.infolist():
                    if entry.filename.upper() != "META-INF/MANIFEST.MF":
                        target_zip.writestr(entry, source_zip.read(entry.filename))
            staged = REMOTE + "/native/staging/" + name + ".jar"
            sftp.put(str(target), staged)
            if base.run(client, "sha256sum " + staged).split()[0] != base.digest(target):
                raise RuntimeError("Native JAR upload mismatch")
            manifests[name] = {"sha256": base.digest(target), "bytes": target.stat().st_size, "port": 19000 + index, "healthPort": 19100 + index}
            working = REMOTE + "/native/" + name
            base.run(client, f"mkdir -p {working} && ln -s {REMOTE}/data/logs/{name} {working}/logs && chown cloudflow:cloudflow {working}")
            unit = f"""[Unit]
Description=CloudFlow development {name} (java -jar)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cloudflow
Group=cloudflow
WorkingDirectory={working}
EnvironmentFile={REMOTE}/native.env
Environment=SERVER_ADDRESS={base.HOST}
Environment=SERVER_PORT={19000 + index}
Environment=MANAGEMENT_SERVER_ADDRESS=127.0.0.1
Environment=MANAGEMENT_SERVER_PORT={19100 + index}
Environment=SPRING_CONFIG_ADDITIONAL_LOCATION=optional:file:{REMOTE}/runtime/config/cloudflow-common.yaml,optional:file:{REMOTE}/runtime/config/{module}.yaml
ExecStart={JAVA} -Xms128m -Xmx768m -Dfile.encoding=UTF-8 -Duser.timezone=Asia/Shanghai -jar {remote_jar}
Restart=on-failure
RestartSec=10
TimeoutStopSec=45
SuccessExitStatus=143
UMask=0027
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
"""
            put_text(sftp, REMOTE + "/native/staging/cloudflow-" + name + ".service", unit)
        nginx = (base.ROOT / "docker/frontend/nginx.conf").read_text(encoding="utf-8-sig")
        start = nginx.index("server {", nginx.index("server {") + 1)
        nginx = nginx[:nginx.index("server {")] + nginx[start:]
        nginx = nginx.replace("listen 443 ssl;", f"listen {base.HOST}:18080;").replace("http2 on;", "")
        nginx = nginx.replace("http://gateway:9000", f"http://{base.HOST}:19000")
        nginx = nginx.replace("/usr/share/nginx/html", REMOTE + "/runtime/frontend").replace("/var/log/nginx", REMOTE + "/data/logs/nginx")
        nginx = "\n".join(line for line in nginx.splitlines() if not line.strip().startswith("ssl_") and "Strict-Transport-Security" not in line)
        nginx = f"worker_processes 1;\npid {REMOTE}/native/nginx/nginx.pid;\nerror_log {REMOTE}/data/logs/nginx/error.log warn;\nevents {{ worker_connections 1024; }}\nhttp {{\ninclude /opt/gitlab/embedded/conf/mime.types;\ndefault_type application/octet-stream;\n" + nginx + "\n}\n"
        put_text(sftp, REMOTE + "/native/nginx/nginx.conf", nginx, 0o644)
        frontend_unit = f"""[Unit]
Description=CloudFlow development frontend (host Nginx)
After=network-online.target cloudflow-gateway.service
Wants=network-online.target

[Service]
Type=simple
User=cloudflow
Group=cloudflow
ExecStartPre={NGINX} -t -p {REMOTE}/native/nginx/ -c nginx.conf
ExecStart={NGINX} -p {REMOTE}/native/nginx/ -c nginx.conf -g "daemon off;"
ExecReload=/bin/kill -HUP $MAINPID
KillSignal=SIGQUIT
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
"""
        put_text(sftp, REMOTE + "/native/staging/cloudflow-frontend.service", frontend_unit)
        base.run(client, f"runuser -u cloudflow -- {NGINX} -t -p {REMOTE}/native/nginx/ -c nginx.conf")
        base.run(client, f"systemd-analyze verify {REMOTE}/native/staging/cloudflow-*.service")
        save({"status": "PREPARED", "mode": "JAVA_JAR_SYSTEMD", "target": base.HOST, "entry": previous["entry"], "baseline": previous["baseline"], "jars": manifests, "preparedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
        print("NATIVE_PREPARED six_executable_jars=true; nginx_config=valid; existing_keys=preserved", flush=True)
    finally:
        sftp.close()


def switch(client):
    state = json.loads(STATE.read_text(encoding="utf-8"))
    if state["status"] != "PREPARED":
        raise RuntimeError("Expected PREPARED native deployment")
    # Stop only this project's containers; preserve them until native verification passes.
    base.run(client, f"cd {REMOTE} && docker-compose -p cloudflow -f runtime-compose.json stop", timeout=180)
    for name in base.SERVICES:
        base.run(client, f"install -m 644 {REMOTE}/native/staging/{name}.jar {REMOTE}/runtime/apps/{name}/app.jar")
    for unit in UNITS:
        base.run(client, f"test ! -e /etc/systemd/system/{unit}.service && install -m 644 {REMOTE}/native/staging/{unit}.service /etc/systemd/system/{unit}.service")
    base.run(client, "systemctl daemon-reload && systemctl enable --now " + " ".join(UNITS), timeout=60)
    # The former Docker-published ports bypassed firewalld; permit the same host endpoints.
    firewall = base.run(client, "if systemctl is-active --quiet firewalld; then firewall-cmd --get-default-zone; else echo inactive; fi")
    if firewall != "inactive":
        zone = shlex.quote(firewall.splitlines()[-1])
        for port in [18080, 19000]:
            base.run(client, f"firewall-cmd --zone={zone} --add-port={port}/tcp && firewall-cmd --permanent --zone={zone} --add-port={port}/tcp")
    state.update({"status": "STARTING", "switchedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    save(state)
    print("NATIVE_STARTED backend=java_-jar; frontend=host_nginx", flush=True)


def verify(client):
    state = json.loads(STATE.read_text(encoding="utf-8"))
    health = {}
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        health = {}
        for name, item in state["jars"].items():
            result = base.run(client, f"curl -sS --max-time 2 http://127.0.0.1:{item['healthPort']}/actuator/health 2>/dev/null || true")
            try:
                health[name] = json.loads(result).get("status")
            except (ValueError, TypeError):
                health[name] = "STARTING"
        if all(value == "UP" for value in health.values()):
            break
        print("NATIVE_HEALTH " + json.dumps(health), flush=True)
        time.sleep(5)
    if not all(value == "UP" for value in health.values()):
        raise RuntimeError("Native startup incomplete: " + json.dumps(health))
    units = {}
    for unit in UNITS:
        props = dict(line.split("=", 1) for line in base.run(client, f"systemctl show {unit} -p ActiveState -p SubState -p MainPID -p NRestarts -p UnitFileState").splitlines())
        if props["ActiveState"] != "active" or props["SubState"] != "running" or props["UnitFileState"] != "enabled":
            raise RuntimeError("Native unit not active and enabled: " + unit)
        pid = int(props["MainPID"])
        command = base.run(client, f"tr '\\000' ' ' < /proc/{pid}/cmdline")
        if unit != "cloudflow-frontend" and " -jar /data/cloudflow/runtime/apps/" not in command:
            raise RuntimeError("Expected actual java -jar process: " + unit)
        units[unit] = {"pid": pid, "state": props["SubState"], "restarts": int(props["NRestarts"])}
    session = requests.Session()
    session.trust_env = False
    entry = state["entry"]
    response = session.get(entry, timeout=20)
    response.raise_for_status()
    if '<div id="root"' not in response.text:
        raise RuntimeError("Frontend application shell missing")
    assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', response.text)
    if not assets:
        raise RuntimeError("Frontend assets missing")
    response = session.get(entry + assets[0], timeout=20)
    response.raise_for_status()
    checks = {"frontend": 200, "staticAsset": response.status_code}
    for name, path in {"tenantDatabaseRead": "/api/auth/tenant/options", "captchaRedisWrite": "/api/auth/captcha/slider"}.items():
        response = session.get(entry + path, timeout=20)
        response.raise_for_status()
        result = response.json()
        if result.get("code") != 200 or result.get("data") is None:
            raise RuntimeError("Native public startup check failed: " + name)
        checks[name] = response.status_code
    sftp = client.open_sftp()
    try:
        with sftp.file(REMOTE + "/native.env") as stream:
            values = {key: shlex.split(value)[0] for key, value in (line.split("=", 1) for line in stream.read().decode("utf-8").splitlines() if "=" in line)}
    finally:
        sftp.close()
    nacos = f"http://{base.HOST}:8848/nacos/v1"
    response = session.post(nacos + "/auth/login", data={"username": values["NACOS_USERNAME"], "password": values["NACOS_PASSWORD"]}, timeout=15)
    response.raise_for_status()
    token = response.json()["accessToken"]
    registered = {}
    for name, (module, _, _, _) in base.SERVICES.items():
        response = session.get(nacos + "/ns/instance/list", params={"accessToken": token, "namespaceId": base.NAMESPACE, "serviceName": module, "healthyOnly": "true"}, timeout=15)
        response.raise_for_status()
        hosts = response.json().get("hosts", [])
        expected = state["jars"][name]["port"]
        if len(hosts) != 1 or not hosts[0].get("healthy") or hosts[0]["ip"] != base.HOST or hosts[0]["port"] != expected:
            raise RuntimeError("Expected one healthy native instance: " + module)
        registered[module] = {"ip": base.HOST, "port": expected}
    others = base.inventory(client)
    if any(others.get(name, {}).get("id") != item["id"] or others[name]["status"] != item["status"] for name, item in state["baseline"].items()):
        raise RuntimeError("An existing non-project container changed")
    state.update({"status": "VERIFIED", "health": health, "units": units, "startupChecks": checks, "registeredServices": registered, "existingContainersUnchanged": True, "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z")})
    save(state)
    print(json.dumps({"nativeVerified": True, "entry": entry, "units": units, "checks": checks, "registeredServices": registered}, ensure_ascii=False), flush=True)


def finalize(client):
    """Remove only the superseded project containers and migration staging."""
    state = json.loads(STATE.read_text(encoding="utf-8"))
    if state["status"] != "VERIFIED":
        raise RuntimeError("Native verification must pass before cleanup")
    if state.get("cleanup"):
        print("NATIVE_ALREADY_FINALIZED", flush=True)
        return
    source = '''import hashlib,json,os,pathlib,shlex,shutil,subprocess
r=pathlib.Path('/data/cloudflow')
assert r.resolve()==r and not r.is_symlink()
old=dict(line.split('=',1) for line in (r/'runtime.env').read_text().splitlines() if '=' in line)
new=dict((key,shlex.split(value)[0]) for key,value in (line.split('=',1) for line in (r/'native.env').read_text().splitlines() if '=' in line))
changed={'CLOUDFLOW_JOB_AUTH_URL','SPRING_CONFIG_ADDITIONAL_LOCATION'}
assert all(new.get(key)==value for key,value in old.items() if key not in changed), 'Existing secret or setting changed'
units=UNITS_JSON
for unit in units:
    props=dict(line.split('=',1) for line in subprocess.check_output(['systemctl','show',unit,'-p','ActiveState','-p','SubState']).decode().splitlines())
    assert props=={'ActiveState':'active','SubState':'running'}, 'Native service no longer running'
    text=pathlib.Path('/etc/systemd/system/'+unit+'.service').read_text()
    assert 'EnvironmentFile=/data/cloudflow/runtime.env' not in text
    assert '/native/staging' not in text
jars=JARS_JSON
m=r/'runtime/manifest.json'
manifest=json.loads(m.read_text())
for name,expected in jars.items():
    key='apps/'+name+'/app.jar'
    app=r/'runtime'/key
    assert app.stat().st_size==expected['bytes'] and hashlib.sha256(app.read_bytes()).hexdigest()==expected['sha256']
    manifest[key]={'sha256':expected['sha256'],'bytes':expected['bytes']}
temporary=m.with_suffix('.json.tmp')
temporary.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
temporary.chmod(m.stat().st_mode & 0o777)
temporary.replace(m)
targets=[r/'native/staging',r/'runtime-compose.json',r/'nginx.conf',r/'runtime.env']
files=[]
for target in targets:
    assert target.exists() and not target.is_symlink()
    assert str(target.resolve()).startswith(str(r)+'/')
    assert all(not p.is_symlink() for p in target.parents)
    children=list(target.rglob('*')) if target.is_dir() else [target]
    assert all(not p.is_symlink() for p in children)
    files.extend(p for p in children if p.is_file())
ancestors={os.getpid()}
parent=os.getppid()
while parent>1 and parent not in ancestors:
    ancestors.add(parent)
    status=pathlib.Path('/proc/'+str(parent)+'/status').read_text()
    parent=int(next(line.split()[1] for line in status.splitlines() if line.startswith('PPid:')))
for proc in pathlib.Path('/proc').glob('[0-9]*'):
    try:
        command=(proc/'cmdline').read_bytes().replace(b'\\0',b' ').decode('utf-8','replace')
        # The cleanup interpreter contains literal paths, but does not use them as runtime files.
        if int(proc.name) not in ancestors:
            assert all(str(target) not in command for target in targets), 'Active command references cleanup target'
        for ref in [proc/'cwd',proc/'exe']+list((proc/'fd').glob('*')):
            try: resolved=str(ref.resolve(strict=True))
            except (OSError,RuntimeError): continue
            assert all(resolved!=str(t) and not resolved.startswith(str(t)+'/') for t in targets), 'Open file references cleanup target'
    except (FileNotFoundError,PermissionError,ProcessLookupError): continue
containers=json.loads(subprocess.check_output(['docker','inspect']+units))
assert len(containers)==7
for item in containers:
    assert item['Name'].lstrip('/') in units
    assert item['Config']['Labels'].get('cloudflow.owner')=='CloudFlowPro'
    assert item['Config']['Labels'].get('cloudflow.release')=='20261018'
    assert item['State']['Status']=='exited' and not item['State']['Running']
network=json.loads(subprocess.check_output(['docker','network','inspect','cloudflow-runtime']))[0]
assert network['Labels'].get('cloudflow.owner')=='CloudFlowPro'
assert not network.get('Containers')
before=shutil.disk_usage(str(r)).free
sizes=sum(p.stat().st_size for p in files)
subprocess.check_output(['docker','rm']+[item['Id'] for item in containers])
subprocess.check_output(['docker','network','rm',network['Id']])
for target in targets:
    if target.is_dir(): shutil.rmtree(str(target))
    else: target.unlink()
assert all(not t.exists() for t in targets)
print(json.dumps({'removedContainers':len(containers),'removedNetwork':'cloudflow-runtime','removedPaths':[str(t) for t in targets],'files':len(files),'logicalBytes':sizes,'diskFreeBefore':before,'diskFreeAfter':shutil.disk_usage(str(r)).free,'manifestJarsUpdated':len(jars),'existingSecretsPreserved':True}))
'''.replace("UNITS_JSON", repr(UNITS)).replace("JARS_JSON", repr(state["jars"]))
    result = json.loads(remote_python(client, source))
    others = base.inventory(client)
    if any(others.get(name, {}).get("id") != item["id"] or others[name]["status"] != item["status"] for name, item in state["baseline"].items()):
        raise RuntimeError("An existing non-project container changed during cleanup")
    result["existingContainersUnchanged"] = True
    result["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    state["cleanup"] = result
    save(state)
    previous_path = base.LOCAL / "deployment.json"
    previous = json.loads(previous_path.read_text(encoding="utf-8"))
    previous.update({"status": "SUPERSEDED_BY_NATIVE", "supersededBy": STATE.name, "supersededAt": result["completedAt"]})
    previous_path.write_text(json.dumps(previous, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["prepare", "switch", "verify", "finalize"], required=True)
    arguments = parser.parse_args()
    client = paramiko.SSHClient()

    class VerifiedHost(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, ssh, hostname, key):
            if key.get_fingerprint().hex() != base.HOST_FINGERPRINT:
                raise RuntimeError("Server SSH host key changed")

    client.set_missing_host_key_policy(VerifiedHost())
    try:
        client.connect(base.HOST, username="root", password=os.environ["CLOUDFLOW_SERVER_SSH_PASSWORD"], timeout=15, allow_agent=False, look_for_keys=False)
        {"prepare": prepare, "switch": switch, "verify": verify, "finalize": finalize}[arguments.phase](client)
    finally:
        client.close()


if __name__ == "__main__":
    main()
