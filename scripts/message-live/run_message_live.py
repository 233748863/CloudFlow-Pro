"""Owned A2 process/Redis/WebSocket acceptance; no package or source copies."""
import base64
import concurrent.futures
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import uuid

import psutil
import requests
import redis
import websocket
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / 'cloudflow-backend'
BASE = ROOT / '.cloudflow-runtime/batch-g-integration'
REFERENCE = BASE / '9799534e1a3a47b5958330f14ae16dc7'
DOCUMENT = ROOT / 'docs/design/A2-全项验收映射-20261016.md'
ROUND = sys.argv[1]
SCOPE = sys.argv[2] if len(sys.argv) > 2 else 'transport'
if SCOPE not in ('transport', 'http'):
    raise ValueError('Unknown acceptance scope')
if not re.fullmatch(r'r[1-9][0-9]*', ROUND):
    raise ValueError('Explicit round required')
RUN = BASE / uuid.uuid4().hex
RUN.mkdir()
(RUN / 'private').mkdir()
PROCESSES = {}
HANDLES = []
CHECKS = []
INPUTS = {}
PORTS = set()
MYSQL = shutil.which('mysql.exe')
JAVA = shutil.which('java.exe')
JAVAC = shutil.which('javac.exe')
JCMD = shutil.which('jcmd.exe')
if JCMD:
    JAVA = str(Path(JCMD).with_name('java.exe'))
    JAVAC = str(Path(JCMD).with_name('javac.exe'))
DB_PORT = 0
SERVICES = {}
SESSION = requests.Session()
SESSION.trust_env = False
REDIS = None
NOTICES = []
RECEIVED_TITLES = []


def digest(path):
    with open(path, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def freeze(path):
    INPUTS[str(path)] = digest(path)


def reference_state():
    state = json.loads((REFERENCE / 'state.json').read_text(encoding='utf-8-sig'))
    identities = []
    for entry in state['processes']:
        try:
            process = psutil.Process(entry['id'])
            command = ' '.join(process.cmdline())
        except psutil.NoSuchProcess:
            if entry['name'] == 'smtp-fixture':
                continue
            raise
        if entry['marker'].lower() not in command.lower():
            # The optional Java fixture has exited; Windows may reuse its PID.
            if entry['name'] == 'smtp-fixture' and process.name().lower() not in ('java.exe', 'javaw.exe'):
                continue
            raise RuntimeError('Reference identity mismatch')
        identities.append((entry['id'], process.create_time()))
    return digest(REFERENCE / 'state.json'), identities


REFERENCE_PROOF = reference_state()


def check(condition, name):
    if not condition:
        raise AssertionError(name)
    CHECKS.append(name)
    print('PASS ' + name, flush=True)


def port():
    while True:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            value = listener.getsockname()[1]
        if value not in PORTS:
            PORTS.add(value)
            return value


def execute(arguments, timeout=120, cwd=RUN):
    result = subprocess.run([str(arg) for arg in arguments], cwd=cwd, capture_output=True,
                            encoding='utf-8', errors='replace', timeout=timeout,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        (RUN / 'step-failure.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        raise RuntimeError('Owned step failed: ' + Path(arguments[0]).name)
    return result.stdout.strip()


def sql(statement):
    result = subprocess.run([MYSQL, '--no-defaults', '--protocol=TCP', '--host=127.0.0.1',
                             '--port=' + str(DB_PORT), '--user=root', '--default-character-set=utf8mb4',
                             '--batch', '--skip-column-names'], input=statement, capture_output=True,
                            encoding='utf-8', errors='replace', timeout=90,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        (RUN / 'sql-failure.log').write_text(result.stderr, encoding='utf-8')
        raise RuntimeError('Owned SQL failed')
    return result.stdout.strip()


def start(name, arguments, cwd=RUN):
    output = open(RUN / (name + '.stdout.log'), 'a', encoding='utf-8')
    error = open(RUN / (name + '.stderr.log'), 'a', encoding='utf-8')
    HANDLES.extend([output, error])
    process = subprocess.Popen([str(arg) for arg in arguments], cwd=cwd, stdout=output, stderr=error,
                               creationflags=subprocess.CREATE_NO_WINDOW)
    PROCESSES[name] = process
    return process


def stop(name):
    process = PROCESSES.get(name)
    if process is None or process.poll() is not None:
        return
    actual = psutil.Process(process.pid)
    command = ' '.join(actual.cmdline()).replace('\\', '/').lower()
    owned_redis = name == 'redis' and ('redis-' + RUN.name + '.conf') in command
    if str(RUN).replace('\\', '/').lower() not in command and not owned_redis:
        raise RuntimeError('Owned process identity changed')
    children = actual.children(recursive=True)
    for child in children:
        child.kill()
    actual.kill()
    process.wait(timeout=20)
    psutil.wait_procs(children, timeout=10)


def wait_for(predicate, seconds, description):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except ChildProcessError:
            raise
        except (requests.RequestException, OSError, RuntimeError):
            pass
        time.sleep(.4)
    raise TimeoutError(description)


def classpath(module, file):
    entries = [BACKEND / module / 'target/classes']
    entries += sorted((BACKEND / 'cloudflow-common').glob('*/target/classes'))
    manifest = BACKEND / module / 'target' / file
    freeze(manifest)
    dependencies = manifest.read_text(encoding='utf-8-sig').strip().split(';')
    for value in dependencies:
        value = value.replace('C:\\Users\\Administrator\\.m2', 'D:\\CloudFlowProCache\\m2')
        if '/com/cloudflow/' in value.replace('\\', '/'):
            continue
        dependency = Path(value)
        if not dependency.is_file():
            raise RuntimeError('Dependency missing: ' + dependency.name)
        entries.append(dependency)
    for entry in entries:
        if entry.is_dir():
            for source in entry.rglob('*'):
                if source.is_file():
                    freeze(source)
        else:
            freeze(entry)
    return ';'.join(str(entry).replace('\\', '/') for entry in dict.fromkeys(entries))


def java_args(name, arguments):
    path = RUN / (name + '.args')
    path.write_text('\n'.join('"' + str(arg).replace('\\', '/') + '"' for arg in arguments), encoding='utf-8')
    return '@' + str(path)


def service(name):
    start(name, [JAVA, SERVICES[name]['args']])
    health = SERVICES[name]['health']
    started_at = time.monotonic()
    captured = False
    def ready():
        nonlocal captured
        if PROCESSES[name].poll() is not None:
            raise ChildProcessError(name + ' exited before readiness; see owned service log')
        if not captured and time.monotonic() - started_at > 65:
            captured = True
            try:
                if not JCMD:
                    raise RuntimeError('jcmd.exe not available on PATH')
                dump = execute([JCMD, str(PROCESSES[name].pid), 'Thread.print'], timeout=15)
            except Exception as error:
                dump = type(error).__name__ + ': ' + str(error)
            (RUN / (name + '.threads.log')).write_text(dump, encoding='utf-8')
        response = SESSION.get('http://127.0.0.1:' + str(health) + '/actuator/health', timeout=2)
        (RUN / (name + '.health.json')).write_text(response.text, encoding='utf-8')
        return response.status_code == 200
    wait_for(ready, 180, name + ' readiness timeout')


def api(base, path, body=None):
    response = SESSION.get(base + path, timeout=15) if body is None else SESSION.post(base + path, json=body, timeout=15)
    response.raise_for_status()
    data = response.json()
    if data.get('code') != 200:
        raise RuntimeError('Business response rejected: ' + path + '; ' + str(data.get('msg')))
    return data.get('data')


def login(base, account, allow_force_password_change=False):
    for attempt in range(3):
        challenge = api(base, '/captcha/slider')
        def pixels(source):
            return Image.open(io.BytesIO(base64.b64decode(source.split(',')[-1]))).convert('RGBA')
        background, slider = pixels(challenge['bgImage']), pixels(challenge['sliderImage'])
        edges = []
        for y in range(4, slider.height - 4, 2):
            for x in range(4, slider.width - 4, 2):
                if slider.getpixel((x, y))[3] < 240:
                    continue
                for dx, dy in [(4, 0), (-4, 0), (0, 4), (0, -4)]:
                    if slider.getpixel((x + dx, y + dy))[3] < 30:
                        edges.append((x, y, x + dx, y + dy))
        def luminance(x, y):
            r, g, b, _ = background.getpixel((x, y))
            return r * .2126 + g * .7152 + b * .0722
        scores = [(sum(luminance(p + x, challenge['y'] + y) - luminance(p + dx, challenge['y'] + dy)
                       for x, y, dx, dy in edges), p)
                  for p in range(slider.width, background.width - slider.width)]
        try:
            passed = api(base, '/captcha/check', {'uuid': challenge['uuid'], 'x': max(scores)[1]})
            break
        except RuntimeError:
            if attempt == 2:
                raise
            time.sleep(1.1)
    release = api(base, '/legal/public/active?tenantCode=' + account['tenantCode'])
    data = api(base, '/login', {**{key: account[key] for key in ['tenantCode', 'username', 'password']},
                              'captchaToken': passed['passToken'], 'legalReleaseCode': release['releaseCode']})
    token = data.get('token') or SESSION.cookies.get('Authorization')
    if not token or (data.get('forcePasswordChange') and not allow_force_password_change):
        raise RuntimeError('Fresh account login not ready')
    return token


def sdk(mode, count, prefix):
    arguments = ['-Dfile.encoding=UTF-8', '-cp', str(RUN / 'classes') + ';' + AUTH_CP,
                 'com.cloudflow.checks.MessageSdkProbe', RUN, mode, str(count), prefix]
    execute([JAVA, java_args('probe-' + mode + '-' + prefix, arguments)])


def event_id(title):
    identity = ('cloudflow-a2-probe:100000:' + title).encode('utf-8')
    return str(uuid.UUID(bytes=hashlib.md5(identity).digest(), version=3))


def records(prefix):
    return sql("SELECT CONCAT(COUNT(*),':',COALESCE(SUM(send_status='SUCCESS'),0)) FROM cloud_flow_db.sys_message_record "
               "WHERE title LIKE '" + prefix + "-%';")


def receive_titles(connection, prefix, count):
    titles = []
    deadline = time.monotonic() + 35
    connection.settimeout(1)
    while time.monotonic() < deadline and len(titles) < count:
        try:
            message = json.loads(connection.recv())
        except websocket.WebSocketTimeoutException:
            continue
        if message.get('type') == 'NOTICE':
            notice = message.get('data', {})
            title = notice.get('noticeTitle', '')
            RECEIVED_TITLES.append(title)
            if title.startswith(prefix + '-'):
                titles.append(title)
                NOTICES.append({'title': title, 'createTime': notice.get('createTime')})
                check(isinstance(notice.get('createTime'), str) and bool(notice['createTime']),
                      title + ' WebSocket createTime serialized as text')
    check(len(titles) == count and len(set(titles)) == count, prefix + ' real WebSocket notices exactly once')
    return titles


def stream_message_counts(prefix, count):
    counts = {event_id(prefix + '-' + str(index)): 0 for index in range(count)}
    for _, fields in REDIS.xrange('cloudflow:event:stream'):
        raw = fields.get('payload')
        if raw is None:
            continue
        envelope = json.loads(raw)
        if isinstance(envelope, str):
            envelope = json.loads(envelope)
        if envelope.get('eventType') == 'MESSAGE_SEND' and envelope.get('eventId') in counts:
            counts[envelope['eventId']] += 1
    return counts


failure = None
connection = None
try:
    for path in [Path(__file__), ROOT / 'scripts/message-live/MessageSdkProbe.java',
                 ROOT / 'scripts/platform-checks/ImportIntegrationFixtures.java',
                 BACKEND / 'cloudflow-common/cloudflow-common-event/src/main/resources/mapper/OutboxEventMapper.xml']:
        freeze(path)
    AUTH_CP = classpath('cloudflow-auth', 'message-delivery-classpath.txt')
    WORKFLOW_CP = classpath('cloudflow-service-workflow', 'approved-runtime-classpath.txt')
    if SCOPE == 'http':
        import message_http_checks
        import message_business_checks
        freeze(Path(message_http_checks.__file__))
        freeze(Path(message_business_checks.__file__))
        freeze(Path(message_http_checks.message_system_checks.__file__))
        freeze(Path(message_http_checks.message_record_http_checks.__file__))
        freeze(Path(message_http_checks.message_record_browser_checks.__file__))
        freeze(Path(message_http_checks.message_center_browser_checks.__file__))
        freeze(Path(message_http_checks.message_subscribe_browser_checks.__file__))
        freeze(Path(message_http_checks.message_announcement_browser_checks.__file__))
        freeze(Path(message_http_checks.message_realtime_browser_checks.__file__))
        freeze(ROOT / 'cloudflow-frontend/scripts/check-message-realtime-live-browser.mjs')
        if os.environ.get('CLOUDFLOW_REALTIME_BROWSER') == '1':
            for source in (ROOT / 'cloudflow-frontend/src').rglob('*'):
                if source.is_file():
                    freeze(source)
            for name in ('index.html', 'package.json', 'package-lock.json', 'vite.config.ts'):
                freeze(ROOT / 'cloudflow-frontend' / name)
        freeze(ROOT / 'cloudflow-frontend/scripts/check-announcement-live-browser.mjs')
        freeze(ROOT / 'cloudflow-frontend/scripts/announcement-browser/fixture.tsx')
        freeze(ROOT / 'cloudflow-frontend/scripts/announcement-browser/index.html')
        freeze(ROOT / 'cloudflow-frontend/scripts/check-message-subscribe-live-browser.mjs')
        freeze(ROOT / 'cloudflow-frontend/scripts/message-subscribe-browser/fixture.tsx')
        freeze(ROOT / 'cloudflow-frontend/scripts/message-subscribe-browser/index.html')
        freeze(ROOT / 'cloudflow-frontend/scripts/check-message-center-live-browser.mjs')
        freeze(ROOT / 'cloudflow-frontend/scripts/message-center-browser/fixture.tsx')
        freeze(ROOT / 'cloudflow-frontend/scripts/message-center-browser/index.html')
        freeze(ROOT / 'cloudflow-frontend/scripts/check-message-record-live-browser.mjs')
        freeze(ROOT / 'cloudflow-frontend/scripts/message-record-browser/fixture.tsx')
        freeze(ROOT / 'cloudflow-frontend/scripts/message-record-browser/index.html')
        OA_CP = classpath('cloudflow-service-oa', 'approved-runtime-classpath.txt')
        HR_CP = classpath('cloudflow-service-hr', 'approved-runtime-classpath.txt')
        CRM_CP = classpath('cloudflow-service-crm', 'approved-runtime-classpath.txt')
    print('A2_LIVE_INPUTS: actual class/resource/jar inputs=' + str(len(INPUTS)), flush=True)
    print('A2_LIVE_RUN=' + str(RUN), flush=True)
    DB_PORT, redis_port = port(), port()
    data = RUN / 'mysql-data'
    mysqld = Path(MYSQL).with_name('mysqld.exe')
    execute([mysqld, '--no-defaults', '--initialize-insecure', '--datadir=' + str(data),
             '--innodb-buffer-pool-size=64M', '--log-error=' + str(RUN / 'mysql-init.log')])
    start('mysql', [mysqld, '--no-defaults', '--datadir=' + str(data), '--bind-address=127.0.0.1',
                    '--port=' + str(DB_PORT), '--mysqlx=OFF', '--skip-log-bin', '--innodb-buffer-pool-size=96M',
                    '--max-connections=65', '--log-error=' + str(RUN / 'mysql.log')])
    wait_for(lambda: sql('SELECT 1;') == '1', 40, 'MySQL readiness')
    check(Path(sql('SELECT @@datadir;')).resolve() == data.resolve(), 'owned MySQL datadir')
    scripts = sorted((BACKEND / 'DB').glob('0[1-6].*.sql'))
    check(len(scripts) == 6, 'six formal schema and seed scripts')
    expected = 0
    for script in scripts:
        freeze(script)
        content = script.read_text(encoding='utf-8-sig')
        expected += len(re.findall(r'^CREATE TABLE ', content, re.MULTILINE))
        sql(('USE cloud_flow_db;\n' if not script.name.startswith('01.') else '') + content)
    check(int(sql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db' AND table_type='BASE TABLE';")) == expected,
          'formal schema dynamic table count ' + str(expected))
    sql("USE cloud_flow_db; UPDATE sys_job SET status='PAUSED';")
    redis_secret = secrets.token_hex(24)
    config_name = 'redis-' + RUN.name + '.conf'
    (RUN / config_name).write_text('\n'.join(['bind 127.0.0.1', 'protected-mode yes', 'port ' + str(redis_port),
                                            'requirepass ' + redis_secret, 'appendonly no', 'save ""', 'logfile "redis.log"']), encoding='utf-8')
    redis_exe = ROOT / '.cloudflow-runtime/redis-8.10.1/bin/Redis-8.10.1-Windows-x64-msys2/redis-server.exe'
    start('redis', [redis_exe, config_name])
    wait_for(lambda: any(c.laddr.port == redis_port for c in psutil.Process(PROCESSES['redis'].pid).net_connections('tcp')), 15, 'Redis readiness')
    REDIS = redis.Redis(host='127.0.0.1', port=redis_port, password=redis_secret,
                        decode_responses=True, socket_timeout=5)
    check(REDIS.ping(), 'owned real Redis ready')
    redisson = RUN / 'private/redisson.json'
    redisson.write_text(json.dumps({'singleServerConfig': {'address': 'redis://127.0.0.1:' + str(redis_port),
                          'password': redis_secret, 'database': 0, 'connectionMinimumIdleSize': 1,
                          'connectionPoolSize': 64, 'subscriptionConnectionMinimumIdleSize': 1, 'subscriptionConnectionPoolSize': 50},
                          'threads': 4, 'nettyThreads': 4}), encoding='utf-8')
    jdbc = 'jdbc:mysql://127.0.0.1:' + str(DB_PORT) + '/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai'
    shared = {'cloudflow.file-storage.secret-key': secrets.token_hex(32), 'cloudflow.message.secret-key': secrets.token_hex(32),
              'cloudflow.encrypt.aes-key': secrets.token_hex(16),
              'cloudflow.auth.totp.enabled': 'true', 'cloudflow.auth.totp.encryption-key': secrets.token_hex(32)}
    keys = {name: base64.b64encode(secrets.token_bytes(32)).decode('ascii') for name in ['cloudflow-auth', 'cloudflow-service-hr', 'cloudflow-service-oa', 'cloudflow-service-crm', 'cloudflow-service-workflow']}
    for name in ['auth1', 'auth2', 'workflow'] + (['oa', 'hr', 'crm'] if SCOPE == 'http' else []):
        SERVICES[name] = {'port': port(), 'health': port()}
    for name in SERVICES:
        module = 'auth' if name.startswith('auth') else name
        properties = {}
        for line in (REFERENCE / module / 'integration.properties').read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.startswith('#'):
                key, value = line.split('=', 1)
                properties[key] = value.replace(str(REFERENCE).replace('\\', '/'), str(RUN).replace('\\', '/')).replace(str(REFERENCE), str(RUN))
        for key in list(properties):
            if key.startswith('spring.cloud.discovery.client.simple.instances.'):
                app = next((service_name for service_name in SERVICES
                            if ('cloudflow-' + ('service-' if service_name in ('workflow', 'oa', 'hr', 'crm') else '')
                                + ('auth' if service_name.startswith('auth') else service_name) + '[') in key), None)
                properties[key] = 'http://127.0.0.1:' + str(SERVICES[app]['port'] if app else 1)
            if key.startswith('cloudflow.job.internal-auth.keys.'):
                properties[key] = keys[key.split('keys.', 1)[1]]
        properties.update(shared)
        properties.update({'spring.datasource.url': jdbc, 'spring.datasource.dynamic.datasource.master.url': jdbc,
                           'DB_URL': jdbc, 'spring.datasource.username': 'root', 'spring.datasource.password': '',
                           'spring.datasource.dynamic.datasource.master.username': 'root',
                           'spring.datasource.dynamic.datasource.master.password': '', 'DB_USERNAME': 'root', 'DB_PASSWORD': '',
                           'spring.data.redis.host': '127.0.0.1', 'spring.data.redis.port': str(redis_port),
                           'spring.data.redis.password': redis_secret, 'REDIS_HOST': '127.0.0.1', 'REDIS_PORT': str(redis_port),
                           'REDIS_PASSWORD': redis_secret, 'spring.redis.redisson.file': redisson.as_uri(),
                           'server.address': '127.0.0.1', 'management.server.address': '127.0.0.1',
                           'server.port': str(SERVICES[name]['port']), 'management.server.port': str(SERVICES[name]['health']),
                           'management.endpoint.health.show-details': 'always',
                           'cloudflow.job.auth-url': 'http://127.0.0.1:' + str(SERVICES['auth1']['port']),
                           'cloudflow.portal.enabled': 'false', 'cloudflow.portal.public-url': 'http://127.0.0.1:1',
                           'spring.datasource.dynamic.hikari.min-idle': '1', 'spring.datasource.dynamic.hikari.max-pool-size': '5',
                           'cloudflow.outbox.scan-interval-ms': '3600000' if name in ('workflow', 'oa') else '800',
                           'cloudflow.outbox.batch-size': '7',
                           'cloudflow.outbox.owner': 'a2-' + name, 'cloudflow.codegen.enabled': 'false',
                           'cloudflow.workflow.callback.enabled': 'true' if name in ('oa', 'hr') else 'false'})
        if name == 'hr':
            properties.update({'cloudflow.workflow.callback.stream-key': 'workflow:stream:approval-callback:hr',
                               'cloudflow.workflow.callback.group': 'a2-hr-callback-' + RUN.name,
                               'cloudflow.workflow.callback.consumer-prefix': 'a2-hr-' + RUN.name[:12]})
        if name.startswith('auth') and SCOPE == 'http':
            # Only this disposable local HTTP environment trusts the loopback fixture proxy.
            properties['cloudflow.ratelimit.trusted-proxies[0]'] = '127.0.0.1/32'
        configuration = RUN / (name + '.properties')
        configuration.write_text('\n'.join(key + '=' + value for key, value in sorted(properties.items())), encoding='utf-8')
        text = configuration.read_text(encoding='utf-8')
        endpoints = re.findall(r'(?:https?://|jdbc:mysql://|redis://)([^/\s:]+):(\d+)', text)
        if (REFERENCE.name in text or re.search(r'(?:192\.168\.|10\.\d+\.\d+\.)', text)
                or any(host != '127.0.0.1' or int(number) not in PORTS | {1} for host, number in endpoints)):
            raise RuntimeError('Inherited external/reference configuration')
        main = {'auth': 'com.cloudflow.auth.AuthApplication', 'workflow': 'com.cloudflow.workflow.WorkflowApplication',
                'oa': 'com.cloudflow.oa.OaApplication', 'hr': 'com.cloudflow.hr.HrServiceApplication',
                'crm': 'com.cloudflow.crm.CrmApplication'}[module]
        service_cp = {'auth': AUTH_CP, 'workflow': WORKFLOW_CP}
        if SCOPE == 'http':
            service_cp.update({'oa': OA_CP, 'hr': HR_CP, 'crm': CRM_CP})
        SERVICES[name]['args'] = java_args(name, ['-Xms48m', '-Xmx320m', '-Dfile.encoding=UTF-8', '-Duser.timezone=Asia/Shanghai',
                                                  '-cp', service_cp[module], main,
                                                  '--spring.config.additional-location=' + configuration.as_uri(),
                                                  '--spring.cloud.nacos.config.enabled=false', '--spring.cloud.nacos.discovery.enabled=false',
                                                  '--spring.cloud.nacos.config.import-check.enabled=false'])
    (RUN / 'private/probe.json').write_text(json.dumps({'jdbcUrl': jdbc, 'messageSecret': shared['cloudflow.message.secret-key'],
                'mapper': str(BACKEND / 'cloudflow-common/cloudflow-common-event/src/main/resources/mapper/OutboxEventMapper.xml')}), encoding='utf-8')
    (RUN / 'classes').mkdir()
    execute([JAVAC, java_args('compile', ['-encoding', 'UTF-8', '-parameters', '-cp', AUTH_CP, '-d', RUN / 'classes',
                          ROOT / 'scripts/platform-checks/ImportIntegrationFixtures.java', ROOT / 'scripts/message-live/MessageSdkProbe.java'])])
    execute([JAVA, java_args('fixtures', ['-Dfile.encoding=UTF-8', '-cp', str(RUN / 'classes') + ';' + AUTH_CP,
                        'com.cloudflow.auth.storage.ImportIntegrationFixtures', jdbc, RUN])])
    if SCOPE == 'http':
        sql("INSERT INTO cloud_flow_db.hr_employee "
            "(id,tenant_id,employee_no,name,gender,dept_id,user_id,employee_status) VALUES "
            "(990000712,100000,'A2_OTHER_EMPLOYEE','A2 same tenant employee','MALE',100,990000702,'REGULAR'),"
            "(990000713,100001,'A2_TENANT_EMPLOYEE','A2 other tenant employee','MALE',990000101,990000703,'REGULAR');")
        check(True, 'owned HTTP isolation accounts have employee IDs distinct from user IDs')
    (RUN / 'state.json').write_text(json.dumps({'run': str(RUN), 'mysqlPort': DB_PORT, 'redisPort': redis_port,
                    'services': SERVICES, 'processes': {key: p.pid for key, p in PROCESSES.items()}}), encoding='utf-8')
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(service, name) for name in ['auth1', 'workflow'] + (['oa', 'hr', 'crm'] if SCOPE == 'http' else [])]
        for future in futures:
            future.result()
    check(True, 'actual auth and workflow services ready')
    account = next(item for item in json.loads((RUN / 'private/accounts.json').read_text(encoding='utf-8')) if item['username'] == 'g_import_admin')
    base = 'http://127.0.0.1:' + str(SERVICES['auth1']['port'])
    token = login(base, account)
    check(True, 'real captcha legal release and HTTP login')
    connection = websocket.create_connection('ws://127.0.0.1:' + str(SERVICES['workflow']['port']) + '/ws/notifications',
                                               timeout=10, suppress_origin=True)
    connection.send(json.dumps({'type': 'AUTH', 'token': token}))
    check(json.loads(connection.recv()).get('type') == 'AUTH_OK', 'workflow real WebSocket authenticated')
    if SCOPE == 'http':
        message_http_checks.run(globals(), connection, token, shared)
    else:
        prefix = 'A2LIVE-' + ROUND + '-normal'
        sdk('send', 1, prefix)
        receive_titles(connection, prefix, 1)
        check(records(prefix) == '1:1', 'SDK to actual Redis to SUCCESS record')
        nickname = sql('SELECT nick_name FROM cloud_flow_db.sys_user WHERE user_id=990000701;')
        rollback_prefix = 'A2LIVE-' + ROUND + '-rollback'
        sdk('rollback', 1, rollback_prefix)
        check(sql("SELECT COUNT(*) FROM cloud_flow_db.outbox_event WHERE event_id='" + event_id(rollback_prefix + '-0') + "';") == '0', 'rollback removes SDK outbox event')
        check(sql('SELECT nick_name FROM cloud_flow_db.sys_user WHERE user_id=990000701;') == nickname, 'rollback restores business write')
        stop('auth1')
        backlog = 'A2LIVE-' + ROUND + '-backlog'
        sdk('send', 3, backlog)
        time.sleep(3)
        check(records(backlog).split(':')[0] == '0', 'auth stopped messages remain undelivered')
        check(sql("SELECT COUNT(*) FROM cloud_flow_db.outbox_event WHERE status='PENDING' AND event_id IN ("
                  + ','.join("'" + event_id(backlog + '-' + str(index)) + "'" for index in range(3)) + ');') == '3',
              'all stopped-auth SDK events remain in actual outbox')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(service, name) for name in ['auth1', 'auth2']]
            for future in futures:
                future.result()
        receive_titles(connection, backlog, 3)
        check(records(backlog) == '3:3', 'auth restart automatically delivers backlog')
        concurrent_prefix = 'A2LIVE-' + ROUND + '-dual'
        sdk('scheduled', 36, concurrent_prefix)
        dual_ids = sql("SELECT id FROM cloud_flow_db.outbox_event WHERE event_id IN ("
                       + ','.join("'" + event_id(concurrent_prefix + '-' + str(index)) + "'" for index in range(36)) + ');').splitlines()
        check(len(dual_ids) == 36, 'dual auth batch prepared before simultaneous due time')
        check(sql("UPDATE cloud_flow_db.outbox_event SET next_retry_at=NOW() WHERE status='PENDING' AND id IN ("
                  + ','.join(dual_ids) + '); SELECT ROW_COUNT();') == '36', 'dual auth events become due together')
        receive_titles(connection, concurrent_prefix, 36)
        wait_for(lambda: records(concurrent_prefix) == '36:36', 20, 'dual auth delivery completion')
        check(records(concurrent_prefix) == '36:36', 'dual auth creates one successful business record per event')
        lease_prefix = 'A2LIVE-' + ROUND + '-lease'
        sdk('lease', 1, lease_prefix)
        check(sql("UPDATE cloud_flow_db.outbox_event SET status='PROCESSING',locked_by='terminated-a2-worker',locked_until=DATE_SUB(NOW(),INTERVAL 1 SECOND),next_retry_at=NOW() WHERE status='PENDING' AND event_id='" + event_id(lease_prefix + '-0') + "'; SELECT ROW_COUNT();") == '1', 'one owned event simulates interrupted worker')
        receive_titles(connection, lease_prefix, 1)
        check(records(lease_prefix) == '1:1', 'expired PROCESSING recovered by real service and Redis')
        time.sleep(4)
        connection.settimeout(1)
        quiet_deadline = time.monotonic() + 3
        while time.monotonic() < quiet_deadline:
            try:
                extra = json.loads(connection.recv())
                if extra.get('type') == 'NOTICE':
                    RECEIVED_TITLES.append(extra.get('data', {}).get('noticeTitle', ''))
            except websocket.WebSocketTimeoutException:
                pass
        expected_titles = [prefix + '-0', lease_prefix + '-0'] + [backlog + '-' + str(i) for i in range(3)] + [concurrent_prefix + '-' + str(i) for i in range(36)]
        check(all(RECEIVED_TITLES.count(title) == 1 for title in expected_titles), 'all tested WebSocket messages remain exactly once after quiet window')
        for tested_prefix, tested_count in [(prefix, 1), (backlog, 3), (concurrent_prefix, 36), (lease_prefix, 1)]:
            check(all(value == 1 for value in stream_message_counts(tested_prefix, tested_count).values()),
                  tested_prefix + ' actual Redis contains exactly one MESSAGE_SEND per event')
        publishing = {}
        for name in ['auth1', 'auth2', 'workflow']:
            log = (RUN / (name + '.stdout.log')).read_text(encoding='utf-8', errors='replace')
            publishing[name] = sorted(set(re.findall(r'eventType=MESSAGE_SEND, msgId=[^,]+, outboxId=(\d+)', log)) & set(dual_ids))
        check(bool(publishing['auth1']) and bool(publishing['auth2']) and not publishing['workflow'],
              'both real auth schedulers publish dual batch and workflow publishes none')
        check(len(set(publishing['auth1']) | set(publishing['auth2'])) == 36
              and not set(publishing['auth1']) & set(publishing['auth2']), 'dual auth published outbox IDs form one disjoint complete set')
        (RUN / 'transport-proof.json').write_text(json.dumps({'publishing': publishing, 'notices': NOTICES}, indent=2), encoding='utf-8')
        check(records(concurrent_prefix) == '36:36' and records(backlog) == '3:3' and records(lease_prefix) == '1:1', 'no duplicate records after repeated scans')
        check(sql("SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE title LIKE 'A2LIVE-" + ROUND + "-%' AND send_status <> 'SUCCESS';") == '0', 'no unfinished records in tested messages')
    check(all(digest(Path(path)) == value for path, value in INPUTS.items()), 'actual class resource jar and script hashes unchanged')
    check(reference_state() == REFERENCE_PROOF, 'reference process identities and state unchanged')
except Exception as error:
    failure = type(error).__name__ + ': ' + str(error)
    print('A2_LIVE_FAILURE: ' + failure, flush=True)
finally:
    shutdown_errors = []
    if connection is not None:
        try:
            connection.close()
        except Exception as error:
            shutdown_errors.append('websocket: ' + str(error))
    for name in ['auth1', 'auth2', 'workflow', 'oa', 'hr', 'crm', 'redis', 'mysql']:
        try:
            stop(name)
        except Exception as error:
            shutdown_errors.append(name + ': ' + str(error))
    for handle in HANDLES:
        handle.close()
    if REDIS is not None:
        REDIS.close()
    if shutdown_errors:
        failure = (failure + '; ' if failure else '') + 'shutdown: ' + '; '.join(shutdown_errors)
    result = {'round': ROUND, 'scope': SCOPE, 'passed': failure is None, 'assertions': len(CHECKS), 'failure': failure,
              'run': str(RUN), 'inputs': len(INPUTS), 'checks': CHECKS, 'globalComplete': False}
    (RUN / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('A2_LIVE_RESULT=' + json.dumps(result, ensure_ascii=False), flush=True)
    print('A2_LIVE_ENVIRONMENT_STOPPED=' + str(not shutdown_errors).lower(), flush=True)
if failure:
    sys.exit(1)
