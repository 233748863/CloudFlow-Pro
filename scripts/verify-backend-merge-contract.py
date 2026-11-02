"""Verify merged backend contracts against the selected development deployment.
Required env: CF_SERVER, CF_REDIS_PASSWORD, CF_DB_PASSWORD.
Optional: CF_DEMO_TENANT_CODE (xinghe), CF_DEMO_USERNAME (admin),
CF_DEMO_PASSWORD (123456), CF_GATEWAY_PORT (18080).
Writes only uniquely marked test rows; retains all audit and login records.
"""
import hashlib
import os
import uuid
from decimal import Decimal

import pymysql
import redis
import requests


def require(condition, message):
    if not condition:
        raise AssertionError(message)


class ContractSmoke:
    def __init__(self):
        self.host = os.environ['CF_SERVER']
        self.base = 'http://' + self.host + ':' + os.getenv('CF_GATEWAY_PORT', '18080') + '/api'
        self.session = requests.Session()
        self.session.trust_env = False
        self.cache = redis.Redis(host=self.host, password=os.environ['CF_REDIS_PASSWORD'],
                                 db=10, decode_responses=True, socket_timeout=15)
        self.db = pymysql.connect(host=self.host, user='root', password=os.environ['CF_DB_PASSWORD'],
                                  database='cloud_flow_db', autocommit=True, charset='utf8mb4',
                                  connect_timeout=15, read_timeout=30, write_timeout=30)
        self.marker = 'merge-contract-' + uuid.uuid4().hex
        self.email = self.marker + '@example.test'
        self.tenant_id = None
        self.other_tenant_id = None
        self.logged_in = False
        self.periods = ('PER_ITEM', 'DAILY', 'MONTHLY', 'YEARLY')
        self.remarks = tuple(self.marker + '-' + period for period in self.periods) + (self.marker + '-foreign',)
        self.candidate_id = None
        self.standards = []

    def request(self, method, path, payload=None, params=None):
        csrf = self.session.cookies.get('XSRF-TOKEN')
        if csrf:
            self.session.headers['X-CSRF-Token'] = csrf
        response = self.session.request(method, self.base + path, json=payload, params=params, timeout=30)
        body = response.json()
        return response.status_code, body

    def call(self, method, path, payload=None, params=None):
        status, body = self.request(method, path, payload, params)
        require(status == 200 and body.get('code') == 200,
                f'{method} {path}: HTTP {status}, code={body.get("code")}, message={body.get("msg")}')
        return body.get('data')

    def sql_one(self, sql, values=()):
        with self.db.cursor() as cursor:
            cursor.execute(sql, values)
            return cursor.fetchone()

    def login(self):
        tenant_code = os.getenv('CF_DEMO_TENANT_CODE', 'xinghe')
        tenant = self.sql_one('SELECT tenant_id FROM sys_tenant WHERE tenant_code=%s AND deleted=0 AND status=%s',
                              (tenant_code, '0'))
        require(tenant is not None and tenant[0] != 100000, 'Use an existing non-default demo tenant')
        self.tenant_id = tenant[0]
        other = self.sql_one('SELECT tenant_id FROM sys_tenant WHERE tenant_id<>%s AND deleted=0 AND status=%s ORDER BY tenant_id LIMIT 1',
                             (self.tenant_id, '0'))
        require(other is not None, 'A second tenant is required for isolation verification')
        self.other_tenant_id = other[0]
        options = self.call('GET', '/auth/tenant/options')
        require(isinstance(options, list) and len(options) > 1, 'Tenant options are missing')
        legal = self.call('GET', '/auth/legal/public/active', params={'tenantCode': tenant_code})
        captcha = self.call('GET', '/auth/captcha/slider')
        answer = self.cache.get('CAPTCHA:CODE:' + captcha['uuid'])
        require(answer is not None, 'Slider challenge is missing from Redis 10')
        passed = self.call('POST', '/auth/captcha/check', {'uuid': captcha['uuid'], 'x': int(answer)})
        require(bool(passed.get('passToken')), 'Captcha response has no passToken')
        auth = self.call('POST', '/auth/login', {
            'username': os.getenv('CF_DEMO_USERNAME', 'admin'),
            'password': os.getenv('CF_DEMO_PASSWORD', '123456'),
            'tenantCode': tenant_code, 'captchaToken': passed['passToken'],
            'legalReleaseCode': legal['releaseCode'],
        })
        require(bool(auth.get('token')), 'Login did not issue a token')
        self.session.headers['Authorization'] = 'Bearer ' + auth['token']
        self.logged_in = True
        info = self.call('GET', '/auth/info')
        require(int(info['user']['tenantId']) == self.tenant_id, 'Login tenant differs from chosen demo tenant')
        print('PASS real captcha/login; tenant=' + str(self.tenant_id), flush=True)

    def check_departments(self):
        nodes = self.call('GET', '/auth/system/dept/tree')
        seen = 0
        pending = list(nodes)
        while pending:
            department = pending.pop()
            leader = department.get('leaderUserId')
            if leader is not None:
                require(bool(department.get('leaderName')), 'Department leader name is missing')
                active = self.sql_one("SELECT COUNT(*) FROM sys_user WHERE user_id=%s AND tenant_id=%s AND deleted=0 AND status='0'",
                                      (int(leader), self.tenant_id))
                require(active[0] == 1, 'Department leader is not an active user in the current tenant')
                seen += 1
            pending.extend(department.get('children') or [])
        require(seen > 0, 'No configured department leader was exercised')
        print('PASS department leader IDs and names; count=' + str(seen), flush=True)

    def check_candidate(self):
        page = self.call('GET', '/hr/recruitment/requisitions', params={'pageNum': 1, 'pageSize': 50})
        rows = page['rows']
        require(bool(rows), 'Recruitment requisitions are missing')
        require('requisitionNo' in rows[0] and 'requestNo' not in rows[0], 'Recruitment fields are not canonical')
        requisition = next((row for row in rows if row.get('status') == 'RECRUITING'), None)
        require(requisition is not None, 'No recruiting requisition is available for the candidate page flow')
        payload = {'candidateNo': self.marker, 'name': self.marker, 'requisitionId': requisition['id'],
                   'gender': 'MALE', 'email': self.email, 'phone': None, 'source': 'WEBSITE',
                   'channelId': None, 'resumeAttachmentUrls': [], 'status': 'SCREENING'}
        self.candidate_id = int(self.call('POST', '/hr/recruitment/candidates', payload))
        row = self.sql_one('SELECT source,channel_id,tenant_id,email FROM hr_candidate WHERE id=%s AND candidate_no=%s',
                           (self.candidate_id, self.marker))
        require(row == ('WEBSITE', None, self.tenant_id, self.email), 'Candidate persistence differs from submitted canonical values')
        identity_hash = hashlib.sha256(f'{self.tenant_id}:EMAIL:{self.email}'.encode()).hexdigest()
        owner = self.sql_one('SELECT candidate_id,referral_id FROM hr_recruitment_identity WHERE tenant_id=%s AND identity_type=%s AND identity_hash=%s',
                             (self.tenant_id, 'EMAIL', identity_hash))
        require(owner == (self.candidate_id, None), 'Candidate EMAIL identity ownership is missing or incorrect')
        page = self.call('GET', '/hr/recruitment/candidates', params={'keyword': self.marker, 'pageNum': 1, 'pageSize': 50})
        matched = [row for row in page['rows'] if int(row['id']) == self.candidate_id]
        require(len(matched) == 1, 'Created candidate was not returned exactly once')
        candidate = matched[0]
        require(candidate['source'] == 'WEBSITE' and candidate.get('channelId') is None, 'Source/channel response differs')
        require(candidate['resumeAttachmentUrls'] == [], 'Candidate attachment array contract differs')
        print('PASS independent WEBSITE source, optional channel, array attachments and tenant-bound EMAIL identity', flush=True)

    def check_expense(self):
        for index, period in enumerate(self.periods):
            payload = {'category': 'TRAVEL', 'city': '杭州', 'positionLevel': 'P3', 'limitAmount': 500 + index,
                       'limitType': period, 'remark': self.remarks[index]}
            if index == 1:
                payload['tenantId'] = self.other_tenant_id
            self.call('POST', '/oa/expense/standard', payload)
            row = self.sql_one('SELECT standard_id,tenant_id FROM oa_expense_standard WHERE remark=%s', (payload['remark'],))
            require(row is not None and row[1] == self.tenant_id, 'Expense creation trusted body tenant')
            self.standards.append(row[0])
            result = self.call('GET', '/oa/expense/standard/' + str(row[0]))
            require(result['limitType'] == period and result['city'] == '杭州', 'Expense city or period changed')
        result = self.call('GET', '/oa/expense/standard/' + str(self.standards[0]))
        result['tenantId'] = self.other_tenant_id
        result['city'] = '上海'
        self.call('PUT', '/oa/expense/standard', result)
        actual = self.call('GET', '/oa/expense/standard/' + str(self.standards[0]))
        require(int(actual['tenantId']) == self.tenant_id and actual['city'] == '上海', 'Expense update changed tenant ownership')
        # A disposable foreign record prevents any mutation of pre-existing business data on failure.
        with self.db.cursor() as cursor:
            cursor.execute('INSERT INTO oa_expense_standard (tenant_id,category,city,limit_amount,limit_type,status,remark,deleted,version,create_by,update_by) '
                           'VALUES (%s,%s,%s,%s,%s,%s,%s,0,0,%s,%s)',
                           (self.other_tenant_id, 'TRAVEL', '北京', 777, 'PER_ITEM', 'ACTIVE', self.remarks[4], self.marker, self.marker))
            foreign_id = cursor.lastrowid
        require(self.call('GET', '/oa/expense/standard/' + str(foreign_id)) is None, 'Foreign expense record was disclosed')
        status, denied = self.request('PUT', '/oa/expense/standard', {
            'standardId': foreign_id, 'tenantId': self.other_tenant_id, 'version': 0,
            'limitAmount': 999, 'city': '越租户验收',
        })
        require(status in (200, 400, 403, 404) and denied.get('code') not in (200, 401),
                'Cross-tenant update did not produce an authenticated business denial')
        preserved = self.sql_one('SELECT tenant_id,city,limit_amount,version FROM oa_expense_standard WHERE standard_id=%s AND remark=%s',
                                 (foreign_id, self.remarks[4]))
        require(preserved == (self.other_tenant_id, '北京', Decimal('777.00'), 0), 'Foreign test row was changed')
        for standard_id in self.standards:
            self.call('DELETE', '/oa/expense/standard/' + str(standard_id))
            row = self.sql_one('SELECT deleted FROM oa_expense_standard WHERE standard_id=%s AND tenant_id=%s',
                               (standard_id, self.tenant_id))
            require(row == (1,), 'Expense deletion was not persisted')
        print('PASS expense city, four periods, create/update tenant ownership, foreign access denial and delete', flush=True)

    def cleanup(self):
        if self.tenant_id is None:
            return
        # Exact run identity only. Do not delete any audit/login rows or other tenant data.
        self.db.begin()
        try:
            with self.db.cursor() as cursor:
                cursor.execute('SELECT id FROM hr_candidate WHERE tenant_id=%s AND candidate_no=%s AND name=%s AND email=%s FOR UPDATE',
                               (self.tenant_id, self.marker, self.marker, self.email))
                candidates = cursor.fetchall()
                for (candidate_id,) in candidates:
                    cursor.execute('SELECT referral_id FROM hr_employee_referral WHERE tenant_id=%s AND candidate_id=%s',
                                   (self.tenant_id, candidate_id))
                    require(cursor.fetchone() is None, 'Candidate acquired a referral; retain it for review')
                    identity_hash = hashlib.sha256(f'{self.tenant_id}:EMAIL:{self.email}'.encode()).hexdigest()
                    cursor.execute('DELETE FROM hr_recruitment_identity WHERE tenant_id=%s AND candidate_id=%s AND referral_id IS NULL AND identity_type=%s AND identity_hash=%s',
                                   (self.tenant_id, candidate_id, 'EMAIL', identity_hash))
                    cursor.execute('DELETE FROM hr_candidate WHERE id=%s AND tenant_id=%s AND candidate_no=%s AND name=%s AND email=%s',
                                   (candidate_id, self.tenant_id, self.marker, self.marker, self.email))
                for remark in self.remarks:
                    cursor.execute('SELECT standard_id,tenant_id FROM oa_expense_standard WHERE tenant_id IN (%s,%s) AND remark=%s FOR UPDATE',
                                   (self.tenant_id, self.other_tenant_id, remark))
                    standards = cursor.fetchall()
                    require(len(standards) <= 1, 'Run marker matched multiple expense rows; retain for review')
                    for standard_id, tenant_id in standards:
                        cursor.execute('DELETE FROM oa_expense_standard WHERE standard_id=%s AND tenant_id=%s AND remark=%s',
                                       (standard_id, tenant_id, remark))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        print('CLEANED this run candidate/EMAIL identity/expense rows; audit retained; marker=' + self.marker, flush=True)

    def logout(self):
        if self.logged_in:
            self.call('POST', '/auth/logout')
            status, body = self.request('GET', '/auth/info')
            require(status == 401 or body.get('code') == 401, 'Logout did not revoke the token')
            self.logged_in = False
            print('PASS logout and token revocation', flush=True)

    def run(self):
        print('run marker=' + self.marker, flush=True)
        try:
            self.login()
            self.check_departments()
            self.check_candidate()
            self.check_expense()
        finally:
            try:
                self.cleanup()
            finally:
                try:
                    self.logout()
                finally:
                    self.db.close()
                    self.cache.close()
                    self.session.close()
        print('ALL CONTRACT CHECKS PASSED', flush=True)


if __name__ == '__main__':
    ContractSmoke().run()
