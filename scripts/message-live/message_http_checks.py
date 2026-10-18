"""Actual channel, personal-message and announcement HTTP acceptance."""
import base64
import hashlib
import json
import os
import secrets
import time

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import requests
import message_business_checks
import message_system_checks
import message_record_http_checks
import message_record_browser_checks
import message_center_browser_checks
import message_subscribe_browser_checks
import message_announcement_browser_checks
import message_realtime_browser_checks


def run(context, connection, admin_token, shared):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    directory, services = context['RUN'], context['SERVICES']
    prefix = 'A2HTTP-' + context['ROUND']
    base = 'http://127.0.0.1:' + str(services['auth1']['port'])
    accounts = json.loads((directory / 'private/accounts.json').read_text(encoding='utf-8'))
    clients = {}
    responses = []
    secret_values = [secrets.token_hex(24), secrets.token_hex(24)]

    def client(token):
        session = requests.Session()
        session.trust_env = False
        session.cookies.update(context['SESSION'].cookies)
        if session.cookies.get('Authorization') != token:
            raise AssertionError('login cookie and returned token must match')
        csrf = session.cookies.get('XSRF-TOKEN')
        if not csrf:
            raise AssertionError('login must issue the project CSRF cookie')
        session.headers['X-CSRF-Token'] = csrf
        return session

    clients['admin'] = client(admin_token)

    def request(path, body=None, method='GET', user='admin', endpoint=base, denied=False, expected_error=None):
        response = clients[user].request(method, endpoint + path, json=body, timeout=20)
        document = response.json()
        responses.append(json.dumps(document, ensure_ascii=False))
        if expected_error is not None:
            check(response.status_code in (200, 400, 409)
                  and document.get('code') == expected_error[0]
                  and document.get('msg') == expected_error[1],
                  method + ' ' + path + ' rejects with expected business error')
            return document
        if denied:
            check(response.status_code in (200, 403, 404) and document.get('code') in (403, 404),
                  user + ' denied access to ' + path)
            return document
        response.raise_for_status()
        check(document.get('code') == 200, method + ' ' + path + ' accepted')
        return document.get('data')

    try:
        channel_path = '/system/message/channel'
        body = {'channelType': 'SMS', 'channelCode': prefix + '-sms', 'channelName': prefix + '-sms',
                'apiKey': 'owned-api-key', 'apiSecret': secret_values[0], 'smtpPwd': secret_values[1],
                'provider': 'ACCEPTANCE_ONLY', 'endpoint': 'http://127.0.0.1:1',
                'priority': 1, 'retryCount': 0, 'retryIntervalSec': 1, 'status': 'ENABLED'}
        request(channel_path, body, 'POST')
        channel_id = sql("SELECT channel_id FROM cloud_flow_db.sys_message_channel WHERE channel_code='"
                         + body['channelCode'] + "' AND tenant_id=100000 AND deleted=0;")
        check(channel_id.isdigit(), 'HTTP create persists exactly owned channel')
        detail = request(channel_path + '/' + channel_id)
        check(detail['apiSecret'] == '****' + secret_values[0][-4:]
              and detail['smtpPwd'] == '****' + secret_values[1][-4:], 'HTTP detail masks both secrets')
        check(not any('cipher' in key.lower() for key in detail), 'HTTP exposes no encrypted secret fields')
        page = request(channel_path + '/list?channelType=SMS&pageNum=1&pageSize=200')
        listed = next(row for row in page['rows'] if str(row['channelId']) == channel_id)
        check(listed['apiSecret'] == detail['apiSecret'] and listed['smtpPwd'] == detail['smtpPwd'],
              'HTTP list masks both secrets')
        encrypted = sql('SELECT CONCAT(api_secret_cipher,CHAR(9),smtp_pwd_cipher) '
                        'FROM cloud_flow_db.sys_message_channel WHERE channel_id=' + channel_id + ';').split('\t')
        # mysql batch escapes embedded TAB as two printable characters.
        if len(encrypted) == 1:
            encrypted = encrypted[0].split('\\t')
        key = hashlib.sha256(shared['cloudflow.message.secret-key'].encode()).digest()
        check(len(encrypted) == 2, 'both encrypted secret columns present')
        for value, original in zip(encrypted, secret_values):
            payload = base64.b64decode(value, validate=True)
            check(value != original and AESGCM(key).decrypt(payload[:12], payload[12:], None).decode() == original,
                  'database secret decrypts to submitted value without plaintext storage')
        request(channel_path, {**body, 'channelId': channel_id, 'channelName': prefix + '-edited',
                              'apiSecret': detail['apiSecret'], 'smtpPwd': detail['smtpPwd']}, 'PUT')
        after = sql('SELECT CONCAT(api_secret_cipher,CHAR(9),smtp_pwd_cipher) '
                    'FROM cloud_flow_db.sys_message_channel WHERE channel_id=' + channel_id + ';')
        check(after == '\t'.join(encrypted) or after == '\\t'.join(encrypted),
              'masked edit preserves original ciphertext for both secrets')
        result = request(channel_path + '/' + channel_id + '/test', {}, 'POST')
        check(result['success'] is False and result['message'] == '渠道未实现',
              'unimplemented SMS test gives explicit failure')

        email_body = {'channelType': 'EMAIL', 'channelCode': prefix + '-email',
                      'channelName': prefix + '-email', 'smtpHost': '127.0.0.1', 'smtpPort': 1,
                      'smtpSslFlag': 1, 'smtpUsername': 'owned@example.invalid', 'smtpPwd': secret_values[1],
                      'fromAddress': 'owned@example.invalid', 'status': 'DISABLED'}
        request(channel_path, email_body, 'POST')
        email_id = sql("SELECT channel_id FROM cloud_flow_db.sys_message_channel WHERE channel_code='"
                       + email_body['channelCode'] + "' AND tenant_id=100000 AND deleted=0;")
        email = request(channel_path + '/' + email_id)
        check(email['implementedFlag'] == 1 and email['smtpPwd'] == '****' + secret_values[1][-4:]
              and email['smtpHost'] == '127.0.0.1' and email['smtpPort'] == 1
              and email['smtpSslFlag'] == 1 and email['fromAddress'] == email_body['fromAddress'],
              'implemented EMAIL fields persist with masked credential')
        result = request(channel_path + '/' + email_id + '/test', {}, 'POST')
        check(result['success'] is False and 'SMTP连接失败' in result['message'],
              'disabled EMAIL returns current adapter failure without external connection')
        context['sdk']('sms', 1, prefix + '-unsupported')
        wait(lambda: sql("SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE biz_id='"
                         + prefix + "-unsupported-0' AND channel_type='SMS' AND send_status='FAILED' "
                         "AND error_msg IS NOT NULL AND error_msg<>'';") == '1', 30, 'unsupported SMS FAILED record')
        check(True, 'SDK unsupported SMS creates FAILED record with error reason')

        for username, key_name in [('g_import_other', 'other'), ('g_import_tenant', 'tenant')]:
            context['SESSION'].cookies.clear()
            token = context['login'](base, next(item for item in accounts if item['username'] == username))
            clients[key_name] = client(token)
        request(channel_path + '/' + channel_id, user='tenant', denied=True)
        tenant_page = request(channel_path + '/list?pageSize=200', user='tenant')
        check(all(str(row['channelId']) not in (channel_id, email_id) for row in tenant_page['rows']),
              'tenant channel list excludes other tenant credentials')
        request(channel_path, {**body, 'channelId': channel_id}, 'PUT', user='tenant', denied=True)

        mine_path = '/system/message/mine'
        before_count = request(mine_path + '/unread-count')
        message_prefix = prefix + '-mine'
        context['sdk']('send', 1, message_prefix)
        context['receive_titles'](connection, message_prefix, 1)
        page = request(mine_path + '?category=SYSTEM&readFlag=0&pageSize=200')
        message = next(row for row in page['rows'] if row['title'] == message_prefix + '-0')
        record_id = str(message['recordId'])
        check(message['messageCategory'] == 'SYSTEM' and message['readFlag'] == 0
              and isinstance(message['createTime'], str), 'mine returns real delivered unread message and timestamp')
        counts = request(mine_path + '/unread-count')
        check(counts['SYSTEM'] == before_count['SYSTEM'] + 1 and counts['TOTAL'] == before_count['TOTAL'] + 1
              and counts['TOTAL'] == sum(counts[category] for category in ('TODO', 'CC', 'ANNOUNCEMENT', 'SYSTEM', 'BIZ_REMINDER')),
              'unread totals and category counts match actual delivery')
        check(request(mine_path + '/' + record_id)['title'] == message['title'], 'mine detail matches delivered record')
        for user in ('other', 'tenant'):
            request(mine_path + '/' + record_id, user=user, denied=True)
            other_page = request(mine_path + '?pageSize=200', user=user)
            check(all(str(row['recordId']) != record_id for row in other_page['rows']),
                  user + ' mine list excludes another user message')
            request(mine_path + '/read', {'recordIds': [record_id]}, 'PUT', user=user)
            check(sql('SELECT read_flag FROM cloud_flow_db.sys_message_record WHERE record_id=' + record_id + ';') == '0',
                  user + ' cannot mark another user message read')
        request(mine_path + '/read', {'recordIds': [record_id]}, 'PUT')
        check(request(mine_path + '/' + record_id)['readFlag'] == 1, 'owner marks own message read')
        check(request(mine_path + '/unread-count') == before_count, 'read action restores unread category totals')
        request(mine_path + '/read', {'recordIds': [record_id]}, 'PUT')
        check(request(mine_path + '/unread-count') == before_count, 'repeated read is idempotent')

        announcement_prefix = prefix + '-announcement'
        announcement_body = {'title': announcement_prefix + '-0', 'content': 'Actual business announcement acceptance',
                             'type': '2', 'scopeType': 'ALL', 'priority': 'M', 'isTop': 0}
        oa_base = 'http://127.0.0.1:' + str(services['oa']['port'])
        check(request('/announcement/publish', announcement_body, 'POST', endpoint=oa_base) is True,
              'actual OA announcement published by HTTP')
        announcement_id = sql("SELECT announcement_id FROM cloud_flow_db.oa_announcement WHERE title='"
                              + announcement_body['title'] + "' AND tenant_id=100000 AND status='1';")
        check(announcement_id.isdigit(), 'actual published announcement persisted')
        context['receive_titles'](connection, announcement_prefix, 1)
        page = request(mine_path + '?category=ANNOUNCEMENT&readFlag=0&pageSize=200')
        announcement = next(row for row in page['rows'] if row['bizId'] == announcement_id)
        check(announcement['title'] == announcement_body['title'] and announcement['bizType'] == 'OA_ANNOUNCEMENT'
              and announcement['sendStatus'] == 'SUCCESS' and announcement['linkUrl'] == '/announcement',
              'actual announcement appears in personal message center with business identity')
        other_page = request(mine_path + '?category=ANNOUNCEMENT&pageSize=200', user='other')
        check(any(row['bizId'] == announcement_id for row in other_page['rows']),
              'announcement reaches another real same-tenant reader')
        tenant_page = request(mine_path + '?category=ANNOUNCEMENT&pageSize=200', user='tenant')
        check(all(row['bizId'] != announcement_id for row in tenant_page['rows']),
              'announcement excludes cross-tenant reader')
        request(mine_path + '/read', {'recordIds': [announcement['recordId']]}, 'PUT')
        check(request(mine_path + '/' + str(announcement['recordId']))['readFlag'] == 1,
              'actual announcement message can be marked read')
        record_proof = message_record_http_checks.run(context, request, clients, client, accounts)
        record_browser_proof = (message_record_browser_checks.run(context, clients)
                                if os.environ.get('CLOUDFLOW_RECORD_BROWSER') == '1' else None)
        center_browser_proof = (message_center_browser_checks.run(context, clients, request)
                                if os.environ.get('CLOUDFLOW_CENTER_BROWSER') == '1' else None)
        subscribe_browser_proof = (message_subscribe_browser_checks.run(context, clients, request)
                                   if os.environ.get('CLOUDFLOW_SUBSCRIBE_BROWSER') == '1' else None)
        announcement_browser_proof = (message_announcement_browser_checks.run(context, clients, request)
                                      if os.environ.get('CLOUDFLOW_ANNOUNCEMENT_BROWSER') == '1' else None)
        realtime_browser_proof = (message_realtime_browser_checks.run(context, clients, request)
                                  if os.environ.get('CLOUDFLOW_REALTIME_BROWSER') == '1' else None)
        system_proof = message_system_checks.run(context, connection, request)
        business_proof = message_business_checks.run(context, connection, request, accounts)
        business_proof.update(system_proof)
        business_proof.update(message_business_checks.hr_approvals(context, request, clients))
        business_proof.update(message_business_checks.hr_approvals(context, request, clients, action='REJECT'))
        business_proof.update(message_business_checks.login_risk(
                context, connection, request, accounts, clients, client))
        business_proof.update(message_business_checks.password_reset(
                context, request, accounts, clients, client))

        wait(lambda: int(sql("SELECT COUNT(*) FROM cloud_flow_db.sys_log WHERE request_uri LIKE '%/system/message/channel%';")) >= 3,
             30, 'channel operation logs persisted')
        wait(lambda: int(sql("SELECT COUNT(*) FROM cloud_flow_db.sys_audit_log WHERE audit_name IN ('新增消息渠道','修改消息渠道');")) >= 3,
             30, 'channel audit logs persisted')
        check(True, 'actual channel operation and audit logs exist before plaintext inspection')
        log_data = [sql('SELECT * FROM cloud_flow_db.sys_log;'), sql('SELECT * FROM cloud_flow_db.sys_audit_log;')]
        for pattern in ('*.stdout.log', '*.stderr.log'):
            log_data.extend(path.read_text(encoding='utf-8', errors='replace') for path in directory.glob(pattern))
        check(all(secret not in text for secret in secret_values for text in responses), 'all HTTP responses omit secret plaintext')
        check(all(secret not in text for secret in secret_values for text in log_data),
              'actual stdout stderr operation and audit logs omit secret plaintext')
        (directory / 'http-proof.json').write_text(json.dumps({'scope': 'http', 'channelSecrets': 'masked/encrypted/no plaintext',
                'mine': 'four endpoints, category totals, read idempotency and tenant/user boundaries',
                'announcement': 'actual OA HTTP to outbox Redis record WebSocket and personal message API',
                'business': business_proof, 'centerBrowser': center_browser_proof,
                'subscribeBrowser': subscribe_browser_proof,
                'announcementBrowser': announcement_browser_proof,
                'realtimeBrowser': realtime_browser_proof,
                'records': record_proof,
                'recordBrowser': record_browser_proof,
                'notices': context['NOTICES'], 'formalProviderTested': False}, ensure_ascii=False, indent=2), encoding='utf-8')
    finally:
        for session in clients.values():
            session.close()
