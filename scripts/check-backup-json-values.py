"""Compare restored JSON values with exact decimal arithmetic; never print row data."""

import json
import os
from decimal import Decimal
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
STATE = json.loads((ROOT / '.cloudflow-runtime/full-prd-20260915/approved-runtime/deployment-state.json').read_text(encoding='utf-8-sig'))
RESTORED = os.environ.get('CLOUDFLOW_RESTORED_DATABASE', '')
TABLE = sys.argv[1]
assert STATE['status'] == 'STOPPED'
assert STATE['backup']['recoveryFormat'] == 'ORIGINAL_SCHEMA_V1'
assert RESTORED == STATE['backup']['recoveryDatabase']
assert re.fullmatch(r'cf_approved_restore_[a-f0-9]{32}', RESTORED)
assert TABLE in STATE['backup']['tables'] and re.fullmatch(r'[a-z][a-z0-9_]*', TABLE)


def query(database, sql):
    assert database in ('cloud_flow_db', RESTORED)
    result = subprocess.run([
        'mysql.exe', '--no-defaults', '--host=192.168.1.173', '--port=3306',
        '--user=' + os.environ['DB_USERNAME'], '--database=' + database,
        '--default-character-set=utf8mb4', '--batch', '--raw', '--skip-column-names',
    ], input='START TRANSACTION READ ONLY;\n' + sql + ';\nCOMMIT;',
        encoding='utf-8', capture_output=True, timeout=120,
        env=dict(os.environ, MYSQL_PWD=os.environ['DB_PASSWORD']))
    if result.returncode:
        raise RuntimeError('Read-only JSON backup comparison failed')
    return [json.loads(line) for line in result.stdout.splitlines() if line]


columns = query('cloud_flow_db', "SELECT JSON_OBJECT('name',COLUMN_NAME,'kind',DATA_TYPE,'pk',COLUMN_KEY='PRI') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='" + TABLE + "' ORDER BY ORDINAL_POSITION")
for column in columns:
    assert re.fullmatch(r'[a-zA-Z][a-zA-Z0-9_]*', column['name'])
primary = ['`' + column['name'] + '`' for column in columns if column['pk']]
assert primary
scalars = []
json_columns = []
for column in columns:
    name = '`' + column['name'] + '`'
    if column['kind'] == 'json':
        json_columns.append('CAST(' + name + ' AS CHAR CHARACTER SET utf8mb4)')
    elif re.search(r'binary|blob|bit|geometry|point|polygon|linestring', column['kind']):
        scalars.append('HEX(' + name + ')')
    else:
        scalars.append(name)
assert json_columns
statement = ('SELECT JSON_ARRAY(JSON_ARRAY(' + ','.join(primary) + '),'
    'SHA2(CAST(JSON_ARRAY(' + ','.join(scalars) + ') AS CHAR CHARACTER SET utf8mb4),256),'
    'JSON_ARRAY(' + ','.join(json_columns) + ')) FROM `' + TABLE + '`')


def typed(value):
    if value is None:
        return ('json-null',)
    if isinstance(value, bool):
        return ('boolean', value)
    if isinstance(value, Decimal):
        return ('number', value)
    if isinstance(value, str):
        return ('string', value)
    if isinstance(value, list):
        return ('array', tuple(typed(item) for item in value))
    assert isinstance(value, dict)
    return ('object', {key: typed(item) for key, item in value.items()})


def rows(database):
    result = {}
    for key, scalar_hash, documents in query(database, statement):
        identifier = json.dumps(key, ensure_ascii=False, separators=(',', ':'))
        assert identifier not in result
        # Decimal compares 1.0 and 1 by value without rounding large numbers to floats.
        parsed = [('sql-null',) if document is None else typed(json.loads(document, parse_int=Decimal, parse_float=Decimal)) for document in documents]
        result[identifier] = (scalar_hash, parsed)
    return result


source = rows('cloud_flow_db')
restored = rows(RESTORED)
print(json.dumps({'matched': source == restored, 'sourceRows': len(source), 'restoredRows': len(restored),
    'jsonColumns': len(json_columns), 'comparison': 'EXACT_SCALARS_AND_DECIMAL_JSON_VALUES'}))
sys.exit(0 if source == restored else 1)
