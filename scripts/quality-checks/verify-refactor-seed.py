"""Import the current seven SQL files into an isolated local quality database."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
import xml.etree.ElementTree as ET

import pymysql


ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / 'cloudflow-backend/DB'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--connection-file', type=Path, required=True)
    parser.add_argument('--schema', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reset', action='store_true')
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    config = json.loads(args.connection_file.read_text(encoding='utf-8-sig'))
    if config['host'] != '127.0.0.1' or not re.fullmatch(r'quality_seed_[a-z0-9_]+', args.schema):
        raise ValueError('Only local quality_seed_ databases may be used')
    mysql = Path(r'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe')
    connection = pymysql.connect(host=config['host'], port=int(config['port']),
        user=config['user'], password=config.get('password', ''), charset='utf8mb4', autocommit=True)
    summary = {'schema': args.schema, 'started_at': datetime.now(timezone.utc).isoformat(),
               'imports': [], 'checks': {}, 'status': 'running'}
    if args.verify_only and args.output.exists():
        previous = json.loads(args.output.read_text(encoding='utf-8'))
        if previous.get('schema') == args.schema:
            summary['imports'] = previous.get('imports', [])
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def save() -> None:
        args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

    def scalar(sql: str, parameters: tuple = ()):
        with connection.cursor() as cursor:
            cursor.execute(sql, parameters)
            return cursor.fetchone()[0]

    def check(name: str, sql: str, expected=0) -> None:
        actual = scalar(sql)
        summary['checks'][name] = {'actual': actual, 'expected': expected}
        save()
        if actual != expected:
            raise AssertionError(f'{name}: expected {expected}, actual {actual}')

    try:
        exists = scalar('SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=%s', (args.schema,))
        with connection.cursor() as cursor:
            if not args.verify_only:
                if exists and not args.reset:
                    raise ValueError('Database already exists; use --reset only for this isolated test schema')
                if exists:
                    cursor.execute(f'DROP DATABASE `{args.schema}`')
                cursor.execute(f'CREATE DATABASE `{args.schema}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci')
            elif not exists:
                raise ValueError('Verification database does not exist')
        connection.select_db(args.schema)
        if not args.verify_only:
            environment = dict(os.environ, MYSQL_PWD=config.get('password', ''))
            paths = sorted(DB.glob('0[1-7].*.sql'))
            if len(paths) != 7:
                raise ValueError('Expected exactly seven SQL inputs')
            for path in paths:
                # Original files remain untouched. All database qualifiers, USE and CREATE
                # statements in the in-memory verification copy target the isolated schema.
                source = path.read_text(encoding='utf-8-sig')
                scoped = source.replace('cloud_flow_db', args.schema)
                result = subprocess.run([str(mysql), '--protocol=TCP', '--host=127.0.0.1',
                    f'--port={config["port"]}', f'--user={config["user"]}', '--default-character-set=utf8mb4',
                    '--binary-mode', args.schema], input=scoped.encode('utf-8'), capture_output=True, env=environment)
                entry = {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                         'exit_code': result.returncode}
                summary['imports'].append(entry)
                save()
                if result.returncode:
                    error = result.stderr.decode('utf-8', errors='replace').strip()
                    entry['error'] = error
                    raise RuntimeError(path.name + ': ' + error[-700:])
                print('Imported ' + path.name, flush=True)
        check('tables_including_two_archives', 'SELECT COUNT(*) FROM information_schema.tables '
              'WHERE table_schema=DATABASE()', 377)
        check('active_tenants', "SELECT COUNT(*) FROM sys_tenant WHERE status='0' AND deleted=0", 50)
        check('leader_reference_errors', 'SELECT COUNT(*) FROM sys_dept d LEFT JOIN sys_user u '
              'ON u.user_id=d.leader_user_id AND u.tenant_id=d.tenant_id '
              'WHERE d.deleted=0 AND d.leader_user_id IS NOT NULL AND u.user_id IS NULL')
        check('expense_city_missing', "SELECT COUNT(*) FROM biz_expense_item i JOIN biz_expense_claim c "
              "ON c.id=i.claim_id AND c.tenant_id=i.tenant_id WHERE c.status IN ('PENDING','APPROVED','PAID') "
              "AND c.deleted=0 AND (i.city IS NULL OR TRIM(i.city)='')")
        check('expense_period_invalid', "SELECT COUNT(*) FROM oa_expense_standard WHERE "
              "limit_type NOT IN ('PER_ITEM','DAILY','MONTHLY','YEARLY') OR limit_type IS NULL")
        check('expense_type_invalid', "SELECT COUNT(*) FROM biz_expense_item WHERE "
              "expense_type NOT IN ('TRANSPORT','ACCOMMODATION','MEAL','COMMUNICATION','OFFICE_SUPPLIES','OTHER')")
        check('start_permission_encoding_invalid', "SELECT COUNT(*) FROM wf_process_definition WHERE "
              "(start_permission_type='ALL' AND start_permission_value IS NOT NULL) OR "
              "(start_permission_type<>'ALL' AND (start_permission_value IS NULL OR "
              "JSON_VALID(start_permission_value)=0 OR JSON_TYPE(start_permission_value)<>'ARRAY'))")
        check('urge_history_reference_errors', 'SELECT COUNT(*) FROM wf_urge_effect e '
              'LEFT JOIN wf_task_history h ON h.history_id=e.history_id AND h.tenant_id=e.tenant_id '
              'LEFT JOIN wf_task_urge u ON u.id=e.urge_id AND u.tenant_id=e.tenant_id '
              "WHERE h.history_id IS NULL OR u.id IS NULL OR h.task_id<>u.task_id "
              "OR h.action NOT IN ('APPROVE','REJECT') OR u.create_time>h.create_time")
        check('pending_outbox', "SELECT COUNT(*) FROM outbox_event WHERE status NOT IN ('PUBLISHED','DLQ')")
        check('event_envelope_invalid', "SELECT COUNT(*) FROM outbox_event WHERE JSON_VALID(payload_json)=0 "
              "OR JSON_EXTRACT(payload_json,'$.payload') IS NULL "
              "OR JSON_TYPE(JSON_EXTRACT(payload_json,'$.payload'))<>'STRING' "
              "OR JSON_EXTRACT(payload_json,'$.payloadDigest') IS NULL "
              "OR JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.eventId'))<>event_id "
              "OR JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payloadDigest'))<>"
              "SHA2(JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload')),256) "
              "OR JSON_EXTRACT(payload_json,'$.sourceId') IS NULL "
              "OR JSON_EXTRACT(payload_json,'$.occurredAt') IS NULL")
        with connection.cursor() as cursor:
            cursor.execute('SELECT event_id,tenant_id,payload_json FROM outbox_event')
            envelopes = cursor.fetchall()
            for event_id, tenant_id, payload_json in envelopes:
                envelope = json.loads(payload_json)
                if (envelope.get('eventId') != event_id or envelope.get('tenantId') != tenant_id
                        or not isinstance(envelope.get('payload'), str)
                        or not envelope.get('sourceModule') or envelope.get('sourceId') is None
                        or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}', envelope.get('occurredAt', ''))
                        or envelope.get('payloadDigest') != hashlib.sha256(envelope['payload'].encode()).hexdigest()):
                    raise AssertionError('Invalid current event contract: ' + event_id)
            summary['checks']['event_contract_rows'] = {'rows': len(envelopes), 'passed': True}
            cursor.execute("SELECT start_permission_value FROM wf_process_definition WHERE start_permission_type<>'ALL'")
            permissions = cursor.fetchall()
            for (encoded,) in permissions:
                values = json.loads(encoded)
                if not values or any(not isinstance(value, str) or not re.fullmatch(r'[1-9]\d*', value) for value in values):
                    raise AssertionError('Invalid workflow permission identifier array')
            summary['checks']['permission_identifier_arrays'] = {'rows': len(permissions), 'passed': True}
            mapper = ET.parse(ROOT / 'cloudflow-backend/cloudflow-service-oa/src/main/resources/mapper/ContactMapper.xml')
            select = mapper.find("./select[@id='selectDeptTree']")
            cursor.execute(''.join(select.itertext()))
            contacts = cursor.fetchall()
            summary['checks']['contact_department_production_sql'] = {'rows': len(contacts), 'passed': True}
            cursor.execute('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE()')
            summary['column_count'] = cursor.fetchone()[0]
        removed = {
            'sys_dept': ['leader'], 'sys_role': ['data_scope'],
            'wf_process_definition': ['version_lock'], 'wf_deploy_rollback_history': ['success'],
            'oa_meeting_minutes': ['meeting_id'], 'oa_meeting_attendance': ['meeting_id'],
            'oa_contract_template': ['usage_count'], 'hr_mall_order': ['item_count'],
            'hr_dispute_evidence': ['file_url'],
            'hr_perf_evaluator_response': ['objective_id', 'evaluatee_id', 'evaluator_source'],
        }
        for table in ('hr_work_injury_investigation', 'hr_work_injury_treatment',
                      'hr_work_injury_compensation', 'hr_work_injury_rehabilitation'):
            removed[table] = ['employee_id']
        for table, columns in removed.items():
            with connection.cursor() as cursor:
                cursor.execute('SELECT column_name FROM information_schema.columns '
                               'WHERE table_schema=DATABASE() AND table_name=%s', (table,))
                actual = {row[0] for row in cursor.fetchall()}
            if not actual:
                raise AssertionError('Missing table ' + table)
            if actual.intersection(columns):
                raise AssertionError('Removed columns still exist: ' + table)
        summary['checks']['removed_columns'] = {'tables': len(removed), 'passed': True}
        summary['status'] = 'passed'
        print(json.dumps(summary['checks'], ensure_ascii=False), flush=True)
    except Exception as error:
        summary['status'] = 'failed'
        summary['error'] = str(error)
        raise
    finally:
        save()
        connection.close()


if __name__ == '__main__':
    main()
