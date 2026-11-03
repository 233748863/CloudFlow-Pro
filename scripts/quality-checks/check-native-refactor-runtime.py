"""Bounded read checks of the pinned native test release through its public gateway.

The only writes are the normal captcha/login/logout protocol and its audit records.
No business fixtures, passwords, permissions, services or shared infrastructure are
changed. Secrets, tokens, captcha images and API business payloads stay in memory.
Run only after the release/database switch. Do not run other checks using the same
account concurrently: a new login can replace that account's existing session.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import sys

import requests


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from demo_seed_server import connect, HOST  # noqa: E402

ENTRY = f'http://{HOST}:18080'
CAPTCHA_SOURCE = ROOT / 'scripts/check-server-job-smoke.py'
spec = importlib.util.spec_from_file_location('native_smoke_captcha', CAPTCHA_SOURCE)
captcha_support = importlib.util.module_from_spec(spec)
spec.loader.exec_module(captcha_support)


def client() -> requests.Session:
    result = requests.Session()
    result.trust_env = False
    result.headers.update({'Origin': ENTRY, 'Referer': ENTRY + '/'})
    return result


def api(session: requests.Session, method: str, path: str, **kwargs):
    response = session.request(method, ENTRY + '/api' + path,
                               timeout=(5, 25), allow_redirects=False, **kwargs)
    try:
        body = response.json()
    except ValueError:
        raise RuntimeError(f'{method} {path}: HTTP {response.status_code}, non-JSON response') from None
    if not isinstance(body, dict) or response.status_code != 200 or body.get('code') != 200:
        code = body.get('code') if isinstance(body, dict) else 'non-object'
        # Never emit the response text or a login payload, even on failure.
        if not isinstance(code, (int, float)):
            code = 'invalid'
        raise RuntimeError(f'{method} {path}: HTTP {response.status_code}, business code {code}')
    return body.get('data')


def page_rows(payload, key: str, label: str) -> list[dict]:
    if not isinstance(payload, dict) or not isinstance(payload.get(key), list):
        raise RuntimeError(label + ': unexpected page contract')
    rows = payload[key]
    if not rows or not all(isinstance(row, dict) for row in rows):
        raise RuntimeError(label + ': expected seeded records in the first page')
    return rows


def tree_rows(payload) -> list[dict]:
    if not isinstance(payload, list):
        raise RuntimeError('Department tree response must be an array')
    result = []
    for row in payload:
        if not isinstance(row, dict):
            raise RuntimeError('Department tree contains a non-object node')
        result.append(row)
        if row.get('children'):
            result.extend(tree_rows(row['children']))
    return result


def number(value, label: str) -> int:
    if isinstance(value, bool):
        raise RuntimeError(label + ': boolean is not an identifier')
    try:
        result = int(str(value))
    except (TypeError, ValueError):
        raise RuntimeError(label + ': expected an integer identifier') from None
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tenant-code', default='xinyuan')
    args = parser.parse_args()
    required = ('CLOUDFLOW_SERVER_SSH_PASSWORD', 'CLOUDFLOW_TEST_ADMIN_USERNAME',
                'CLOUDFLOW_TEST_ADMIN_PASSWORD')
    for name in required:
        if not os.environ.get(name):
            raise RuntimeError('Missing required environment variable: ' + name)
    result = {'entry': ENTRY, 'started_at': datetime.now(timezone.utc).isoformat(),
              'status': 'RUNNING', 'checks': [], 'business_rows_created': 0,
              'scope': 'captcha login; selected read APIs and database comparisons; logout/revocation'}
    session = client()
    ssh = db = None
    signed_in = False
    failure = None

    def passed(name: str, **facts):
        result['checks'].append({'name': name, 'status': 'PASS', **facts})

    try:
        ssh, db, _ = connect()
        with db.cursor() as cursor:
            cursor.execute("SELECT tenant_id FROM sys_tenant WHERE tenant_code=%s AND deleted=0 AND status='0'",
                           (args.tenant_code,))
            tenants = cursor.fetchall()
            if len(tenants) != 1:
                raise RuntimeError('Selected active tenant must resolve uniquely')
            tenant_id = int(tenants[0][0])
            cursor.execute("SELECT user_id,pwd_reset_required FROM sys_user WHERE tenant_id=%s AND user_name=%s "
                           "AND deleted=0 AND status='0'",
                           (tenant_id, os.environ['CLOUDFLOW_TEST_ADMIN_USERNAME']))
            users = cursor.fetchall()
            if len(users) != 1:
                raise RuntimeError('Selected active account must belong to the selected tenant')
            user_id = int(users[0][0])
            password_change_required = str(users[0][1]) == '1'
            cursor.execute('SELECT dept_id, leader_user_id FROM sys_dept WHERE tenant_id=%s AND deleted=0',
                           (tenant_id,))
            leaders = {int(row[0]): None if row[1] is None else int(row[1]) for row in cursor.fetchall()}
            cursor.execute('SELECT template_id, COUNT(*) FROM oa_contract WHERE tenant_id=%s '
                           'AND deleted=0 AND template_id IS NOT NULL GROUP BY template_id', (tenant_id,))
            template_counts = {int(row[0]): int(row[1]) for row in cursor.fetchall()}
        frontend = session.get(ENTRY + '/', timeout=(5, 15), allow_redirects=False)
        if frontend.status_code != 200 or '<html' not in frontend.text.lower():
            raise RuntimeError('Frontend entry did not return the expected HTML')
        passed('frontend_entry', http_status=frontend.status_code)

        challenge = api(session, 'GET', '/auth/captcha/slider')
        verified = api(session, 'POST', '/auth/captcha/check', json={
            'uuid': challenge['uuid'], 'x': captcha_support.captcha_position(challenge)})
        release = api(session, 'GET', '/auth/legal/public/active', params={'tenantCode': args.tenant_code})
        login = api(session, 'POST', '/auth/login', json={
            'tenantCode': args.tenant_code, 'username': os.environ['CLOUDFLOW_TEST_ADMIN_USERNAME'],
            'password': os.environ['CLOUDFLOW_TEST_ADMIN_PASSWORD'],
            'captchaToken': verified['passToken'], 'legalReleaseCode': release['releaseCode']})
        if not isinstance(login, dict) or not login.get('token') or login.get('requiresTotp'):
            raise RuntimeError('Login did not return a usable session')
        session.headers['Authorization'] = 'Bearer ' + login['token'].removeprefix('Bearer ')
        signed_in = True
        csrf = session.cookies.get('XSRF-TOKEN')
        if csrf:
            session.headers['X-CSRF-Token'] = csrf
        if bool(login.get('forcePasswordChange')) != password_change_required:
            raise RuntimeError('Login password-change flag differs from the stored account policy')
        passed('real_captcha_login', force_password_change=password_change_required)

        info = api(session, 'GET', '/auth/info')
        user = info.get('user', {}) if isinstance(info, dict) else {}
        if number(user.get('userId'), 'Account') != user_id or number(user.get('tenantId'), 'Tenant') != tenant_id:
            raise RuntimeError('Authenticated account/tenant differs from the selected database identity')
        passed('account_tenant_identity')

        for label, path, id_key, leader_key in (
            ('auth_department_tree', '/auth/system/dept/tree', 'deptId', 'leaderUserId'),
            ('oa_contact_department_tree', '/oa/contact/dept/tree', 'dept_id', 'leader_user_id')):
            rows = tree_rows(api(session, 'GET', path))
            if not rows:
                raise RuntimeError(label + ': no seeded departments')
            assigned = 0
            for row in rows:
                identifier = number(row.get(id_key), label)
                if identifier not in leaders:
                    raise RuntimeError(label + ': department is outside the selected tenant')
                expected = leaders[identifier]
                actual = row.get(leader_key)
                if (None if actual is None else number(actual, label)) != expected:
                    raise RuntimeError(label + ': leader identifier differs from its stored reference')
                assigned += expected is not None
            if assigned == 0:
                raise RuntimeError(label + ': seeded leader references are required')
            passed(label, rows=len(rows), assigned_leaders=assigned)

        standards = page_rows(api(session, 'GET', '/oa/expense/standard/page',
                                 params={'pageNum': 1, 'pageSize': 10}), 'records', 'Expense standards')
        for row in standards:
            if number(row.get('tenantId'), 'Expense standard tenant') != tenant_id:
                raise RuntimeError('Expense standard belongs to another tenant')
            if row.get('limitType') not in ('PER_ITEM', 'DAILY', 'MONTHLY', 'YEARLY'):
                raise RuntimeError('Expense standard uses an unsupported limit period')
        passed('expense_standards', rows=len(standards), periods=sorted({row['limitType'] for row in standards}))

        templates = page_rows(api(session, 'GET', '/oa/contract/template/page',
                                 params={'pageNum': 1, 'pageSize': 10}), 'records', 'Contract templates')
        for row in templates:
            if number(row.get('tenantId'), 'Contract template tenant') != tenant_id:
                raise RuntimeError('Contract template belongs to another tenant')
            identifier = number(row.get('id'), 'Contract template')
            if number(row.get('usageCount'), 'Template usage') != template_counts.get(identifier, 0):
                raise RuntimeError('Contract template usage does not match actual same-tenant contracts')
        passed('contract_template_actual_usage', rows=len(templates))

        for label, path in (
            ('hr_recruitment_candidates', '/hr/recruitment/candidates'),
            ('workflow_definitions', '/workflow/wf/definitions'),
            ('workflow_startable_definitions', '/workflow/wf/startable-definitions')):
            rows = page_rows(api(session, 'GET', path, params={'pageNum': 1, 'pageSize': 10}), 'rows', label)
            passed(label, rows=len(rows))
    except Exception as exc:
        failure = exc
        result['status'] = 'FAILED'
        result['failure_type'] = type(exc).__name__
        # Only our deliberately sanitized errors are emitted; library messages may contain secrets.
        result['failure'] = str(exc) if isinstance(exc, RuntimeError) else 'Check failed; inspect the selected step without logging credentials'
    finally:
        try:
            if signed_in:
                old_authorization = session.headers['Authorization']
                api(session, 'POST', '/auth/logout')
                signed_in = False
                passed('logout')
                with client() as revoked:
                    revoked.headers['Authorization'] = old_authorization
                    response = revoked.get(ENTRY + '/api/auth/info', timeout=(5, 15), allow_redirects=False)
                    if response.status_code != 401:
                        raise RuntimeError('Logged-out bearer token was not rejected with HTTP 401')
                passed('revoked_token_rejected', http_status=401)
        except Exception as exc:
            if failure is None:
                failure = exc
            result['status'] = 'FAILED'
            result['logout_failure_type'] = type(exc).__name__
            result['logout_failure'] = str(exc) if isinstance(exc, RuntimeError) else 'Logout/revocation check failed'
        finally:
            session.close()
            if db is not None:
                db.close()
            if ssh is not None:
                ssh.close()
        if failure is None:
            result['status'] = 'PASS'
        result['finished_at'] = datetime.now(timezone.utc).isoformat()
        print(json.dumps(result, ensure_ascii=False, indent=2))
    if failure is not None:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
