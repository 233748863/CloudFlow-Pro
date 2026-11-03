"""Update the pinned native test deployment after its database rebuild.

Phases: stage, cache-backup, install, verify. Database backup/import/start use
rebuild-demo-database.py with the same run-id. Secrets stay in process memory or
the mode-0600 temporary Redis backup. Never touches other Redis databases.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import shlex
import stat
import subprocess
import tarfile
import time
import zipfile

import redis
import yaml

from demo_seed_server import connect, run, HOST, SERVICES

ROOT = Path(__file__).resolve().parents[1]
REMOTE = '/data/cloudflow'
MODULES = {'gateway': 'cloudflow-gateway', 'auth': 'cloudflow-auth',
           'workflow': 'cloudflow-service-workflow', 'oa': 'cloudflow-service-oa',
           'crm': 'cloudflow-service-crm', 'hr': 'cloudflow-service-hr'}


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['stage', 'cache-backup', 'install', 'verify', 'cleanup'])
    parser.add_argument('--run-id', required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9]{8}-[0-9]{6}', args.run_id):
        parser.error('run-id must be YYYYMMDD-HHMMSS')
    stage = REMOTE + '/native/update-' + args.run_id
    state_path = stage + '/state.json'
    db_state_path = REMOTE + '/native/db-rebuild-' + args.run_id + '/state.json'
    local = ROOT / '.cloudflow-runtime' / ('native-update-' + args.run_id)
    local.mkdir(parents=True, exist_ok=True)
    ssh, db, env = connect()
    sftp = ssh.open_sftp()
    state = {}

    def read(path):
        with sftp.open(path) as stream:
            return stream.read()

    def directory(path):
        if not stat.S_ISDIR(sftp.lstat(path).st_mode):
            raise RuntimeError('Directory/link guard: ' + path)

    def regular(path):
        if not stat.S_ISREG(sftp.lstat(path).st_mode):
            raise RuntimeError('Regular-file/link guard: ' + path)

    def save():
        contents = json.dumps(state, ensure_ascii=False, indent=2)
        with sftp.open(state_path + '.next', 'wx') as stream:
            sftp.chmod(state_path + '.next', 0o600)
            stream.write(contents)
        sftp.posix_rename(state_path + '.next', state_path)
        (local / 'state.json').write_text(contents, encoding='utf-8')

    def stopped():
        for unit in SERVICES:
            if run(ssh, 'systemctl show -p ActiveState --value ' + shlex.quote(unit)) != 'inactive':
                raise RuntimeError('All application units must be stopped: ' + unit)

    def database_state(expected):
        directory(REMOTE + '/native/db-rebuild-' + args.run_id)
        regular(db_state_path)
        record = json.loads(read(db_state_path))
        if record['host'] != HOST or record['database'] != 'cloud_flow_db' or record['stage'] != expected:
            raise RuntimeError('Database rebuild state mismatch')
        return record

    def redis_client():
        settings = json.loads(env.get('SPRING_APPLICATION_JSON', '{}'))
        database = int(settings.get('spring.data.redis.database', env.get('SPRING_DATA_REDIS_DATABASE', '-1')))
        if database != 10 or env['REDIS_HOST'] != HOST or int(env['REDIS_PORT']) != 6379:
            raise RuntimeError('Pinned project Redis target mismatch')
        return redis.Redis(host=HOST, port=6379, password=env['REDIS_PASSWORD'], db=10,
                           socket_timeout=30, decode_responses=False)

    try:
        for path in ('/data', REMOTE, REMOTE + '/native', REMOTE + '/runtime',
                     REMOTE + '/runtime/apps', REMOTE + '/runtime/config', REMOTE + '/runtime/frontend'):
            directory(path)
        if args.phase == 'stage':
            commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
            # Documentation may be completed after release; production inputs must be committed.
            dirty = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD', '--',
                'cloudflow-backend/*/src', 'cloudflow-backend/cloudflow-common',
                'cloudflow-backend/DB', 'cloudflow-frontend/src', 'config'], cwd=ROOT, text=True)
            if dirty.strip():
                raise RuntimeError('Commit production inputs before staging')
            for path in (ROOT / 'config').glob('cloudflow*.yaml'):
                remote_config = REMOTE + '/runtime/config/' + path.name
                regular(remote_config)
                if yaml.safe_load(path.read_text(encoding='utf-8-sig')) != yaml.safe_load(read(remote_config)):
                    raise RuntimeError('Review changed external configuration: ' + path.name)
            run(ssh, 'mkdir -m 700 ' + shlex.quote(stage))
            state = {'host': HOST, 'run_id': args.run_id, 'source_commit': commit,
                     'stage': 'UPLOADING', 'apps': {}, 'created_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
                     'disk_before': run(ssh, 'df -B1 --output=avail /data | tail -1').strip()}
            save()
            for name, module in MODULES.items():
                source = ROOT / 'cloudflow-backend' / module / 'target' / (module + '-1.0.0.jar')
                with zipfile.ZipFile(source) as archive:
                    manifest = archive.read('META-INF/MANIFEST.MF').decode('utf-8')
                    if 'Main-Class: org.springframework.boot.loader.launch.JarLauncher' not in manifest:
                        raise RuntimeError('Executable Spring Boot package required: ' + name)
                    if not any(entry.startswith('BOOT-INF/lib/') for entry in archive.namelist()):
                        raise RuntimeError('Packaged dependencies missing: ' + name)
                target = REMOTE + '/runtime/apps/' + name + '/app.jar'
                directory(REMOTE + '/runtime/apps/' + name)
                regular(target)
                destination = stage + '/' + name + '.jar'
                sftp.put(str(source), destination)
                checksum = digest(source)
                if run(ssh, 'sha256sum ' + shlex.quote(destination)).split()[0] != checksum:
                    raise RuntimeError('Uploaded package checksum mismatch: ' + name)
                state['apps'][name] = {'sha256': checksum, 'bytes': source.stat().st_size,
                    'before_sha256': run(ssh, 'sha256sum ' + shlex.quote(target)).split()[0]}
                save()
                print('Staged ' + name, flush=True)
            frontend = ROOT / 'cloudflow-frontend/dist'
            if not (frontend / 'index.html').is_file():
                raise RuntimeError('Build frontend before staging')
            archive_path = local / 'frontend.tar.gz'
            files = {path.relative_to(frontend).as_posix(): {'sha256': digest(path), 'bytes': path.stat().st_size}
                     for path in frontend.rglob('*') if path.is_file() and not path.is_symlink()}
            with tarfile.open(archive_path, 'w:gz') as archive:
                for relative in files:
                    archive.add(frontend / relative, arcname=relative, recursive=False)
            sftp.put(str(archive_path), stage + '/frontend.tar.gz')
            if run(ssh, 'sha256sum ' + shlex.quote(stage + '/frontend.tar.gz')).split()[0] != digest(archive_path):
                raise RuntimeError('Frontend upload mismatch')
            run(ssh, 'mkdir ' + shlex.quote(stage + '/frontend') + ' && tar -xzf ' +
                shlex.quote(stage + '/frontend.tar.gz') + ' -C ' + shlex.quote(stage + '/frontend'))
            state['frontend'] = files
            state['sql'] = {path.name: digest(path) for path in (ROOT / 'cloudflow-backend/DB').glob('0[1-7].*.sql')}
            state['before_index_sha256'] = run(ssh, 'sha256sum ' + REMOTE + '/runtime/frontend/index.html').split()[0]
            state['stage'] = 'STAGED'
            save()
        else:
            directory(stage)
            regular(state_path)
            state = json.loads(read(state_path))
            if state['host'] != HOST or state['run_id'] != args.run_id:
                raise RuntimeError('Release target mismatch')
            if args.phase == 'cache-backup':
                if state['stage'] != 'STAGED':
                    raise RuntimeError('Release must be staged before cache backup')
                stopped()
                database_state('BACKED_UP')
                client = redis_client()
                try:
                    keys = list(client.scan_iter(count=1000))
                    with db.cursor() as cursor:
                        cursor.execute('SELECT tenant_id FROM sys_tenant')
                        tenant_prefixes = {str(row[0]).encode() for row in cursor.fetchall()}
                    project_prefixes = {b'cloudflow', b'sys', b'crm', b'workflow', b'hr', b'wf', b'CAPTCHA'}
                    if any(key.split(b':', 1)[0] not in project_prefixes | tenant_prefixes for key in keys):
                        raise RuntimeError('Redis 10 contains an unclassified key; review before clearing')
                    records = []
                    for offset in range(0, len(keys), 500):
                        chunk = keys[offset:offset + 500]
                        pipe = client.pipeline(transaction=False)
                        for key in chunk:
                            pipe.dump(key)
                            pipe.pttl(key)
                        values = pipe.execute()
                        for index, key in enumerate(chunk):
                            value, ttl = values[index * 2:index * 2 + 2]
                            if value is not None and ttl != -2:
                                records.append({'key': base64.b64encode(key).decode(),
                                    'dump': base64.b64encode(value).decode(), 'pttl': ttl})
                    payload = ('\n'.join(json.dumps(row) for row in records) + '\n').encode()
                    with sftp.open(stage + '/redis10.jsonl', 'wx') as stream:
                        sftp.chmod(stage + '/redis10.jsonl', 0o600)
                        stream.write(payload)
                    checksum = hashlib.sha256(payload).hexdigest()
                    if run(ssh, 'sha256sum ' + shlex.quote(stage + '/redis10.jsonl')).split()[0] != checksum:
                        raise RuntimeError('Redis backup checksum mismatch')
                    state['redis_backup'] = {'database': 10, 'keys': len(records), 'sha256': checksum,
                        'bytes': len(payload), 'time_unix_ms': int(time.time() * 1000)}
                    state['stage'] = 'BACKED_UP'
                    save()
                finally:
                    client.close()
            elif args.phase == 'install':
                if state['stage'] != 'BACKED_UP':
                    raise RuntimeError('Both database and cache backups are required')
                stopped()
                rebuild = database_state('IMPORTED')
                for number, checksum in rebuild['source_sha256'].items():
                    source = next((ROOT / 'cloudflow-backend/DB').glob('0' + number + '.*.sql'))
                    if checksum != state['sql'][source.name]:
                        raise RuntimeError('Imported SQL differs from the staged release')
                for name, details in state['apps'].items():
                    target = REMOTE + '/runtime/apps/' + name + '/app.jar'
                    regular(target)
                    if run(ssh, 'sha256sum ' + shlex.quote(target)).split()[0] != details['before_sha256']:
                        raise RuntimeError('Running artifact changed during staging: ' + name)
                if run(ssh, 'sha256sum ' + REMOTE + '/runtime/frontend/index.html').split()[0] != state['before_index_sha256']:
                    raise RuntimeError('Frontend changed during staging')
                run(ssh, 'mkdir -m 700 ' + shlex.quote(stage + '/before'))
                state['stage'] = 'INSTALLING'
                save()
                for name in MODULES:
                    target = REMOTE + '/runtime/apps/' + name + '/app.jar'
                    run(ssh, 'cp -- ' + shlex.quote(target) + ' ' + shlex.quote(stage + '/before/' + name + '.jar') +
                        ' && install -m 644 ' + shlex.quote(stage + '/' + name + '.jar') + ' ' + shlex.quote(target + '.next') +
                        ' && mv -- ' + shlex.quote(target + '.next') + ' ' + shlex.quote(target))
                run(ssh, 'chmod -R a+rX ' + shlex.quote(stage + '/frontend') +
                    ' && mv -- ' + REMOTE + '/runtime/frontend ' + shlex.quote(stage + '/before/frontend') +
                    ' && mv -- ' + shlex.quote(stage + '/frontend') + ' ' + REMOTE + '/runtime/frontend')
                client = redis_client()
                try:
                    state['redis_cleared_keys'] = client.dbsize()
                    client.flushdb(asynchronous=False)
                    if client.dbsize() != 0:
                        raise RuntimeError('Redis project database still receives writes while stopped')
                finally:
                    client.close()
                state['stage'] = 'INSTALLED'
                save()
            elif args.phase == 'verify':
                if state['stage'] not in ('INSTALLED', 'VERIFIED'):
                    raise RuntimeError('Install release before verification')
                database_state('STARTED')
                checks = {}
                for index, name in enumerate(MODULES):
                    props = dict(line.split('=', 1) for line in run(ssh, 'systemctl show cloudflow-' + name +
                        ' -p ActiveState -p SubState -p NRestarts -p MainPID').splitlines())
                    if props['ActiveState'] != 'active' or props['SubState'] != 'running':
                        raise RuntimeError('Application service unavailable: ' + name)
                    health = json.loads(run(ssh, 'curl --fail --silent --max-time 15 http://127.0.0.1:' + str(19100 + index) + '/actuator/health'))
                    if health.get('status') != 'UP':
                        raise RuntimeError('Application health failure: ' + name)
                    if run(ssh, 'sha256sum ' + REMOTE + '/runtime/apps/' + name + '/app.jar').split()[0] != state['apps'][name]['sha256']:
                        raise RuntimeError('Deployed artifact mismatch: ' + name)
                    checks[name] = props | {'health': health['status']}
                index_bytes = run(ssh, 'curl --fail --silent --max-time 15 http://' + HOST + ':18080/').encode()
                deployed_index = read(REMOTE + '/runtime/frontend/index.html')
                if index_bytes.strip() != deployed_index.strip() or hashlib.sha256(deployed_index).hexdigest() != state['frontend']['index.html']['sha256']:
                    raise RuntimeError('Frontend entry mismatch')
                manifest_path = REMOTE + '/runtime/manifest.json'
                if stat.S_ISREG(sftp.lstat(manifest_path).st_mode):
                    manifest = json.loads(read(manifest_path))
                    if state['stage'] != 'VERIFIED':
                        with sftp.open(stage + '/before/manifest.json', 'wx') as stream:
                            stream.write(json.dumps(manifest, indent=2))
                    manifest = {key: value for key, value in manifest.items() if not key.startswith(('apps/', 'frontend/'))}
                    manifest.update({'apps/' + name + '/app.jar': {'sha256': entry['sha256'], 'bytes': entry['bytes']}
                                     for name, entry in state['apps'].items()})
                    manifest.update({'frontend/' + key: value for key, value in state['frontend'].items()})
                    with sftp.open(manifest_path + '.next', 'wx') as stream:
                        stream.write(json.dumps(manifest, indent=2))
                    sftp.chmod(manifest_path + '.next', 0o644)
                    sftp.posix_rename(manifest_path + '.next', manifest_path)
                state['checks'] = checks
                state['stage'] = 'VERIFIED'
                state['verified_at'] = time.strftime('%Y-%m-%dT%H:%M:%S%z')
                save()
            elif args.phase == 'cleanup':
                if state['stage'] != 'VERIFIED':
                    raise RuntimeError('Verify the deployment before cleaning its backups')
                # Only remove this run after its business checks and documentation.
                processes = run(ssh, "ps -eo comm,args | awk '$1 == \"java\" || $1 == \"nginx\"'")
                if stage in processes:
                    raise RuntimeError('A running application references the release stage')
                allowed = {name + '.jar' for name in MODULES} | {'frontend.tar.gz', 'redis10.jsonl', 'before', 'state.json'}
                if set(sftp.listdir(stage)) - allowed:
                    raise RuntimeError('Unknown release cleanup entry')
                entries = []
                def collect(path):
                    item = sftp.lstat(path)
                    if stat.S_ISDIR(item.st_mode):
                        for child in sftp.listdir(path):
                            collect(path + '/' + child)
                        entries.append((path, True, 0))
                    elif stat.S_ISREG(item.st_mode):
                        entries.append((path, False, item.st_size))
                    else:
                        raise RuntimeError('Cleanup refuses links and special files')
                for name in sftp.listdir(stage):
                    if name != 'state.json':
                        collect(stage + '/' + name)
                before = run(ssh, 'df -B1 --output=avail /data | tail -1').strip()
                for path, is_directory, _ in entries:
                    if is_directory:
                        sftp.rmdir(path)
                    else:
                        sftp.remove(path)
                state['cleanup'] = {'files': sum(not item[1] for item in entries),
                    'logical_bytes': sum(item[2] for item in entries), 'disk_before': before,
                    'disk_after': run(ssh, 'df -B1 --output=avail /data | tail -1').strip(),
                    'space_difference_attributed_to_project': False}
                state['stage'] = 'VERIFIED_AND_CLEANED'
                save()
        print(json.dumps({key: state[key] for key in ('stage', 'source_commit', 'run_id')}, ensure_ascii=False))
    finally:
        sftp.close()
        db.close()
        ssh.close()


if __name__ == '__main__':
    main()
