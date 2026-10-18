"""Actual business HTTP triggers for A2; never substitute a direct message SDK call."""
import base64
from datetime import date, datetime, timedelta
import hashlib
import hmac
import json
import secrets
import struct
import time

import websocket


def security(context, connection, request, accounts):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    mine = '/system/message/mine'
    password = next(item['password'] for item in accounts if item['username'] == 'g_import_admin')
    wrong_password = 'Wrong7a' + secrets.token_hex(12)
    query = ("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'status',send_status,"
             "'category',message_category,'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) "
             "FROM cloud_flow_db.sys_message_record WHERE biz_type='SYS_SECURITY_CHANGE' "
             "AND biz_id='990000701' ORDER BY record_id;")

    def records():
        return [json.loads(line) for line in sql(query).splitlines() if line]

    def state():
        return sql("SELECT HEX(JSON_OBJECT('id',id,'tenant',tenant_id,'user',user_id,"
                   "'secret',secret_ciphertext,'enabled',enabled,'enabledAt',enabled_at,"
                   "'lastUsedStep',last_used_step,'updated',update_time)) "
                   'FROM cloud_flow_db.sys_user_totp WHERE tenant_id=100000 AND user_id=990000701;')

    def audits():
        query = ("SELECT HEX(JSON_OBJECT('field',audit_field,'before',before_val,'after',after_val,"
                 "'operator',create_by,'highRisk',high_risk,'riskLevel',risk_level)) "
                 "FROM cloud_flow_db.sys_audit_log WHERE audit_name='禁用双因素认证' "
                 "AND tenant_id=100000 ORDER BY audit_id;")
        return [json.loads(bytes.fromhex(line).decode('utf-8')) for line in sql(query).splitlines() if line]

    def rejected(path, body, error, label):
        before_state, before_records, before_audits = state(), records(), audits()
        request('/profile/totp/' + path, body, 'POST', expected_error=error)
        check(state() == before_state and records() == before_records,
              label + ' preserves exact authenticator state and creates no security message')
        check(audits() == before_audits, label + ' creates no successful security disable audit')

    status = request('/profile/totp/status')
    check(status['featureEnabled'] is True and status['enabled'] is False,
          'owned account starts with available and disabled two-factor authentication')
    check(not state() and not records(), 'owned account starts without authenticator state or security messages')
    rejected('setup', {'password': wrong_password}, (400, '当前密码错误'), 'wrong setup password')
    setup = request('/profile/totp/setup', {'password': password}, 'POST')
    secret = setup['manualEntryKey']
    key = base64.b32decode(secret + '=' * (-len(secret) % 8))

    def code_for(step):
        digest = hmac.new(key, struct.pack('>Q', step), hashlib.sha1).digest()
        offset = digest[-1] & 15
        return str((struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7fffffff) % 1000000).zfill(6)

    check(bool(state()) and not records() and request('/profile/totp/status')['enabled'] is False,
          'setup alone persists disabled authenticator and sends no security change notice')
    rejected('enable', {'password': wrong_password, 'code': code_for(int(time.time()) // 30)},
             (400, '当前密码错误'), 'wrong enable password')
    # Exclude every valid adjacent step, including one extra step for clock-boundary crossing.
    step = int(time.time()) // 30
    adjacent = {code_for(step + drift) for drift in range(-2, 3)}
    invalid_code = next(str(value).zfill(6) for value in range(1000000) if str(value).zfill(6) not in adjacent)
    rejected('enable', {'password': password, 'code': invalid_code},
             (400, '验证码错误，请重试'), 'invalid authenticator code')

    subscriptions = '/system/message/subscribe/mine'
    baseline = request(subscriptions)
    disabled_settings = [dict(row) for row in baseline]
    system_setting = next(row for row in disabled_settings
                          if row['messageCategory'] == 'SYSTEM' and row['channelType'] == 'INTERNAL')
    system_setting.update(enabledFlag=0, quietStart=None, quietEnd=None)
    try:
        request(subscriptions, disabled_settings, 'PUT')
        saved = next(row for row in request(subscriptions)
                     if row['messageCategory'] == 'SYSTEM' and row['channelType'] == 'INTERNAL')
        check(saved['enabledFlag'] == 0
              and sql("SELECT enabled_flag FROM cloud_flow_db.sys_message_subscribe WHERE tenant_id=100000 "
                      "AND user_id=990000701 AND message_category='SYSTEM' AND channel_type='INTERNAL';") == '0',
              'security owner disables SYSTEM INTERNAL subscription through actual HTTP and database')
        enabled = request('/profile/totp/enable',
                          {'password': password, 'code': code_for(int(time.time()) // 30)}, 'POST')
        check(enabled['enabled'] is True and request('/profile/totp/status')['enabled'] is True,
              'actual two-factor enable HTTP persists enabled account state')
        wait(lambda: len(records()) == 1 and records()[0]['status'] == 'SUCCESS',
             30, 'security enable bypasses actual disabled subscription immediately')
        check(records()[0]['title'] == '双因素认证已开启',
              'forced enable notice succeeds while SYSTEM INTERNAL subscription is disabled')
        rejected('enable', {'password': password, 'code': code_for(int(time.time()) // 30)},
                 (409, '双因素认证已启用'), 'repeated enable')
        rejected('setup', {'password': password}, (409, '双因素认证已启用'), 'setup while enabled')
        rejected('disable', {'password': wrong_password}, (400, '当前密码错误'), 'wrong disable password')

        now = datetime.now()
        quiet_start = (now - timedelta(hours=2)).strftime('%H:%M:00')
        quiet_end = (now + timedelta(hours=2)).strftime('%H:%M:00')
        system_setting.update(enabledFlag=1, quietStart=quiet_start, quietEnd=quiet_end)
        request(subscriptions, disabled_settings, 'PUT')
        saved = next(row for row in request(subscriptions)
                     if row['messageCategory'] == 'SYSTEM' and row['channelType'] == 'INTERNAL')
        check(saved['enabledFlag'] == 1 and saved['quietStart'] == quiet_start and saved['quietEnd'] == quiet_end
              and sql("SELECT COUNT(*) FROM cloud_flow_db.sys_message_subscribe WHERE tenant_id=100000 "
                      "AND user_id=990000701 AND message_category='SYSTEM' AND channel_type='INTERNAL' "
                      "AND enabled_flag=1 AND quiet_start=" + literal(quiet_start)
                      + ' AND quiet_end=' + literal(quiet_end)
                      + ' AND ((quiet_start<quiet_end AND CURRENT_TIME()>=quiet_start AND CURRENT_TIME()<quiet_end)'
                      + ' OR (quiet_start>quiet_end AND (CURRENT_TIME()>=quiet_start OR CURRENT_TIME()<quiet_end)));') == '1',
              'security owner saves an actually active SYSTEM INTERNAL quiet window through HTTP and database')
        disabled = request('/profile/totp/disable', {'password': password}, 'POST')
        check(disabled['enabled'] is False and request('/profile/totp/status')['enabled'] is False and not state(),
              'actual two-factor disable HTTP removes owned authenticator state')
        wait(lambda: len(records()) == 2 and all(row['status'] == 'SUCCESS' for row in records()),
             30, 'security disable bypasses actual active quiet window immediately')
        rejected('disable', {'password': password}, (409, '请先设置双因素认证'), 'repeated disable')
    finally:
        request(subscriptions, baseline, 'PUT')
        check(request(subscriptions) == baseline, 'security subscription baseline restored through actual HTTP')

    wait(lambda: len(records()) == 2 and all(row['status'] == 'SUCCESS' for row in records()),
         30, 'actual security change messages delivered')
    values = records()
    titles = {'双因素认证已开启', '双因素认证已关闭'}
    check(len(values) == 2 and {row['title'] for row in values} == titles
          and all(row['category'] == 'SYSTEM' and row['receiver'] == '990000701'
                  and row['tenant'] == '100000' for row in values),
          'enable and disable each create one successful owner-only security message')
    seen = []
    connection.settimeout(15)
    while len(seen) < 2:
        message = json.loads(connection.recv())
        if message.get('type') == 'NOTICE' and message.get('data', {}).get('noticeTitle') in titles:
            data = message['data']
            check(isinstance(data.get('createTime'), str), 'security WebSocket timestamp serialized as text')
            seen.append(data['noticeTitle'])
            context['NOTICES'].append({'title': data['noticeTitle'], 'createTime': data['createTime']})
    check(set(seen) == titles, 'actual security enable and disable reach authenticated WebSocket')
    page = request(mine + '?category=SYSTEM&readFlag=0&pageSize=200')
    ids = {row['id'] for row in values}
    check(ids.issubset({str(row['recordId']) for row in page['rows']}),
          'security changes appear in owner unread personal messages')
    for row in values:
        detail = request(mine + '/' + row['id'])
        check(detail['bizType'] == 'SYS_SECURITY_CHANGE' and detail['bizId'] == '990000701'
              and detail['title'] == row['title'] and detail['sendStatus'] == 'SUCCESS',
              'security personal message preserves business identity and actual outcome')
        for user in ('other', 'tenant'):
            request(mine + '/' + row['id'], user=user, denied=True)
    request(mine + '/read', {'recordIds': list(ids)}, 'PUT')
    check(all(request(mine + '/' + row['id'])['readFlag'] == 1 for row in values),
          'owner can mark both actual security messages read')
    payload = "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload'))"
    # Other message channels legitimately store an encrypted, non-JSON payload.
    internal_payload = 'CASE WHEN JSON_VALID(' + payload + ') THEN ' + payload + ' ELSE JSON_OBJECT() END'
    event_query = ("SELECT HEX(JSON_OBJECT('id',id,'status',status,'payload'," + payload
                   + ")) FROM cloud_flow_db.outbox_event WHERE tenant_id=100000 AND event_type='MESSAGE_SEND' "
                   + "AND JSON_UNQUOTE(JSON_EXTRACT(" + internal_payload + ",'$.bizType'))='SYS_SECURITY_CHANGE' "
                   + "AND JSON_UNQUOTE(JSON_EXTRACT(" + internal_payload + ",'$.bizId'))='990000701' ORDER BY id;")
    events = [json.loads(bytes.fromhex(line).decode('utf-8')) for line in sql(event_query).splitlines() if line]
    check(len(events) == 2 and all(event['status'] == 'PUBLISHED'
          and json.loads(event['payload'])['forceSend'] is True for event in events),
          'only successful security operations publish exactly two genuinely forced message outbox events')
    wait(lambda: int(sql("SELECT COUNT(*) FROM cloud_flow_db.sys_audit_log "
                        "WHERE audit_name='禁用双因素认证' AND tenant_id=100000 "
                        "AND high_risk=1 AND risk_level='HIGH' AND create_by='g_import_admin';")) >= 1,
         30, 'actual security disable audit log persisted')
    check(True, 'successful disable persists official audit with actual operator and high-risk fields')
    audit_rows = audits()
    enabled_audits = [row for row in audit_rows if row['field'] == 'enabled']
    check(len(enabled_audits) == 1 and enabled_audits[0]['before'] == 'true'
          and enabled_audits[0]['after'] == 'false',
          'successful disable audits exactly one actual enabled true to false transition')
    check(bool(audit_rows) and all(row['field'] in ('enabled', 'enabledAt')
          and row['operator'] == 'g_import_admin' and row['highRisk'] == 1
          and row['riskLevel'] == 'HIGH' for row in audit_rows),
          'security audit contains only safe status fields with actual operator and high-risk metadata')
    time.sleep(2)
    check(records() == [{**row} for row in values],
          'failed and repeated security operations still create no additional message after repeated scans')
    logs = [sql('SELECT * FROM cloud_flow_db.sys_log;'), sql('SELECT * FROM cloud_flow_db.sys_audit_log;')]
    for pattern in ('*.stdout.log', '*.stderr.log'):
        logs.extend(path.read_text(encoding='utf-8', errors='replace') for path in context['RUN'].glob(pattern))
    check(all(value not in entry for entry in logs for value in (secret, password, wrong_password)),
          'actual security operation logs omit password and authenticator secret')
    return {'security': 'actual HTTP setup/enable/disable to Redis record WebSocket and personal message API',
            'securityMessages': len(values), 'securityRejectedOperations': 7,
            'securityForcedSubscriptionBypass': True, 'securityForcedQuietBypass': True,
            'securityDisabledAuditPersisted': True, 'securitySubscriptionBaselineRestored': True,
            'securityDisabledAuditOperator': 'g_import_admin', 'securityDisabledAuditHighRisk': True,
            'securityDisabledAuditEnabledTransition': ['true', 'false'],
            'securityDisabledAuditFields': sorted(row['field'] for row in audit_rows),
            'securityOutboxEvents': [{'id': event['id'], 'status': event['status'], 'forceSend': True}
                                     for event in events], 'otherBusinessScenariosComplete': False}


def workflow(context, connection, request):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    endpoint = 'http://127.0.0.1:' + str(context['SERVICES']['workflow']['port'])
    marker = 'A2WF-' + context['ROUND']
    def call(path, body=None, method='GET', user='admin'):
        return request('/wf' + path, body, method, user=user, endpoint=endpoint)
    def literal(value):
        return 'CONVERT(0x' + str(value).encode().hex() + ' USING utf8mb4)'
    form = call('/form/save', {'formKey': marker, 'formName': marker,
                'fieldsJson': json.dumps([{'id': 'note', 'type': 'TEXT', 'label': '说明'}])}, 'POST')
    form_id = form.get('formId', form.get('id'))
    check(bool(form_id), 'actual workflow form saved through HTTP')
    model = {'nodes': [{'id': 'start', 'type': 'START', 'title': '发起'},
              {'id': 'review', 'type': 'APPROVAL', 'title': '审批', 'approverType': 'USER',
               'approverValue': '990000701', 'allowAgent': False, 'rejectStrategy': 'TERMINATE'},
              {'id': 'end', 'type': 'END', 'title': '结束'}],
             'edges': [{'id': 'start-review', 'source': 'start', 'target': 'review'},
                       {'id': 'review-end', 'source': 'review', 'target': 'end'}]}
    definition = call('/definition/save', {'processKey': marker, 'processName': marker, 'formId': form_id,
                      'modelJson': json.dumps(model, ensure_ascii=False), 'startPermissionType': 'ALL',
                      'startPermissionValue': '[]'}, 'POST')
    definition_id = definition.get('definitionId', definition.get('id'))
    check(bool(definition_id), 'actual workflow definition saved through HTTP')
    call('/definition/deploy/' + str(definition_id), {}, 'POST')
    launch = call('/draft/context/' + str(definition_id), user='other')
    draft = call('/draft', {'definitionId': definition_id, 'expectedVersion': 0,
                 'loadedContextHash': launch['contextHash'], 'title': marker,
                 'formData': {'note': marker}, 'nodeAssignees': {}}, 'POST', user='other')
    started = call('/start', {'draftId': draft['draftId'], 'expectedVersion': draft['lockVersion']},
                   'POST', user='other')
    instance_id = started.get('instanceId', started.get('processInstanceId'))
    check(bool(instance_id), 'actual different-user workflow started from saved draft')
    tasks = [json.loads(line) for line in sql(
        "SELECT JSON_OBJECT('id',task_id,'status',status,'assignee',CAST(assignee AS CHAR)) "
        'FROM cloud_flow_db.wf_task WHERE tenant_id=100000 AND instance_id=' + literal(instance_id) + ';').splitlines() if line]
    check(len(tasks) == 1 and tasks[0]['status'] == 'TODO' and tasks[0]['assignee'] == '990000701',
          'real workflow engine creates one pending task for chosen approver')
    query = ("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'status',send_status,'category',message_category,"
             "'bizType',biz_type,'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) "
             "FROM cloud_flow_db.sys_message_record WHERE tenant_id=100000 AND title='待办任务通知' "
             'AND content LIKE ' + literal('%' + marker + '%') + ';')
    def records():
        return [json.loads(line) for line in sql(query).splitlines() if line]
    wait(lambda: len(records()) == 1 and records()[0]['status'] == 'SUCCESS', 30,
         'actual workflow pending task message delivered')
    message = records()[0]
    check(message['category'] == 'TODO' and message['bizType'] == 'LEGACY_NOTICE'
          and message['receiver'] == '990000701' and message['tenant'] == '100000',
          'real task creates successful unified TODO message for approver')
    connection.settimeout(15)
    while True:
        envelope = json.loads(connection.recv())
        data = envelope.get('data', {})
        if envelope.get('type') == 'NOTICE' and data.get('noticeTitle') == '待办任务通知':
            check(isinstance(data.get('createTime'), str), 'actual workflow TODO reaches authenticated WebSocket')
            context['NOTICES'].append({'title': data['noticeTitle'], 'createTime': data['createTime']})
            break
    mine = '/system/message/mine'
    page = request(mine + '?category=TODO&readFlag=0&pageSize=200')
    check(any(str(row['recordId']) == message['id'] and marker in row['content'] for row in page['rows']),
          'real pending task appears in approver unread TODO category')
    for user in ('other', 'tenant'):
        request(mine + '/' + message['id'], user=user, denied=True)
    todo = call('/todo?pageSize=200')
    check(any(str(row['taskId']) == tasks[0]['id'] for row in todo['rows']),
          'actual workflow task list exposes the notified pending task')
    call('/complete', {'taskId': tasks[0]['id'], 'action': 'APPROVE', 'comment': marker}, 'POST')
    check(sql('SELECT status FROM cloud_flow_db.wf_process_instance WHERE tenant_id=100000 AND instance_id='
              + literal(instance_id) + ';') == 'PASSED', 'actual notified workflow task completes and process passes')
    request(mine + '/read', {'recordIds': [message['id']]}, 'PUT')
    check(request(mine + '/' + message['id'])['readFlag'] == 1, 'approver marks actual workflow message read')
    return {'workflow': 'actual form definition deploy draft start TODO Redis WebSocket mine and approval HTTP',
            'workflowMessages': 1}


def literal(value):
    return 'CONVERT(0x' + str(value).encode().hex() + ' USING utf8mb4)'


def trigger_job(context, request, job_id):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    started = request('/system/job/' + str(job_id) + '/trigger', {}, 'POST')
    check(started['accepted'] is True and bool(started['executeNo']), 'actual business job trigger accepted')
    query = ("SELECT JSON_OBJECT('status',execute_status,'affected',affected_rows,'message',result_msg) "
             'FROM cloud_flow_db.sys_job_log WHERE job_id=' + str(job_id)
             + ' AND execute_no=' + literal(started['executeNo']) + ';')
    def result():
        value = sql(query)
        return json.loads(value) if value else None
    wait(lambda: result() is not None and result()['status'] != 'RUNNING', 75, 'actual business job terminal status')
    outcome = result()
    check(outcome['status'] == 'SUCCESS', 'actual business job reports SUCCESS')
    return outcome


def verify_business_messages(context, connection, request, values, category, label,
                             owner='admin', receiver='990000701'):
    check = context['check']
    categories = {category} if isinstance(category, str) else set(category)
    check(bool(values) and all(row['status'] == 'SUCCESS' and row['category'] in categories
          and row['receiver'] == receiver and row['tenant'] == '100000' for row in values),
          label + ' delivered only to intended owner in expected category')
    pending = {row['id'] for row in values}
    connection.settimeout(15)
    while pending:
        envelope = json.loads(connection.recv())
        data = envelope.get('data', {})
        record_id = str(data.get('noticeId', ''))
        if envelope.get('type') == 'NOTICE' and record_id in pending:
            check(isinstance(data.get('createTime'), str), label + ' actual WebSocket timestamp serialized as text')
            context['NOTICES'].append({'title': data['noticeTitle'], 'createTime': data['createTime']})
            pending.remove(record_id)
    check(True, label + ' all actual messages reach authenticated WebSocket')
    mine = '/system/message/mine'
    ids = {row['id'] for row in values}
    for current in categories:
        page = request(mine + '?category=' + current + '&readFlag=0&pageSize=200', user=owner)
        expected = {row['id'] for row in values if row['category'] == current}
        check(expected.issubset({str(row['recordId']) for row in page['rows']}),
              label + ' ' + current + ' unread personal messages populated')
    for row in values:
        detail = request(mine + '/' + row['id'], user=owner)
        check(detail['title'] == row['title'] and detail['sendStatus'] == 'SUCCESS'
              and detail['bizType'] == row['bizType'] and detail['bizId'] == row['bizId'],
              label + ' personal message preserves real business identity')
        for user in ('admin', 'other', 'tenant'):
            if user == owner:
                continue
            request(mine + '/' + row['id'], user=user, denied=True)
    request(mine + '/read', {'recordIds': list(ids)}, 'PUT', user=owner)
    check(all(request(mine + '/' + row['id'], user=owner)['readFlag'] == 1 for row in values),
          label + ' owner marks actual messages read')


def hr(context, connection, request):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    base = 'http://127.0.0.1:' + str(context['SERVICES']['hr']['port'])
    marker = 'A2HTTP-' + context['ROUND'] + '-contract'
    contracts = []
    for suffix, days, status, biz_type in [('expiring', 10, 'EXPIRING', 'HR_CONTRACT_EXPIRING'),
                                          ('expired', -1, 'EXPIRED', 'HR_CONTRACT_EXPIRED')]:
        value = request('/employees/contracts', {'employeeId': '990000701', 'contractType': 'FIXED',
                        'contractNo': marker + '-' + suffix, 'signDate': str(date.today() - timedelta(days=60)),
                        'startDate': str(date.today() - timedelta(days=30)), 'endDate': str(date.today() + timedelta(days=days)),
                        'status': 'ACTIVE', 'signStatus': 'SIGNED'}, 'POST', endpoint=base)
        check(str(value).isdigit(), 'actual HR employee contract created through HTTP')
        contracts.append({'id': str(value), 'status': status, 'bizType': biz_type})
    outcome = trigger_job(context, request, 106)
    check(outcome['affected'] >= 2, 'actual contract scan reports both owned contracts')
    for contract in contracts:
        check(sql('SELECT status FROM cloud_flow_db.hr_employee_contract WHERE id=' + contract['id']
                  + ' AND tenant_id=100000;') == contract['status'], 'actual HR scan updates expected contract status')
    query = ("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'status',send_status,'category',message_category,"
             "'bizType',biz_type,'bizId',biz_id,'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) "
             "FROM cloud_flow_db.sys_message_record WHERE biz_type IN ('HR_CONTRACT_EXPIRING','HR_CONTRACT_EXPIRED') "
             + 'AND biz_id IN (' + ','.join(literal(item['id']) for item in contracts) + ');')
    def records():
        return [json.loads(line) for line in sql(query).splitlines() if line]
    wait(lambda: len(records()) == 2 and all(row['status'] == 'SUCCESS' for row in records()), 30, 'actual HR messages delivered')
    check({(row['bizType'], row['bizId']) for row in records()}
          == {(item['bizType'], item['id']) for item in contracts}, 'HR messages match both actual contract identities')
    values = records()
    ids = {row['id'] for row in values}
    summary = request('/ess/portal/summary', endpoint=base)
    unread = {str(row['recordId']): row for row in summary['unreadMessages']}
    check(ids.issubset(unread), 'HR portal includes both real unread contract reminders')
    check(summary['unreadCount'] == request('/system/message/mine/unread-count')['TOTAL'],
          'HR portal unread total matches unified personal message total')
    check(all(unread[row['id']]['bizType'] == row['bizType']
              and unread[row['id']]['bizId'] == row['bizId']
              and unread[row['id']]['readFlag'] == 0
              and unread[row['id']]['messageCategory'] == 'BIZ_REMINDER'
              and isinstance(unread[row['id']]['createTime'], str) for row in values),
          'HR portal preserves actual message identity category unread flag and timestamp')
    for user in ('other', 'tenant'):
        other = request('/ess/portal/summary', user=user, endpoint=base)
        check(ids.isdisjoint({str(row['recordId']) for row in other['unreadMessages']}),
              user + ' HR portal excludes another employee contract reminders')
        check(other['unreadCount'] == request('/system/message/mine/unread-count', user=user)['TOTAL'],
              user + ' HR portal count respects its own user and tenant')
    verify_business_messages(context, connection, request, values, 'BIZ_REMINDER', 'HR contract')
    after = request('/ess/portal/summary', endpoint=base)
    check(ids.isdisjoint({str(row['recordId']) for row in after['unreadMessages']})
          and after['unreadCount'] == summary['unreadCount'] - len(ids),
          'unified read action removes actual contract reminders from HR portal and count')
    mine = request('/ess/contracts/mine', endpoint=base)
    check({item['id'] for item in contracts}.issubset({str(row['id']) for row in mine}),
          'actual contract self-service shows notified owner contracts')
    return {'hr': 'actual contract create HTTP and formal job 106 to status Redis WebSocket personal message and contract self-service',
            'hrMessages': 2, 'hrPortalUnreadReadAndIsolation': True}


def crm(context, connection, request):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    base = 'http://127.0.0.1:' + str(context['SERVICES']['crm']['port'])
    marker = 'A2HTTP-' + context['ROUND'] + '-crm'
    request('/customer', {'customerName': marker, 'customerCode': marker, 'ownerId': '990000701',
            'deptId': '100', 'poolFlag': 0, 'lastFollowUpTime': '2026-01-01 09:00:00'}, 'POST', endpoint=base)
    customer_id = sql('SELECT customer_id FROM cloud_flow_db.crm_customer WHERE customer_code=' + literal(marker)
                      + ' AND tenant_id=100000 AND deleted=0;')
    check(customer_id.isdigit(), 'actual CRM customer created through HTTP')
    check(request('/customer/' + customer_id, endpoint=base)['customerName'] == marker, 'actual CRM customer detail accessible')
    follow_up = {'跟进逾期提醒：' + marker: ('TODO', 1)}
    receivables = {}
    for suffix, days, prefix, category in [('due', 0, '回款即将到期：', 'TODO'),
                                          ('overdue', -1, '回款已逾期：', 'SYSTEM')]:
        name = marker + '-' + suffix
        request('/receivable', {'customerId': customer_id, 'receivableNo': name, 'receivableName': name,
                'plannedAmount': 100, 'dueDate': str(date.today() + timedelta(days=days))}, 'POST', endpoint=base)
        check(sql('SELECT COUNT(*) FROM cloud_flow_db.crm_receivable WHERE receivable_no=' + literal(name)
                  + ' AND tenant_id=100000 AND owner_id=990000701 AND outstanding_amount=100;') == '1',
              'actual CRM receivable creation derives owner and full outstanding balance')
        receivables[prefix + name] = (category, 1)
    opportunity_name = marker + '-opportunity'
    request('/opportunity', {'customerId': customer_id, 'opportunityName': opportunity_name,
            'expectedAmount': 100, 'ownerId': '990000701'}, 'POST', endpoint=base)
    check(sql('SELECT COUNT(*) FROM cloud_flow_db.crm_opportunity WHERE opportunity_name=' + literal(opportunity_name)
              + " AND tenant_id=100000 AND owner_id=990000701 AND status='OPEN'"
              + " AND stage NOT IN ('WON','LOST') AND latest_follow_up_time IS NULL;") == '1',
          'actual CRM opportunity starts open with no fabricated follow-up')
    opportunities = {'商机停滞提醒：' + opportunity_name: ('TODO', 1)}
    tickets = []
    total = 0

    def create_ticket(suffix):
        name = marker + '-ticket-' + suffix
        opened = str(date.today() - timedelta(days=14)) + ' 09:00:00'
        request('/ticket', {'customerId': customer_id, 'ticketTitle': name, 'severity': 'P1',
                'issueType': 'OTHER', 'ownerId': '990000701', 'openedTime': opened}, 'POST', endpoint=base)
        ticket_id = sql('SELECT ticket_id FROM cloud_flow_db.crm_service_ticket WHERE ticket_title='
                        + literal(name) + ' AND tenant_id=100000 AND deleted=0;')
        check(ticket_id.isdigit(), 'actual CRM ticket created through HTTP')
        check(sql('SELECT COUNT(*) FROM cloud_flow_db.crm_service_ticket WHERE ticket_id=' + ticket_id
                  + ' AND owner_id=990000701 AND sla_policy_id IS NOT NULL AND first_response_due<NOW()'
                  + ' AND resolution_due<NOW();') == '1',
              'formal SLA policy computes both overdue deadlines from actual opened time')
        tickets.append((ticket_id, name))
        return {'工单SLA到期：' + name: ('BIZ_REMINDER', 2)}

    def dispatch(label, expected, path=None, job=None):
        nonlocal total
        before = sql('SELECT COALESCE(MAX(record_id),0) FROM cloud_flow_db.sys_message_record;')
        if job is None:
            affected = request('/notification/dispatch' + path, {}, 'POST', endpoint=base)
        else:
            affected = trigger_job(context, request, job)['affected']
        check(isinstance(affected, int) and affected >= sum(count for _, count in expected.values()),
              label + ' reports all owned reminder requests')
        query = ("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'status',send_status,'category',message_category,"
                 "'bizType',biz_type,'bizId',biz_id,'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) "
                 'FROM cloud_flow_db.sys_message_record WHERE record_id>' + before + ' AND title IN ('
                 + ','.join(literal(title) for title in expected) + ') ORDER BY record_id;')
        def records():
            return [json.loads(line) for line in sql(query).splitlines() if line]
        count = sum(value[1] for value in expected.values())
        wait(lambda: len([row for row in records() if row['status'] == 'SUCCESS']) == count,
             35, label + ' actual messages delivered')
        values = records()
        check(len(values) == count and all(row['status'] == 'SUCCESS' for row in values)
              and all(sum(row['title'] == title and row['category'] == category for row in values) == amount
                      for title, (category, amount) in expected.items()),
              label + ' exact successful title and category counts')
        verify_business_messages(context, connection, request, values,
                                 {category for category, _ in expected.values()}, label)
        for ticket_id, name in tickets:
            identities = sql("SELECT biz_id FROM cloud_flow_db.sys_message_record WHERE biz_type='CRM_TICKET_SLA'"
                             + " AND send_status='SUCCESS' AND title=" + literal('工单SLA到期：' + name) + ';').splitlines()
            check(sorted(identities) == sorted([ticket_id + ':RESPONSE_DUE', ticket_id + ':RESOLUTION_DUE']),
                  label + ' SLA deduplication preserves exactly one success per actual deadline')
        total += len(values)

    dispatch('CRM follow-up HTTP', follow_up, path='/follow-up')
    dispatch('CRM receivable HTTP', receivables, path='/receivable')
    dispatch('CRM opportunity HTTP', opportunities, path='/opportunity')
    dispatch('CRM SLA HTTP', create_ticket('direct'), path='/ticket-sla')
    dispatch('CRM combined HTTP', {**follow_up, **receivables, **opportunities, **create_ticket('all')}, path='')
    dispatch('CRM daily job 104', {**follow_up, **receivables, **opportunities}, job=104)
    dispatch('CRM SLA job 105', create_ticket('job'), job=105)
    return {'crm': 'actual four reminder families, five dispatch HTTP entries and formal jobs 104/105 to Redis WebSocket and personal messages',
            'crmMessages': total, 'crmDispatchHttpEntries': 5, 'crmFormalJobs': [104, 105],
            'crmSlaDeduplicatedDeadlineMessages': len(tickets) * 2}


def login_risk(context, connection, request, accounts, clients, client):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    base = 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port'])
    account = next(item for item in accounts if item['username'] == 'g_import_admin')
    history_query = ("SELECT JSON_OBJECT('id',id,'ip',login_ip,'location',location_label) "
                     'FROM cloud_flow_db.sys_user_login_history WHERE tenant_id=100000 '
                     'AND user_id=990000701 ORDER BY id DESC LIMIT 1;')
    query = ("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'status',send_status,"
             "'category',message_category,'bizType',biz_type,'bizId',biz_id,"
             "'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) "
             "FROM cloud_flow_db.sys_message_record WHERE tenant_id=100000 AND receiver_id=990000701 "
             "AND biz_type='SYS_LOGIN_RISK' ORDER BY record_id;")
    def records():
        return [json.loads(line) for line in sql(query).splitlines() if line]
    def actual_login(ip, label):
        previous = json.loads(sql(history_query))
        time.sleep(1.05)  # Preserve order even when the schema stores second precision.
        session = context['SESSION']
        session.cookies.clear()
        session.headers['X-Forwarded-For'] = ip
        try:
            token = context['login'](base, account)
            replacement = client(token)
            old = clients['admin']
            clients['admin'] = replacement
            old.close()
        finally:
            session.headers.pop('X-Forwarded-For', None)
        current = json.loads(sql(history_query))
        check(current['id'] > previous['id'] and current['ip'] == ip,
              label + ' real captcha and login append actual trusted-proxy IP history')
        # Login completion writes outbox synchronously; allow the actual publisher to settle.
        time.sleep(1.2)
        return current
    def no_risk(ip, label, expected_count):
        current = actual_login(ip, label)
        check(len(records()) == expected_count, label + ' creates no login-risk message')
        return current
    check(not records(), 'owned fresh internal login creates no risk notice')
    first = no_risk('114.114.114.114', 'internal to first public location', 0)
    check(first['location'] not in ('UNKNOWN', 'INTERNAL') and '江苏' in first['location'],
          'formal bundled xdb resolves first public IP to Jiangsu without network lookup')
    same = no_risk('114.114.114.114', 'same public IP', 0)
    nearby = no_risk('114.114.114.115', 'different public IP in same province', 0)
    check('江苏' in nearby['location'] and nearby['ip'] != same['ip'],
          'formal bundled xdb confirms distinct IPs in same province')
    changed = actual_login('223.5.5.5', 'different province login')
    check('浙江' in changed['location'], 'formal bundled xdb confirms changed province Zhejiang')
    wait(lambda: len(records()) == 1 and records()[0]['status'] == 'SUCCESS',
         30, 'actual different-province login risk delivered')
    values = records()
    check(values[0]['title'] == '登录环境变化提醒', 'actual login risk uses expected business title')
    detail = request('/system/message/mine/' + values[0]['id'])
    check(all(part in detail['content'] for part in (nearby['ip'], changed['ip'], '江苏', '浙江')),
          'login risk content records both actual resolved locations and IPs')
    verify_business_messages(context, connection, request, values, 'SYSTEM', 'login risk')
    internal = no_risk('127.0.0.1', 'public to internal address', 1)
    unknown = no_risk('2001:4860:4860::8888', 'internal to unsupported IPv6 location', 1)
    check(internal['location'] == 'INTERNAL' and unknown['location'] == 'UNKNOWN',
          'formal resolver preserves INTERNAL and UNKNOWN suppression contexts')
    no_risk('114.114.114.114', 'unknown to known public location', 1)
    check(len(records()) == 1, 'seven actual logins produce exactly one cross-province risk message')
    return {'loginRisk': 'seven actual captcha/legal/login HTTP operations with loopback trusted proxy and bundled xdb; one actual cross-province SYSTEM record, WebSocket, read and user/tenant isolation',
            'loginRiskMessages': 1, 'loginRiskActualLogins': 7, 'loginRiskExternalLookup': False}


def password_reset(context, request, accounts, clients, client):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    account = next(item for item in accounts if item['username'] == 'g_import_other')
    receiver = str(account['userId'])
    base = 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port'])
    query = ("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'status',send_status,"
             "'category',message_category,'bizType',biz_type,'bizId',biz_id,"
             "'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) "
             "FROM cloud_flow_db.sys_message_record WHERE tenant_id=100000 "
             "AND biz_type='PASSWORD_RESET_BY_ADMIN' AND biz_id=" + literal(receiver) + ' ORDER BY record_id;')
    def records():
        return [json.loads(line) for line in sql(query).splitlines() if line]
    def audits():
        query = ("SELECT HEX(JSON_OBJECT('id',CAST(audit_id AS CHAR),'field',audit_field,"
                 "'before',before_val,'after',after_val,'beforeJson',before_json,'afterJson',after_json,"
                 "'diffJson',diff_json,'operator',create_by,'tenant',CAST(tenant_id AS CHAR),"
                 "'highRisk',high_risk,'riskLevel',risk_level)) FROM cloud_flow_db.sys_audit_log "
                 "WHERE audit_name='重置用户密码' ORDER BY audit_id;")
        return [json.loads(bytes.fromhex(line).decode('utf-8')) for line in sql(query).splitlines() if line]
    def events():
        query = ("SELECT HEX(JSON_OBJECT('id',event_id,'status',status,'payload',payload_json)) "
                 "FROM cloud_flow_db.outbox_event WHERE tenant_id=100000 "
                 "AND event_type='PASSWORD_RESET_BY_ADMIN' AND aggregate_id=" + receiver + ' ORDER BY id;')
        return [json.loads(bytes.fromhex(line).decode('utf-8')) for line in sql(query).splitlines() if line]
    def states():
        ids = ','.join(str(item['userId']) for item in accounts)
        return sql("SELECT HEX(JSON_OBJECT('user',user_id,'tenant',tenant_id,'password',password,"
                   "'required',pwd_reset_required)) FROM cloud_flow_db.sys_user WHERE user_id IN ("
                   + ids + ') ORDER BY user_id;')
    def rejected(target, password, label, user='admin', error=None):
        if user == 'admin':
            wait_reset_window(target)
        original = (states(), records(), events(), audits())
        request('/system/user/' + str(target) + '/password', {'password': password}, 'PUT',
                user=user, denied=error is None, expected_error=error)
        check((states(), records(), events(), audits()) == original,
              label + ' preserves all account credentials flags events messages and successful audits')
    def wait_reset_window(target):
        administrator = next(item for item in accounts if item['username'] == 'g_import_admin')
        pattern = ('cloudflow:repeat_submit::tenant:100000:user:' + str(administrator['userId'])
                   + ':uri:/system/user/' + str(target)
                   + '/password:method:*#resetPassword:args:*')
        wait(lambda: not any(context['REDIS'].scan_iter(match=pattern)), 15,
             'administrator reset repeat-submit markers expire naturally')
        check(not any(context['REDIS'].scan_iter(match=pattern)),
              'administrator reset begins after actual repeat-submit window expires')
    def verify_audit(previous_rows, previous_event, event, required_before, label):
        new_rows = [row for row in audits() if row['id'] not in {item['id'] for item in previous_rows}]
        expected_fields = {'resetEventId'}
        if required_before != '1':
            expected_fields.add('forceChangeRequired')
        check(len(new_rows) == len(expected_fields) and {row['field'] for row in new_rows} == expected_fields,
              label + ' persists exactly the actual safe field changes')
        allowed = {'userId', 'tenantId', 'forceChangeRequired', 'resetEventId'}
        for row in new_rows:
            old, new, diff = (json.loads(row[key]) for key in ('beforeJson', 'afterJson', 'diffJson'))
            check(set(old) == allowed and set(new) == allowed
                  and str(old['userId']) == receiver and str(new['userId']) == receiver
                  and str(old['tenantId']) == '100000' and str(new['tenantId']) == '100000'
                  and old['forceChangeRequired'] is (required_before == '1')
                  and new['forceChangeRequired'] is True
                  and old.get('resetEventId') == previous_event and new['resetEventId'] == event['id'],
                  label + ' before and after snapshots retain only actual safe target identity and event')
            check(bool(diff) and {item['path'] for item in diff} == {'/' + name for name in expected_fields}
                  and all(item['op'] in ('add', 'replace') for item in diff),
                  label + ' JSON change paths match actual safe field transitions')
            check(row['operator'] == 'g_import_admin' and row['tenant'] == '100000'
                  and row['highRisk'] == 1 and row['riskLevel'] == 'HIGH',
                  label + ' audit preserves actual operator tenant and high-risk metadata')
        event_rows = [row for row in new_rows if row['field'] == 'resetEventId']
        check(len(event_rows) == 1 and event_rows[0]['before'] == previous_event
              and event_rows[0]['after'] == event['id'],
              label + ' audits exactly one newly persisted business event identity')
        if required_before != '1':
            flag_rows = [row for row in new_rows if row['field'] == 'forceChangeRequired']
            check(len(flag_rows) == 1 and flag_rows[0]['before'] == 'false'
                  and flag_rows[0]['after'] == 'true',
                  label + ' records actual mandatory change boolean transition')
    check(not records(), 'owned target starts without administrator password reset message')
    check(not events() and not audits(), 'owned run starts without administrator reset events or audits')
    before = sql('SELECT password FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';')
    required_before = sql('SELECT pwd_reset_required FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';')
    reset_password = 'R8a' + secrets.token_hex(12)
    repeated_password = 'R9b' + secrets.token_hex(12)
    changed_password = 'C7b' + secrets.token_hex(12)
    foreign = next(item for item in accounts if item['username'] == 'g_import_tenant')
    rejected(receiver, 'Denied8a' + secrets.token_hex(12), 'unprivileged user reset', user='readonly')
    rejected(foreign['userId'], 'Foreign8a' + secrets.token_hex(12), 'cross-tenant reset',
             error=(500, '用户不存在'))
    rejected('999999999', 'Missing8a' + secrets.token_hex(12), 'missing target reset',
             error=(500, '用户不存在'))
    rejected(receiver, '', 'empty reset password', error=(500, '密码不能为空'))
    rejected(receiver, 'Invalid!8a', 'invalid reset password', error=(400, '密码只能包含字母或数字'))
    connection = websocket.create_connection('ws://127.0.0.1:'
            + str(context['SERVICES']['workflow']['port']) + '/ws/notifications',
            timeout=10, suppress_origin=True)
    try:
        connection.send(json.dumps({'type': 'AUTH', 'token': clients['other'].cookies.get('Authorization')}))
        check(json.loads(connection.recv()).get('type') == 'AUTH_OK',
              'password reset target real WebSocket authenticated before business event')
        wait_reset_window(receiver)
        changed = request('/system/user/' + receiver + '/password', {'password': reset_password}, 'PUT')
        check(changed == 1, 'actual administrator password reset HTTP updates one owned target')
        after = sql('SELECT password FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';')
        check(after != before and after != reset_password
              and sql('SELECT pwd_reset_required FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';') == '1',
              'administrator reset persists changed hash and mandatory password change flag')
        check(len(events()) == 1, 'first actual administrator reset persists one business event')
        first_event = events()[0]
        verify_audit([], None, first_event, required_before, 'first actual reset')
        revoked = clients['other'].get(base + '/system/message/mine/unread-count', timeout=20)
        check(revoked.status_code in (200, 401, 403) and revoked.json().get('code') == 401,
              'administrator reset revokes target previous real HTTP session')
        wait(lambda: len(records()) == 1 and records()[0]['status'] == 'SUCCESS',
             35, 'actual password reset business event consumed and unified message delivered')
        first_audits = audits()
        wait_reset_window(receiver)
        changed = request('/system/user/' + receiver + '/password', {'password': repeated_password}, 'PUT')
        repeated_hash = sql('SELECT password FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';')
        check(changed == 1 and repeated_hash not in (before, after, repeated_password)
              and sql('SELECT pwd_reset_required FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';') == '1',
              'second actual reset changes password while mandatory change flag remains one')
        check(len(events()) == 2 and events()[1]['id'] != first_event['id'],
              'consecutive actual resets persist two distinct business event identities')
        verify_audit(first_audits, first_event['id'], events()[1], '1', 'consecutive actual reset')
        wait(lambda: len(records()) == 2 and all(row['status'] == 'SUCCESS' for row in records()),
             35, 'both actual resets deliver exactly one successful message per event')
        values = records()
        check(len({row['id'] for row in values}) == 2
              and all(row['title'] == '密码已被管理员重置' for row in values),
              'two distinct password reset messages preserve official title')
        context['SESSION'].cookies.clear()
        token = context['login'](base, {**account, 'password': repeated_password}, allow_force_password_change=True)
        previous = clients['other']
        clients['other'] = client(token)
        previous.close()
        check(request('/info', user='other')['forcePasswordChange'] is True,
              'target real login with reset password requires mandatory password change')
        administrator_audits = audits()
        request('/profile/password', {'oldPassword': repeated_password, 'newPassword': changed_password},
                'PUT', user='other')
        check(sql('SELECT pwd_reset_required FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';') == '0'
              and request('/info', user='other')['forcePasswordChange'] is False,
              'target completes mandatory password change through official profile HTTP')
        final_hash = sql('SELECT password FROM cloud_flow_db.sys_user WHERE user_id=' + receiver + ';')
        check(final_hash not in (before, after, repeated_hash, changed_password)
              and audits() == administrator_audits and len(events()) == 2,
              'actual profile password change creates no forged administrator reset audit or business event')
        rejected(receiver, 'Denied9a' + secrets.token_hex(12), 'unprivileged reset after password change', user='readonly')
        detail = request('/system/message/mine/' + values[0]['id'], user='other')
        check('g_import_admin' in detail['content'] and '127.0.0.1' in detail['content']
              and all(value not in detail['content'] for value in (reset_password, repeated_password, changed_password)),
              'password reset content preserves actual operator and IP without credentials')
        verify_business_messages(context, connection, request, values, 'SYSTEM', 'password reset',
                                 owner='other', receiver=receiver)
        time.sleep(2)
        check(records() == values and audits() == administrator_audits,
              'two successful resets and rejected operations retain exactly two messages and original audits')
        published_events = events()
        check(len(published_events) == 2 and all(event['status'] == 'PUBLISHED' for event in published_events),
              'two actual password resets persist exactly two published business events')
        for row in published_events:
            envelope = row['payload'] if isinstance(row['payload'], dict) else json.loads(row['payload'])
            event = json.loads(envelope['payload'])
            check(str(event['userId']) == receiver and event['operatorName'] == 'g_import_admin'
                  and event['operatorIp'] == '127.0.0.1' and bool(event['resetAt']),
                  'password reset business event retains actual target operator IP and time')
        logs = [sql('SELECT * FROM cloud_flow_db.sys_log;'), sql('SELECT * FROM cloud_flow_db.sys_audit_log;'),
                json.dumps(published_events, ensure_ascii=False)]
        for pattern in ('*.stdout.log', '*.stderr.log'):
            logs.extend(path.read_text(encoding='utf-8', errors='replace') for path in context['RUN'].glob(pattern))
        check(all(value not in entry for entry in logs for value in (reset_password, repeated_password,
                  changed_password, account['password'], before, after, repeated_hash, final_hash)),
              'actual administrator and profile password changes omit plaintext and password hashes from all logs')
    finally:
        connection.close()
    return {'passwordReset': 'two consecutive actual administrator HTTP resets with distinct persisted events and one SYSTEM message each; unchanged mandatory-change flag still audited; six rejected requests preserve all account states, events, messages and successful audits; old session revoked, latest password login and mandatory profile change, WebSocket read and user/tenant isolation',
            'passwordResetMessages': 2, 'passwordResetForcedChangeAndSessionRevocation': True,
            'passwordResetAuditPersisted': True, 'passwordResetSuccessfulOperations': 2,
            'passwordResetRejectedOperations': 6, 'passwordResetAuditOperator': 'g_import_admin',
            'passwordResetAuditHighRisk': True, 'passwordResetAuditFields': sorted({row['field'] for row in audits()}),
            'passwordResetAuditNoCredentialOrHash': True, 'passwordResetProfileCreatesNoAdminAudit': True,
            'passwordResetRespectsRepeatSubmitWindow': True,
            'passwordResetEventIds': [row['id'] for row in published_events]}


def hr_approvals(context, request, clients, action='APPROVE'):
    if action not in ('APPROVE', 'REJECT'):
        raise ValueError('Explicit HR approval action required')
    approving = action == 'APPROVE'
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    hr_base = 'http://127.0.0.1:' + str(context['SERVICES']['hr']['port'])
    wf_base = 'http://127.0.0.1:' + str(context['SERVICES']['workflow']['port'])
    marker = 'A2HR-' + context['ROUND'] + '-' + action.lower()
    connection = websocket.create_connection('ws://127.0.0.1:'
            + str(context['SERVICES']['workflow']['port']) + '/ws/notifications',
            timeout=10, suppress_origin=True)
    cases = []
    injury_visibility = {}
    def wf(path, body=None, method='GET'):
        return request('/wf' + path, body, method, endpoint=wf_base)
    def state(case):
        query = ("SELECT JSON_OBJECT('status',status,'instance',process_instance_id,'completed',"
                 + case['timeField'] + ') FROM cloud_flow_db.' + case['table']
                 + ' WHERE tenant_id=100000 AND id=' + case['id'] + ';')
        value = json.loads(sql(query))
        if value['instance']:
            value['workflow'] = json.loads(sql(
                "SELECT JSON_OBJECT('status',status,'user',CAST(start_user_id AS CHAR),"
                "'businessType',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessType')),"
                "'businessId',JSON_UNQUOTE(JSON_EXTRACT(variables,'$.businessId'))) "
                "FROM cloud_flow_db.wf_process_instance "
                + 'WHERE tenant_id=100000 AND instance_id=' + literal(value['instance']) + ';'))
        return value
    def records():
        if not cases:
            return []
        where = ' OR '.join('(biz_type=' + literal(case['type']) + ' AND biz_id='
                            + literal(case['id']) + ')' for case in cases)
        query = ("SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'status',send_status,"
                 "'category',message_category,'bizType',biz_type,'bizId',biz_id,'link',link_url,"
                 "'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR)) "
                 + 'FROM cloud_flow_db.sys_message_record WHERE (' + where + ');')
        return [json.loads(line) for line in sql(query).splitlines() if line]
    def proof():
        values = [{'type': case['type'], 'id': case['id'], **state(case)} for case in cases]
        path = context['RUN'] / 'hr-approval-proof.json'
        evidence = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'scenarios': {}}
        evidence['scenarios'][action] = {'cases': values, 'messages': records(),
                                         'injuryVisibility': injury_visibility}
        path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
        return values
    callback_stream = 'workflow:stream:approval-callback:hr'
    callback_group = 'a2-hr-callback-' + context['RUN'].name
    def callback_processed(message_id):
        groups = context['REDIS'].xinfo_groups(callback_stream)
        group = next((item for item in groups if item['name'] == callback_group), None)
        if group is None:
            return False
        sequence = lambda value: tuple(int(part) for part in value.split('-'))
        return (sequence(group['last-delivered-id']) >= sequence(message_id)
                and not context['REDIS'].xpending_range(
                    callback_stream, callback_group, min=message_id, max=message_id, count=1))
    def replay_callback(body, label):
        message_id = context['REDIS'].xadd(callback_stream, body)
        wait(lambda: callback_processed(message_id), 20, label + ' consumed and acknowledged')
    try:
        connection.send(json.dumps({'type': 'AUTH', 'token': clients['other'].cookies.get('Authorization')}))
        check(json.loads(connection.recv()).get('type') == 'AUTH_OK',
              'HR approval target real WebSocket authenticated before business events')
        form = wf('/form/save', {'formKey': marker, 'formName': marker, 'fieldsJson': '[]'}, 'POST')
        form_id = form.get('formId', form.get('id'))
        check(bool(form_id), 'actual HR approval form saved through HTTP')
        model = {'nodes': [{'id': 'start', 'type': 'START', 'title': '发起'},
                 {'id': 'review', 'type': 'APPROVAL', 'title': '审批', 'approverType': 'USER',
                  'approverValue': '990000701', 'allowAgent': False, 'rejectStrategy': 'TERMINATE'},
                 {'id': 'end', 'type': 'END', 'title': '结束'}],
                 'edges': [{'id': 'start-review', 'source': 'start', 'target': 'review'},
                           {'id': 'review-end', 'source': 'review', 'target': 'end'}]}
        for key in ('wf_hr_talent_succession', 'wf_hr_work_injury'):
            definition = wf('/definition/save', {'processKey': key, 'processName': marker + key,
                            'formId': form_id, 'modelJson': json.dumps(model, ensure_ascii=False),
                            'startPermissionType': 'ALL', 'startPermissionValue': '[]'}, 'POST')
            definition_id = definition.get('definitionId', definition.get('id'))
            check(bool(definition_id), key + ' actual definition saved through HTTP')
            wf('/definition/deploy/' + str(definition_id), {}, 'POST')
        position_id = sql('SELECT CAST(id AS CHAR) FROM cloud_flow_db.hr_position '
                          'WHERE tenant_id=100000 AND status=1 ORDER BY id LIMIT 1;')
        check(position_id.isdigit(), 'actual HR succession uses an enabled position from formal seed')
        plan_id = str(request('/talent/succession-plans',
                {'planName': marker, 'positionId': position_id, 'ownerId': '990000712'},
                'POST', endpoint=hr_base))
        check(plan_id.isdigit(), 'actual HR succession plan created through HTTP')
        request('/talent/succession-plans/' + plan_id + '/successors',
                {'employeeId': '990000712', 'readiness': 'READY_NOW'}, 'POST', endpoint=hr_base)
        cases.append({'id': plan_id, 'type': 'HR_TALENT_SUCCESSION', 'table': 'hr_talent_succession_plan',
                      'expected': 'PUBLISHED' if approving else 'REJECTED', 'timeField': 'publish_time',
                      'title': '您已被提名为关键岗位继任人', 'link': '/hr/talent/archive'})
        injury_id = str(request('/labor/work-injuries', {'employeeId': '990000712',
                'injuryNo': marker + '-other',
                'occurredAt': str(date.today() - timedelta(days=1)) + ' 09:00:00',
                'eventDescription': marker, 'injuryLevel': 'MINOR'}, 'POST', endpoint=hr_base))
        check(injury_id.isdigit(), 'actual HR work injury created through HTTP')
        cases.append({'id': injury_id, 'type': 'HR_WORK_INJURY', 'table': 'hr_work_injury',
                      'expected': 'DETERMINED' if approving else 'REJECTED', 'timeField': 'determined_at',
                      'title': '工伤认定结果通知', 'link': '/hr/work-injury-list'})
        owner_cases = {'other': ('990000712', injury_id)}
        for owner, employee_id in (('admin', '990000701'), ('tenant', '990000713')):
            owned_id = str(request('/labor/work-injuries', {'employeeId': employee_id,
                    'injuryNo': marker + '-' + owner,
                    'occurredAt': str(date.today() - timedelta(days=1)) + ' 09:00:00',
                    'eventDescription': marker, 'injuryLevel': 'MINOR'},
                    'POST', user=owner, endpoint=hr_base))
            check(owned_id.isdigit(), 'HR visibility fixture created through HTTP for ' + owner)
            owner_cases[owner] = (employee_id, owned_id)
        def verify_mine(stage, target_status):
            observed = {}
            injury_visibility[stage] = observed
            for owner, (employee_id, owned_id) in owner_cases.items():
                expected_status = target_status if owner == 'other' else 'REPORTED'
                for supplied_id in (None, '990000701' if owner == 'other' else '990000712'):
                    path = '/labor/work-injuries/mine?injuryNo=' + marker + '-' + owner + '&pageSize=100'
                    if supplied_id is not None:
                        path += '&employeeId=' + supplied_id
                    page = request(path, user=owner, endpoint=hr_base)
                    rows = page['rows']
                    observed[owner + ':' + str(supplied_id)] = {
                        'total': page['total'], 'rows': [
                            {key: row.get(key) for key in ('id', 'employeeId', 'status')}
                            for row in rows]}
                    check(page['total'] == 1 and len(rows) == 1
                          and str(rows[0]['id']) == owned_id
                          and str(rows[0]['employeeId']) == employee_id
                          and rows[0]['status'] == expected_status,
                          'HR mine ' + stage + ' owner=' + owner + ' suppliedEmployee='
                          + str(supplied_id) + ' returns only bound employee with expected status: '
                          + json.dumps(observed[owner + ':' + str(supplied_id)], ensure_ascii=False))
                page = request('/labor/work-injuries/mine?pageSize=100', user=owner, endpoint=hr_base)
                rows = page['rows']
                observed[owner + ':unfiltered'] = {
                    'total': page['total'], 'rows': [
                        {key: row.get(key) for key in ('id', 'employeeId', 'status')}
                        for row in rows]}
                check(page['total'] == len(rows) and bool(rows)
                      and all(str(row['employeeId']) == employee_id for row in rows)
                      and any(str(row['id']) == owned_id and row['status'] == expected_status
                              for row in rows),
                      'HR mine ' + stage + ' unfiltered owner=' + owner
                      + ' contains target and only bound employee records: '
                      + json.dumps(observed[owner + ':unfiltered'], ensure_ascii=False))
        verify_mine('reported', 'REPORTED')
        check(sql("SELECT dict_label FROM cloud_flow_db.sys_dict_data WHERE dict_type="
                  "'hr_work_injury_status' AND dict_value='REJECTED' AND status='0';") == '已驳回',
              'formal work injury dictionary exposes rejected label')
        check(not records(), 'HR approval result messages absent before actual submission')
        request('/talent/succession-plans/' + plan_id + '/publish', {}, 'POST', endpoint=hr_base)
        request('/labor/work-injuries/' + injury_id + '/submit-determination', {}, 'POST', endpoint=hr_base)
        wait(lambda: all(state(case)['instance'] for case in cases), 40,
             'both actual HR business events start formal workflow instances')
        before = [state(case) for case in cases]
        check([value['status'] for value in before] == ['IN_PROGRESS', 'DETERMINING']
              and all(not value['completed'] for value in before),
              'both HR submissions persist their explicit approving state without completion time')
        verify_mine('determining', 'DETERMINING')
        for case in cases:
            current = state(case)
            body = {'tenantId': '100000', 'processInstanceId': current['instance'],
                    'businessType': case['type'], 'businessId': case['id'], 'approvalResult': 'APPROVED'}
            replay_callback({**body, 'processInstanceId': current['instance'] + '-stale'},
                            case['type'] + ' stale-instance callback')
            replay_callback({**body, 'tenantId': '100001'}, case['type'] + ' cross-tenant callback')
        check([state(case) for case in cases] == before and not records(),
              'stale-instance and cross-tenant callbacks change no HR state and emit no result message')
        for case in cases:
            current = state(case)
            tasks = [json.loads(line) for line in sql(
                "SELECT JSON_OBJECT('id',task_id,'status',status,'assignee',CAST(assignee AS CHAR)) "
                + 'FROM cloud_flow_db.wf_task WHERE tenant_id=100000 AND instance_id='
                + literal(current['instance']) + ';').splitlines() if line]
            check(len(tasks) == 1 and tasks[0]['status'] == 'TODO' and tasks[0]['assignee'] == '990000701',
                  case['type'] + ' actual engine creates one task for intended approver')
            wf('/complete', {'taskId': tasks[0]['id'], 'action': action, 'comment': marker}, 'POST')
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if all(state(case)['status'] == case['expected'] for case in cases):
                break
            time.sleep(0.4)
        values = proof()
        check(all(value['status'] == case['expected']
                  and bool(value['completed']) == approving
                  and value['workflow']['status'] == ('PASSED' if approving else 'REJECTED')
                  for case, value in zip(cases, values)),
              'HR actual ' + action + ' callbacks update both business outcomes: '
              + json.dumps(values, ensure_ascii=False))
        check(all(value['workflow']['user'] == '990000702' and value['workflow']['businessType'] == case['type']
                  and value['workflow']['businessId'] == case['id'] for case, value in zip(cases, values)),
              'HR workflows use linked login user rather than distinct employee ID')
        verify_mine('terminal', 'DETERMINED' if approving else 'REJECTED')
        if not approving:
            check(not records(), 'rejected HR workflows emit no published or determined business reminder')
            rejected = [state(case) for case in cases]
            for case in cases:
                current = state(case)
                body = {'tenantId': '100000', 'processInstanceId': current['instance'],
                        'businessType': case['type'], 'businessId': case['id'], 'approvalResult': 'REJECTED'}
                replay_callback(body, case['type'] + ' repeated actual rejection')
                replay_callback({**body, 'approvalResult': 'APPROVED'},
                                case['type'] + ' conflicting approval after actual rejection')
            time.sleep(2)
            check([state(case) for case in cases] == rejected and not records(),
                  'rejected HR outcomes retain empty completion times and no success message after callback replay')
            proof()
            return {'hrRejection': 'actual HTTP HR create submit workflow reject formal callback to REJECTED, no completion timestamp or success reminder',
                    'hrRejectionCases': 2, 'hrRejectionMessages': 0,
                    'hrRejectedMineIdentityAndTenantIsolation': True,
                    'hrRejectionCallbackIsolationAndReplay': True}
        wait(lambda: len(records()) == 2 and all(row['status'] == 'SUCCESS' for row in records()),
             30, 'both actual HR approval result messages delivered')
        messages = records()
        check({(row['bizType'], row['bizId'], row['title'], row['link']) for row in messages}
              == {(case['type'], case['id'], case['title'], case['link']) for case in cases},
              'HR approval messages preserve actual business identity title and destination')
        verify_business_messages(context, connection, request, messages, 'BIZ_REMINDER',
                                 'HR actual approval results', owner='other', receiver='990000702')
        time.sleep(2)
        check(len(records()) == 2, 'HR actual approvals create exactly one result message per business')
        approved = [state(case) for case in cases]
        for case in cases:
            current = state(case)
            body = {'tenantId': '100000', 'processInstanceId': current['instance'],
                    'businessType': case['type'], 'businessId': case['id'], 'approvalResult': 'APPROVED'}
            replay_callback(body, case['type'] + ' repeated actual approval')
            replay_callback({**body, 'approvalResult': 'REJECTED'}, case['type'] + ' conflicting terminal replay')
        time.sleep(2)
        check([state(case) for case in cases] == approved and records() == messages,
              'repeated and conflicting terminal callbacks preserve completion time and exactly two result messages')
        proof()
        return {'hrApproval': 'actual HR create submit business events workflow start approve formal callback to two linked-user messages, WebSocket read and user/tenant isolation',
                'hrApprovalMessages': 2, 'hrDistinctEmployeeAndUserIdentity': True,
                'hrMineIdentityAndTenantIsolation': True,
                'hrApprovalCallbackIsolationAndReplay': True}
    finally:
        try:
            if cases:
                proof()
        except Exception as error:
            print('HR_APPROVAL_PROOF_FAILURE: ' + type(error).__name__ + ': ' + str(error), flush=True)
        finally:
            connection.close()


def run(context, connection, request, accounts):
    proof = {**security(context, connection, request, accounts), **workflow(context, connection, request),
             **hr(context, connection, request), **crm(context, connection, request)}
    proof['otherBusinessScenariosComplete'] = False
    proof['fiveBusinessRepresentativeChainsComplete'] = True
    return proof
