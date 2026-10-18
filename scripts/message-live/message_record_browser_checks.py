"""Formal record page against the owned authenticated HTTP environment."""
import json
import shutil


def run(context, clients):
    root, directory = context['ROOT'], context['RUN']
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    prefix = 'A2HTTP-' + context['ROUND'] + '-browser'
    context['sdk']('sms', 6, prefix)
    wait(lambda: sql("SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE biz_id LIKE '"
                     + prefix + "-%' AND channel_type='SMS' AND send_status='FAILED';") == '6',
         40, 'browser sources are six actual SDK failed deliveries')
    rows = [row.split('\t') for row in sql(
        "SELECT record_id,title FROM cloud_flow_db.sys_message_record WHERE biz_id LIKE '"
        + prefix + "-%' AND channel_type='SMS' AND send_status='FAILED' ORDER BY record_id;").splitlines()]
    check(len(rows) == 6 and all(len(row) == 2 and row[0].isdigit() for row in rows),
          'browser source identities are exact actual records')
    originals = {row[0]: sql('SELECT * FROM cloud_flow_db.sys_message_record WHERE record_id=' + row[0] + ';')
                 for row in rows}

    def cookies(session):
        result = [{'name': cookie.name, 'value': cookie.value, 'domain': '127.0.0.1',
                   'path': '/', 'httpOnly': cookie.name == 'Authorization',
                   'secure': cookie.secure, 'sameSite': 'Lax'} for cookie in session.cookies]
        check(any(cookie['name'] == 'Authorization' and cookie['httpOnly'] for cookie in result)
              and any(cookie['name'] == 'XSRF-TOKEN' for cookie in result),
              'browser reuses real login Authorization and readable CSRF cookies')
        return result

    private = directory / 'private/record-browser-input.json'
    output = directory / 'record-browser'
    data = {'authBase': 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port']),
            'output': str(output), 'sources': [{'id': row[0], 'title': row[1]} for row in rows],
            'sessions': {name: cookies(clients[name]) for name in ('admin', 'tenant', 'readonly')}}
    private.write_text(json.dumps(data), encoding='utf-8')
    try:
        context['execute']([shutil.which('node'), root / 'cloudflow-frontend/scripts/check-message-record-live-browser.mjs',
                            private], timeout=240, cwd=root / 'cloudflow-frontend')
    finally:
        private.unlink(missing_ok=True)
    proof = json.loads((output / 'result.json').read_text(encoding='utf-8'))
    check(proof['passed'] and proof['assertions'] >= 30 and not proof['errors'],
          'formal record page real HTTP desktop and mobile checks passed')
    for source, original in originals.items():
        wait(lambda: sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE tenant_id=100000 '
                         'AND resend_from_id=' + source + ';') == '1', 30, 'browser resend linked record ' + source)
        check(sql('SELECT * FROM cloud_flow_db.sys_message_record WHERE record_id=' + source + ';') == original,
              'browser resend preserves every original field ' + source)
        check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record r '
                  'JOIN cloud_flow_db.sys_message_delivery d ON d.record_id=r.record_id '
                  'AND d.tenant_id=r.tenant_id WHERE r.tenant_id=100000 '
                  'AND r.resend_from_id=' + source + " AND r.send_status='FAILED' AND d.delivery_id IS NOT NULL;") == '1',
              'browser resend uses real linked delivery and explicit unsupported SMS failure ' + source)
    proof['databaseOriginalsUnchanged'] = True
    proof['actualLinkedDeliveries'] = 6
    proof['provider'] = 'unimplemented SMS; no vendor call'
    return proof
