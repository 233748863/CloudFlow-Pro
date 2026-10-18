"""Rebuild only the pinned development database, keeping one temporary backup.

Run prepare, import, start (includes check-demo-data.py), then cleanup. A failed
import stays stopped. Resume uses the same run directory and never drops again.
No credentials are stored in the manifest or committed to this repository.
"""
import argparse
import importlib.util
import json
import hashlib
import re
import shlex
import stat
from demo_seed_model import DB, schema
from demo_seed_server import connect, run, DATABASE, HOST, SERVICES


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'import', 'resume', 'start', 'cleanup'])
    parser.add_argument('--run-id', required=True)
    parser.add_argument('--file', type=int, choices=range(1, 8))
    parser.add_argument('--line', type=int, default=1)
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9]{8}-[0-9]{6}', args.run_id):
        parser.error('run-id must be YYYYMMDD-HHMMSS')
    directory = '/data/cloudflow/native/db-rebuild-' + args.run_id
    state_path = directory + '/state.json'
    backup = directory + '/before.sql.gz'
    config = directory + '/client.cnf'
    ssh, db, env = connect()
    sftp = ssh.open_sftp()
    state = {}
    config_created = False
    try:
        if HOST != '192.168.1.173' or DATABASE != 'cloud_flow_db':
            raise RuntimeError('Development target guard failed')
        # Refuse symlinks in every parent before reading, writing or cleaning.
        for parent in ('/data', '/data/cloudflow', '/data/cloudflow/native'):
            if not stat.S_ISDIR(sftp.lstat(parent).st_mode):
                raise RuntimeError('Unexpected directory or link: ' + parent)
        if args.phase == 'prepare':
            try:
                entry = sftp.lstat(directory)
            except FileNotFoundError:
                run(ssh, 'mkdir -m 700 ' + shlex.quote(directory))
                state = dict(host=HOST, database=DATABASE, services=SERVICES,
                             disk_before=run(ssh, 'df -B1 --output=avail /data | tail -1').strip(),
                             stage='PREPARING', files={})
            else:
                if not stat.S_ISDIR(entry.st_mode) or not stat.S_ISREG(sftp.lstat(state_path).st_mode):
                    raise RuntimeError('Run directory or manifest is a link')
                with sftp.open(state_path) as stream:
                    state = json.load(stream)
                if state['stage'] != 'PREPARING' or state.get('backup_gzip_verified'):
                    raise RuntimeError('Do not overwrite a completed backup')
        else:
            if not stat.S_ISDIR(sftp.lstat(directory).st_mode) or not stat.S_ISREG(sftp.lstat(state_path).st_mode):
                raise RuntimeError('Run directory or manifest is a link')
            with sftp.open(state_path) as stream:
                state = json.load(stream)
            if state['host'] != HOST or state['database'] != DATABASE or state['services'] != SERVICES:
                raise RuntimeError('Manifest target guard failed')

        def save():
            temporary = state_path + '.tmp'
            with sftp.open(temporary, 'wx') as stream:
                stream.write(json.dumps(state, ensure_ascii=False, indent=2))
            sftp.chmod(temporary, 0o600)
            sftp.posix_rename(temporary, state_path)

        def credential(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n') + '"'

        # Start/cleanup never need a mysql credential file.
        if args.phase in ('prepare', 'import', 'resume'):
            with sftp.open(config, 'wx') as stream:
                config_created = True
                sftp.chmod(config, 0o600)
                stream.write('[client]\nuser=root\npassword=' + credential(env['DB_PASSWORD']) + '\nhost='+HOST+'\nport=3306\ndefault-character-set=utf8mb4\n')
        options = '--defaults-extra-file=' + shlex.quote(config)
        units = ' '.join(map(shlex.quote, SERVICES))
        if args.phase == 'prepare':
            for unit in SERVICES:
                command = run(ssh, 'systemctl show -p ExecStart --value ' + shlex.quote(unit))
                if '/data/cloudflow/' not in command and 'nginx' not in command:
                    raise RuntimeError('Unexpected service command: ' + unit)
            run(ssh, 'systemctl stop ' + units, timeout=120)
            save()
            try:
                if not stat.S_ISREG(sftp.lstat(backup).st_mode):
                    raise RuntimeError('Backup destination is a link or directory')
            except FileNotFoundError:
                pass
            command = f'set -o pipefail; mysqldump {options} --single-transaction --routines --triggers --events --hex-blob --databases {DATABASE} | gzip -1 > {shlex.quote(backup)}'
            run(ssh, 'bash -c ' + shlex.quote(command), timeout=300)
            run(ssh, 'gzip -t ' + shlex.quote(backup), timeout=120)
            state['backup_bytes'] = sftp.stat(backup).st_size
            if state['backup_bytes'] < 1000:
                raise RuntimeError('Backup is unexpectedly small')
            state['backup_gzip_verified'] = True
            state['restore_rehearsed'] = False
            state['stage'] = 'BACKED_UP'
            save()
        elif args.phase in ('import', 'resume'):
            if state['stage'] not in ('BACKED_UP', 'IMPORT_FAILED', 'IMPORTING'):
                raise RuntimeError('Import stage guard failed: ' + state['stage'])
            for unit in SERVICES:
                if run(ssh, 'systemctl show -p ActiveState --value ' + shlex.quote(unit)) != 'inactive':
                    raise RuntimeError('Services must remain stopped for import')
            files = [next(DB.glob(f'0{i}.*.sql')) for i in range(1, 8)]
            # Check that fixtures still cover the current schema before dropping.
            from demo_seed_completion import SUPPLEMENT
            generated = files[6].read_text(encoding='utf-8-sig')
            missing = [table for table in schema() if not re.search(r'INSERT(?: IGNORE)? INTO (?:cloud_flow_db\.)?`?'+table+r'`?\s*\(', generated, re.I) and table not in SUPPLEMENT]
            if missing:
                raise RuntimeError('Seed coverage missing: ' + repr(missing))
            if args.phase == 'import':
                if state['stage'] != 'BACKED_UP':
                    raise RuntimeError('A failed import must use resume')
                run(ssh, 'gzip -t ' + shlex.quote(backup), timeout=120)
                state['stage'] = 'IMPORTING'
                save()
                with db.cursor() as cursor:
                    cursor.execute('DROP DATABASE `cloud_flow_db`')
                    cursor.execute('CREATE DATABASE `cloud_flow_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci')
                first = 1
            else:
                first = args.file
                if not first or first != state.get('failed_file'):
                    raise RuntimeError('Resume must select the failed file')
                lines = files[first-1].read_text(encoding='utf-8-sig').splitlines()
                if args.line < 1 or args.line > len(lines) or not re.match(r'^(INSERT|UPDATE|DELETE|CREATE|DROP|SET|ALTER|PREPARE|EXECUTE|DEALLOCATE|CALL|USE)\b', lines[args.line-1], re.I):
                    raise RuntimeError('Resume line must begin a complete SQL statement')
            for index, path in enumerate(files, 1):
                if index < first:
                    continue
                content = path.read_text(encoding='utf-8-sig')
                if args.phase == 'resume' and index == first and args.line > 1:
                    content = '\n'.join(content.splitlines()[args.line-1:])
                    prefix = 'SET NAMES utf8mb4; USE cloud_flow_db; SET FOREIGN_KEY_CHECKS=0;\n'
                    if index == 7:
                        for name in ('demo_seed_tenants', 'demo_seed_rows'):
                            prefix += f'CREATE TEMPORARY TABLE {name}(n INT PRIMARY KEY); INSERT INTO {name} VALUES '+','.join(f'({i})' for i in range(50))+';\n'
                    content = prefix + content
                remote = directory + '/' + path.name
                try:
                    if not stat.S_ISREG(sftp.lstat(remote).st_mode):
                        raise RuntimeError('SQL destination is not a regular file')
                except FileNotFoundError:
                    pass
                with sftp.open(remote, 'w') as stream:
                    stream.write(content)
                state['stage'] = 'IMPORTING'
                state['failed_file'] = index
                state['source_sha256'] = state.get('source_sha256', {})
                state['source_sha256'][str(index)] = hashlib.sha256(path.read_bytes()).hexdigest()
                save()
                try:
                    run(ssh, f'mysql {options} --show-warnings {DATABASE} < '+shlex.quote(remote), timeout=300)
                except Exception:
                    state.update(stage='IMPORT_FAILED', failed_file=index)
                    save()
                    raise
                state['files'][str(index)] = path.name
                save()
                print('Imported', path.name, flush=True)
            state['stage'] = 'IMPORTED'
            state.pop('failed_file', None)
            save()
        elif args.phase == 'start':
            if state['stage'] != 'IMPORTED':
                raise RuntimeError('Must finish import before starting services')
            spec = importlib.util.spec_from_file_location('demo_check', DB.parents[1] / 'scripts/check-demo-data.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            result = module.audit(db)
            if result['failures'] or result['empty_tables'] or result['missing_tables'] or result['unexpected_tables']:
                print(json.dumps(result, ensure_ascii=False))
                raise RuntimeError('Data audit failed; services remain stopped')
            state['audit'] = result
            run(ssh, 'systemctl start ' + units, timeout=300)
            state['stage'] = 'STARTED'
            state.pop('failed_file', None)
            save()
        elif args.phase == 'cleanup':
            if state['stage'] != 'STARTED':
                raise RuntimeError('Verify and start before removing temporary backup')
            items = sftp.listdir_attr(directory)
            state['cleanup_disk_before'] = run(ssh, 'df -B1 --output=avail /data | tail -1').strip()
            cleanup_bytes = 0
            for item in items:
                if item.filename == 'state.json':
                    continue
                if not re.fullmatch(r'(before\.sql\.gz|client\.cnf|0[1-7]\.[\w-]+\.sql)', item.filename):
                    raise RuntimeError('Unexpected cleanup item: ' + item.filename)
                if not stat.S_ISREG(item.st_mode):
                    raise RuntimeError('Cleanup refuses links/directories')
            for item in items:
                if item.filename == 'state.json':
                    continue
                cleanup_bytes += item.st_size
                sftp.remove(directory + '/' + item.filename)
            state['stage'] = 'VERIFIED_AND_CLEANED'
            state.pop('failed_file', None)
            state['cleanup_bytes'] = cleanup_bytes
            state['disk_after'] = run(ssh, 'df -B1 --output=avail /data | tail -1').strip()
            save()
        print(json.dumps(state, ensure_ascii=False))
    finally:
        if config_created:
            try:
                sftp.remove(config)
            except FileNotFoundError:
                pass
        sftp.close()
        db.close()
        ssh.close()


if __name__ == '__main__':
    main()
