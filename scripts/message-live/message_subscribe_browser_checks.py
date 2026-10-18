"""Formal subscription page, actual authenticated HTTP and saved-policy delivery."""
from datetime import datetime, timedelta
import json
import shutil


def run(context, clients, request):
    root, directory = context['ROOT'], context['RUN']
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    endpoint = '/system/message/subscribe/mine'
    users = {'admin': (100000, 990000701), 'other': (100000, 990000702),
             'tenant': (100001, 990000703), 'readonly': (100000, 990000704)}
    baseline = {user: request(endpoint, user=user) for user in ('admin', 'other', 'tenant')}
    check(all(len(rows) == 15 and all(row['enabledFlag'] == 1 and row.get('quietStart') is None
              and row.get('quietEnd') is None for row in rows) for rows in baseline.values()),
          'subscription actual account defaults verified before browser writes')
    now = datetime.strptime(sql('SELECT NOW();'), '%Y-%m-%d %H:%M:%S')
    active_quiet = {'start': (now - timedelta(hours=1)).strftime('%H:%M'),
                    'end': (now + timedelta(hours=2)).strftime('%H:%M')}

    def cookies(session):
        result = [{'name': item.name, 'value': item.value, 'domain': '127.0.0.1', 'path': '/',
                   'httpOnly': item.name == 'Authorization', 'secure': item.secure, 'sameSite': 'Lax'}
                  for item in session.cookies]
        check(any(item['name'] == 'Authorization' and item['httpOnly'] for item in result)
              and any(item['name'] == 'XSRF-TOKEN' for item in result), 'subscription real login cookie pair')
        return result

    output = directory / 'subscribe-browser'
    private = directory / 'private/subscribe-browser-input.json'
    private.write_text(json.dumps({'authBase': 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port']),
                       'output': str(output), 'activeQuiet': active_quiet,
                       'sessions': {user: cookies(session) for user, session in clients.items()}}), encoding='utf-8')
    try:
        context['execute']([shutil.which('node'), root / 'cloudflow-frontend/scripts/check-message-subscribe-live-browser.mjs',
                            private], timeout=300, cwd=root / 'cloudflow-frontend')
    finally:
        private.unlink(missing_ok=True)
    proof = json.loads((output / 'result.json').read_text(encoding='utf-8'))
    check(proof['passed'] and proof['assertions'] >= 45 and not proof['errors'],
          'formal subscription page real HTTP desktop and mobile checks passed')

    def canonical(rows):
        return sorted(({key: row.get(key) for key in ('messageCategory', 'channelType', 'enabledFlag', 'quietStart', 'quietEnd')}
                       for row in rows), key=lambda row: (row['messageCategory'], row['channelType']))

    for user in ('admin', 'other', 'tenant'):
        tenant_id, user_id = users[user]
        rows = [json.loads(line) for line in sql(
            "SELECT JSON_OBJECT('messageCategory',message_category,'channelType',channel_type,'enabledFlag',enabled_flag,"
            "'quietStart',TIME_FORMAT(quiet_start,'%H:%i:%s'),'quietEnd',TIME_FORMAT(quiet_end,'%H:%i:%s')) "
            'FROM cloud_flow_db.sys_message_subscribe WHERE tenant_id=' + str(tenant_id)
            + ' AND user_id=' + str(user_id) + ';').splitlines()]
        check(len(rows) == 15 and canonical(rows) == canonical(proof['finalSettings'][user])
              == canonical(request(endpoint, user=user)), user + ' browser saves match exact owned database and reloaded HTTP')
    readonly_where = 'tenant_id=100000 AND user_id=990000704'
    readonly_before = sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_subscribe WHERE ' + readonly_where + ';')
    request(endpoint, [{'messageCategory': 'TODO', 'channelType': 'INTERNAL', 'enabledFlag': 0}],
            'PUT', user='readonly', denied=True)
    check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_subscribe WHERE ' + readonly_where + ';') == readonly_before,
          'readonly direct save rejected without database changes')

    # An earlier valid entry must roll back if a later entry is invalid.
    before = canonical(request(endpoint))
    response = clients['admin'].put('http://127.0.0.1:' + str(context['SERVICES']['auth1']['port']) + endpoint,
               json=[{'messageCategory': 'TODO', 'channelType': 'INTERNAL', 'enabledFlag': 1},
                     {'messageCategory': 'SYSTEM', 'channelType': 'INTERNAL', 'enabledFlag': 1, 'quietStart': '21:00:00'}], timeout=20)
    check(response.status_code in (200, 400, 500) and response.json().get('code') != 200
          and canonical(request(endpoint)) == before, 'invalid half-window rolls back all earlier subscription writes')

    prefix = 'A2HTTP-' + context['ROUND'] + '-subscription'
    record_where = "tenant_id=100000 AND receiver_id=990000701 AND title='"

    def delivered(mode, suffix, status):
        title = prefix + '-' + suffix + '-0'
        context['sdk'](mode, 1, prefix + '-' + suffix)
        wait(lambda: sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + record_where + title
                         + "' AND send_status='" + status + "';") == '1', 35, 'saved subscription ' + suffix + ' delivery')
        return title

    disabled_title = delivered('subscription-disabled', 'disabled', 'SKIPPED')
    check(sql('SELECT skip_reason FROM cloud_flow_db.sys_message_record WHERE ' + record_where + disabled_title
              + "';") == 'UNSUBSCRIBED', 'browser-disabled TODO skips actual internal delivery with UNSUBSCRIBED')
    quiet_title = prefix + '-quiet-0'
    context['sdk']('subscription-quiet', 1, prefix + '-quiet')
    # Ordinary INTERNAL quiet messages are deferred as new outbox events, before record creation.
    payload = "JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.payload'))"
    quiet_where = ("tenant_id=100000 AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.sourceModule'))='cloudflow-auth' "
                   "AND JSON_UNQUOTE(JSON_EXTRACT(" + payload + ",'$.title'))='" + quiet_title + "'")
    wait(lambda: sql('SELECT COUNT(*) FROM cloud_flow_db.outbox_event WHERE ' + quiet_where
                     + " AND status='PENDING' AND next_retry_at>NOW();") == '1',
         35, 'saved quiet hours create one future owned outbox event')
    # HEX preserves nested JSON across mysql --batch escaping without changing the shared SQL client.
    delayed = json.loads(bytes.fromhex(sql("SELECT HEX(JSON_OBJECT('id',id,'eventId',event_id,'status',status,"
                            "'nextRetryAt',DATE_FORMAT(next_retry_at,'%Y-%m-%d %H:%i:%s'),'payload',"
                            + payload + ')) FROM cloud_flow_db.outbox_event WHERE ' + quiet_where + ';')).decode('utf-8'))
    delayed_payload = json.loads(delayed['payload'])
    expected_schedule = (now + timedelta(hours=2)).replace(second=0, microsecond=0)
    check(delayed['status'] == 'PENDING'
          and datetime.fromisoformat(delayed['nextRetryAt']) == expected_schedule
          and datetime.fromisoformat(delayed_payload['scheduleTime']) == expected_schedule
          and delayed_payload['forceSend'] is False,
          'browser-saved quiet window queues exact future outbox schedule without forcing delivery')
    check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + record_where + quiet_title + "';") == '0',
          'quiet INTERNAL message creates no premature delivery record')
    delivered('subscription-equal', 'equal', 'SUCCESS')
    check(True, 'browser-saved equal start/end permits immediate actual internal delivery')
    delivered('subscription-forced', 'forced-disabled', 'SUCCESS')
    check(True, 'forced actual internal delivery bypasses browser-disabled subscription')
    delivered('send', 'forced-quiet', 'SUCCESS')
    check(True, 'forced actual internal delivery bypasses browser-saved active quiet hours')
    # Clear through production HTTP and advance only this owned event, avoiding a two-hour wait.
    restored = request(endpoint)
    for row in restored:
        if row['channelType'] == 'INTERNAL':
            row.update(enabledFlag=1, quietStart=None, quietEnd=None)
    request(endpoint, restored, 'PUT')
    check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + record_where + quiet_title + "';") == '0',
          'quiet INTERNAL message remains deferred until explicit owned schedule advancement')
    exact_event = quiet_where + ' AND id=' + str(delayed['id']) + " AND event_id='" + delayed['eventId'] + "'"
    check(sql('UPDATE cloud_flow_db.outbox_event SET next_retry_at=NOW() WHERE ' + exact_event
              + " AND status='PENDING' AND next_retry_at>NOW(); SELECT ROW_COUNT();") == '1',
          'advance exactly one owned quiet outbox event without changing request payload')
    wait(lambda: sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + record_where + quiet_title
                     + "' AND send_status='SUCCESS';") == '1', 35, 'pending quiet message resumes after clearing window')
    check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + record_where + quiet_title + "';") == '1'
          and bytes.fromhex(sql('SELECT HEX(' + payload + ') FROM cloud_flow_db.outbox_event WHERE '
                                + exact_event + ';')).decode('utf-8') == delayed['payload'],
          'quiet INTERNAL delivery resumes exactly once with original payload unchanged')
    delivered('subscription-disabled', 'resubscribed', 'SUCCESS')
    check(True, 'reenabled subscription resumes new actual delivery')
    # Keep later representative business checks independent of this policy-specific fixture.
    for user, rows in baseline.items():
        request(endpoint, rows, 'PUT', user=user)
    proof.update(databaseSettingsVerified=True, savedPolicyDeliveryVerified=True,
                 policyScope='actual INTERNAL delivery only; no external SMS or EMAIL provider',
                 retryTiming='quiet window cleared through actual HTTP; only exact owned outbox next_retry_at advanced; no natural two-hour wait',
                 quietOutbox={'eventId': delayed['eventId'], 'scheduledAt': delayed['nextRetryAt'],
                              'payloadUnchanged': True, 'singleSuccessfulRecord': True},
                 baselineRestored=True)
    (output / 'result.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2), encoding='utf-8')
    return proof
