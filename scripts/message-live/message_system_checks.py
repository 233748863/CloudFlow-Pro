"""System reminders through real job HTTP, outbox, Redis and personal messages."""
from datetime import date
import json
import time

from message_business_checks import literal, trigger_job, verify_business_messages


def run(context, connection, request):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))

    def rows(statement):
        return [json.loads(bytes.fromhex(line).decode('utf-8'))
                for line in sql(statement).splitlines() if line]

    def records(biz_type, biz_id):
        return rows(
            "SELECT HEX(JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'status',send_status,"
            "'category',message_category,'bizType',biz_type,'bizId',biz_id,"
            "'receiver',CAST(receiver_id AS CHAR),'tenant',CAST(tenant_id AS CHAR))) "
            'FROM cloud_flow_db.sys_message_record WHERE biz_type=' + literal(biz_type)
            + ' AND biz_id=' + literal(biz_id) + ' ORDER BY record_id;')

    # The disposable foreign tenant has no seeded channel; configure it via its real administrator.
    channel_code = 'A2HTTP-' + context['ROUND'] + '-tenant-internal'
    check(sql("SELECT COUNT(*) FROM cloud_flow_db.sys_message_channel WHERE tenant_id=100001 "
              "AND channel_type='INTERNAL' AND status='ENABLED' AND deleted=0;") == '0',
          'system reminders foreign fixture tenant starts without a seeded internal channel')
    request('/system/message/channel', {'channelType': 'INTERNAL', 'channelCode': channel_code,
            'channelName': channel_code, 'status': 'ENABLED', 'retryCount': 0,
            'retryIntervalSec': 1}, 'POST', user='tenant')
    channel_id = sql('SELECT channel_id FROM cloud_flow_db.sys_message_channel WHERE tenant_id=100001 '
                     + 'AND channel_code=' + literal(channel_code)
                     + " AND channel_type='INTERNAL' AND status='ENABLED' AND implemented_flag=1 AND deleted=0;")
    check(channel_id.isdigit(),
          'system reminders foreign tenant official HTTP configures exactly one implemented internal channel')
    check(str(request('/system/message/channel/' + channel_id, user='tenant')['channelId']) == channel_id,
          'system reminders foreign tenant administrator reads their actual internal channel')
    request('/system/message/channel/' + channel_id, denied=True)

    year = str(date.today().year + 1)
    expected = rows(
        "SELECT HEX(JSON_OBJECT('tenant',CAST(u.tenant_id AS CHAR),'receiver',CAST(u.user_id AS CHAR))) "
        'FROM cloud_flow_db.sys_user u JOIN cloud_flow_db.sys_tenant t ON t.tenant_id=u.tenant_id '
        "WHERE t.status='0' AND (t.expire_time IS NULL OR t.expire_time>NOW()) "
        "AND u.deleted=0 AND u.status='0' AND EXISTS (SELECT 1 FROM cloud_flow_db.sys_user_role ur "
        'JOIN cloud_flow_db.sys_role r ON r.role_id=ur.role_id AND r.tenant_id=ur.tenant_id '
        "AND r.status='0' AND r.deleted=0 AND r.role_key IN ('admin','hr') "
        'WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.user_id) ORDER BY u.tenant_id,u.user_id;')
    expected_keys = {(row['tenant'], row['receiver']) for row in expected}
    check({('100000', '990000701'), ('100000', '990000702'), ('100000', '990000705'),
           ('100001', '990000703')}.issubset(expected_keys),
          'yearly reminder actual role query includes two administrators HR and foreign tenant administrator')
    check(not records('SYS_HOLIDAY_YEARLY_REMIND', year),
          'owned yearly reminder starts without prior target-year records')
    outcome = trigger_job(context, request, 127)
    check(outcome['affected'] == len(expected_keys),
          'yearly reminder actual job reports exact eligible recipient count')
    wait(lambda: len(records('SYS_HOLIDAY_YEARLY_REMIND', year)) == len(expected_keys)
         and all(row['status'] == 'SUCCESS' for row in records('SYS_HOLIDAY_YEARLY_REMIND', year)),
         40, 'yearly reminder all actual eligible recipients delivered')
    values = records('SYS_HOLIDAY_YEARLY_REMIND', year)
    check(len(values) == len(expected_keys)
          and {(row['tenant'], row['receiver']) for row in values} == expected_keys
          and all(row['category'] == 'SYSTEM' and row['title'] == '请维护' + year + '年节假日日历'
                  for row in values),
          'yearly reminder exact tenant recipient set category and next-year title match')
    owned = [row for row in values if row['receiver'] == '990000701' and row['tenant'] == '100000']
    verify_business_messages(context, connection, request, owned, 'SYSTEM', 'yearly reminder')
    detail = request('/system/message/mine/' + owned[0]['id'])
    check(detail['linkUrl'] == '/holiday' and year in detail['content'],
          'yearly reminder personal detail retains next-year content and holiday link')
    foreign = next(row for row in values if row['tenant'] == '100001' and row['receiver'] == '990000703')
    check(request('/system/message/mine/' + foreign['id'], user='tenant')['bizId'] == year,
          'yearly reminder foreign administrator reads only their actual tenant record')
    request('/system/message/mine/' + foreign['id'], denied=True)
    request('/system/message/mine/' + owned[0]['id'], user='tenant', denied=True)
    original = values
    time.sleep(5.3)
    repeated = trigger_job(context, request, 127)
    check(repeated['affected'] == len(expected_keys),
          'yearly reminder repeated real job scans same eligible recipients')
    time.sleep(3)
    check(records('SYS_HOLIDAY_YEARLY_REMIND', year) == original,
          'yearly reminder repeated job preserves all original records without duplicate success')

    marker = 'A2HTTP-' + context['ROUND'] + '-system-alarm'
    body = {'jobName': marker, 'jobGroup': 'A2_ACCEPTANCE', 'serviceName': 'crm',
            'handlerName': 'customerPoolRelease', 'handlerParam': marker,
            'triggerType': 'FIXED_RATE', 'intervalMs': 600000, 'status': 'PAUSED',
            'concurrentFlag': 0, 'misfireStrategy': 'IGNORE', 'retryCount': 0,
            'retryIntervalSec': 1, 'dispatchRetryCount': 0, 'dispatchRetryIntervalSec': 1,
            'timeoutSeconds': 60, 'lockTimeSeconds': 60, 'criticalFlag': 0,
            'logSuccessFlag': 1, 'alarmOnFailFlag': 1, 'alarmReceiver': '990000701',
            'remark': marker}
    request('/system/job', body, 'POST')
    job_id = sql('SELECT job_id FROM cloud_flow_db.sys_job WHERE tenant_id=100000 AND job_name='
                 + literal(marker) + ' AND deleted=0;')
    check(job_id.isdigit(), 'system alarm creates one paused owned job through actual HTTP')
    stopped = False
    alarm_proof = []
    try:
        context['stop']('crm')
        stopped = True
        check(context['PROCESSES']['crm'].poll() is not None,
              'system alarm stops only owned disposable CRM process')
        for enabled in (True, False):
            if not enabled:
                request('/system/job', {**body, 'jobId': job_id, 'alarmOnFailFlag': 0}, 'PUT')
                time.sleep(5.3)
            started = request('/system/job/' + job_id + '/trigger', {}, 'POST')
            execute_no = started.get('executeNo')
            check(started['accepted'] is False and started['reason'] == 'DISPATCH_FAILED'
                  and bool(execute_no), 'system alarm actual stopped-service HTTP dispatch fails explicitly')
            execution = rows(
                "SELECT HEX(JSON_OBJECT('status',execute_status,'message',result_msg,'detail',exception_stack,"
                "'ended',end_time,'actor',trigger_by,'retries',dispatch_retry_index)) "
                'FROM cloud_flow_db.sys_job_log WHERE tenant_id=100000 AND job_id=' + job_id
                + ' AND execute_no=' + literal(execute_no) + ';')
            check(len(execution) == 1 and execution[0]['status'] == 'DISPATCH_FAILED'
                  and execution[0]['message'] == '网络调度失败' and execution[0]['detail']
                  and execution[0]['ended'] and execution[0]['actor'] == 'g_import_admin'
                  and execution[0]['retries'] == 0,
                  'system alarm actual failed dispatch terminal log preserves cause actor and zero retry')
            if enabled:
                wait(lambda: len(records('SYS_JOB', execute_no)) == 1
                     and records('SYS_JOB', execute_no)[0]['status'] == 'SUCCESS',
                     35, 'system alarm actual failed dispatch reaches unified message center')
                alarms = records('SYS_JOB', execute_no)
                check(alarms[0]['title'] == '定时任务告警', 'system alarm actual notice title preserved')
                verify_business_messages(context, connection, request, alarms, 'SYSTEM', 'system job alarm')
                detail = request('/system/message/mine/' + alarms[0]['id'])
                check(detail['linkUrl'] == '/job/log?jobId=' + job_id
                      and all(value in detail['content'] for value in (marker, execute_no, '网络调度失败', '异常摘要：')),
                      'system alarm personal detail preserves actual task execution failure summary and log link')
            else:
                time.sleep(3)
                check(not records('SYS_JOB', execute_no),
                      'system alarm disabled switch preserves failed execution without sending a message')
            alarm_proof.append({'executeNo': execute_no, 'enabled': enabled,
                                'messages': len(records('SYS_JOB', execute_no))})
    finally:
        if stopped:
            context['service']('crm')
            check(context['PROCESSES']['crm'].poll() is None,
                  'system alarm owned CRM restored before other business regressions')
    request('/system/job/' + job_id, method='DELETE')
    check(sql('SELECT deleted FROM cloud_flow_db.sys_job WHERE job_id=' + job_id + ';') == '1',
          'system alarm disposable task removed through official HTTP after acceptance')

    execution_marker = 'A2HTTP-' + context['ROUND'] + '-execution-alarm'
    execution_body = {**body, 'jobName': execution_marker, 'serviceName': 'hr',
                      'handlerName': 'hrAttendanceRecalcAsync', 'handlerParam': '{}',
                      'remark': execution_marker}
    request('/system/job', execution_body, 'POST')
    execution_job_id = sql('SELECT job_id FROM cloud_flow_db.sys_job WHERE tenant_id=100000 AND job_name='
                           + literal(execution_marker) + ' AND deleted=0;')
    check(execution_job_id.isdigit(),
          'execution alarm creates one paused HR confirmation-guard job through actual HTTP')
    execution_proof = []
    cases = [('confirmation-required', '{}', '请确认考勤重算范围', True),
             ('malformed-json', '{', '考勤任务参数必须为结构化 JSON', True),
             ('alarm-disabled', '{}', '请确认考勤重算范围', False)]
    try:
        for index, (case, parameter, expected_cause, enabled) in enumerate(cases):
            if index:
                request('/system/job', {**execution_body, 'jobId': execution_job_id,
                        'handlerParam': parameter, 'alarmOnFailFlag': int(enabled)}, 'PUT')
                time.sleep(5.3)
            started = request('/system/job/' + execution_job_id + '/trigger', {}, 'POST')
            execute_no = started.get('executeNo')
            check(started['accepted'] is True and bool(execute_no),
                  'execution alarm ' + case + ' actual HR executor accepts dispatch')

            def execution_rows():
                return rows(
                    "SELECT HEX(JSON_OBJECT('status',execute_status,'message',result_msg,'detail',exception_stack,"
                    "'ended',end_time,'reported',report_time,'actor',trigger_by,'retries',retry_index,"
                    "'dispatchRetries',dispatch_retry_index,'handler',handler_name)) "
                    'FROM cloud_flow_db.sys_job_log WHERE tenant_id=100000 AND job_id=' + execution_job_id
                    + ' AND execute_no=' + literal(execute_no) + ';')

            wait(lambda: len(execution_rows()) == 1 and execution_rows()[0]['status'] == 'FAILED'
                 and execution_rows()[0]['reported'], 75,
                 'execution alarm ' + case + ' actual executor reports FAILED terminal status')
            execution = execution_rows()
            check(len(execution) == 1 and execution[0]['status'] == 'FAILED'
                  and execution[0]['message'] == '任务执行失败'
                  and expected_cause in execution[0]['detail'] and execution[0]['ended']
                  and execution[0]['actor'] == 'g_import_admin' and execution[0]['retries'] == 0
                  and execution[0]['dispatchRetries'] == 0
                  and execution[0]['handler'] == 'hrAttendanceRecalcAsync',
                  'execution alarm ' + case + ' retains actual guarded exception actor and zero retries')
            if enabled:
                wait(lambda: len(records('SYS_JOB', execute_no)) == 1
                     and records('SYS_JOB', execute_no)[0]['status'] == 'SUCCESS',
                     35, 'execution alarm ' + case + ' delivered once through unified message center')
                alarms = records('SYS_JOB', execute_no)
                check(alarms[0]['title'] == '定时任务告警',
                      'execution alarm ' + case + ' actual notice title preserved')
                verify_business_messages(context, connection, request, alarms, 'SYSTEM',
                                         'execution alarm ' + case)
                detail = request('/system/message/mine/' + alarms[0]['id'])
                check(detail['linkUrl'] == '/job/log?jobId=' + execution_job_id
                      and all(value in detail['content'] for value in
                              (execution_marker, execute_no, '任务执行失败', expected_cause, '异常摘要：')),
                      'execution alarm ' + case + ' personal detail contains actual root cause and log link')
            else:
                time.sleep(3)
                check(not records('SYS_JOB', execute_no),
                      'execution alarm disabled switch retains real FAILED execution without a message')
            execution_proof.append({'case': case, 'jobId': execution_job_id, 'executeNo': execute_no,
                                    'status': execution[0]['status'], 'cause': expected_cause,
                                    'enabled': enabled, 'messages': len(records('SYS_JOB', execute_no))})
        time.sleep(3)
        check(all(len(records('SYS_JOB', item['executeNo'])) == int(item['enabled'])
                  for item in execution_proof),
              'execution alarm repeated dispatcher scans preserve exact enabled and disabled message counts')
        check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_job_log WHERE tenant_id=100000 AND job_id='
                  + execution_job_id + ';') == str(len(cases)),
              'execution alarm zero-retry task has exactly three actual execution logs')
    finally:
        request('/system/job/' + execution_job_id, method='DELETE')
        check(sql('SELECT deleted FROM cloud_flow_db.sys_job WHERE job_id=' + execution_job_id + ';') == '1',
              'execution alarm disposable HR task removed through official HTTP')
    return {'systemReminders': {'yearly': {'targetYear': year, 'recipients': len(expected_keys),
            'duplicateRecords': 0}, 'jobAlarm': alarm_proof,
            'executionAlarm': execution_proof,
            'scope': 'actual job HTTP, owned CRM outage, guarded HR execution failures, outbox Redis WebSocket mine read and tenant boundaries',
            'otherSystemBranchesComplete': False}}
