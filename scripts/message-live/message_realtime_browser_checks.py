"""Full application entry, real authenticated WebSocket and message refresh checks."""
import json
import shutil


def run(context, clients, request):
    root, directory = context['ROOT'], context['RUN']
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))

    def cookies(session):
        values = [{'name': item.name, 'value': item.value, 'domain': '127.0.0.1', 'path': '/',
                   'httpOnly': item.name == 'Authorization', 'secure': item.secure, 'sameSite': 'Lax'}
                  for item in session.cookies]
        check(any(item['name'] == 'Authorization' and item['httpOnly'] for item in values)
              and any(item['name'] == 'XSRF-TOKEN' for item in values), 'realtime real login cookie pair')
        return values

    private = directory / 'private/realtime-browser-input.json'
    output = directory / 'realtime-browser'
    private.write_text(json.dumps({
        'authBase': 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port']),
        'oaBase': 'http://127.0.0.1:' + str(context['SERVICES']['oa']['port']),
        'workflowBase': 'http://127.0.0.1:' + str(context['SERVICES']['workflow']['port']),
        'output': str(output), 'prefix': 'A2HTTP-' + context['ROUND'] + '-realtime',
        'sessions': {user: cookies(clients[user]) for user in ('admin', 'other', 'tenant', 'readonly')}
    }, ensure_ascii=False), encoding='utf-8')
    try:
        context['execute']([shutil.which('node'), root / 'cloudflow-frontend/scripts/check-message-realtime-live-browser.mjs',
                            private], timeout=420, cwd=root / 'cloudflow-frontend')
    finally:
        private.unlink(missing_ok=True)
    proof = json.loads((output / 'result.json').read_text(encoding='utf-8'))
    check(proof['passed'] and proof['assertions'] >= 30 and not proof['errors'],
          'full application real WebSocket browser acceptance passed')
    check(proof['liveWebSocketBrowserCovered'] is True, 'full application live WebSocket actually covered')
    for publication in proof['publications']:
        identity = str(publication['id'])
        check(identity.isdigit() and publication['title'].startswith('A2HTTP-' + context['ROUND'] + '-realtime'),
              'owned realtime announcement identity')
        where = "biz_type='OA_ANNOUNCEMENT' AND biz_id='" + identity + "' AND channel_type='INTERNAL'"
        wait(lambda: sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + where
                         + " AND tenant_id=100000 AND receiver_id=990000702 AND send_status='SUCCESS';") == '1',
             30, 'realtime publication delivered exactly once to recipient')
        check(sql('SELECT read_flag FROM cloud_flow_db.sys_message_record WHERE ' + where
                  + ' AND tenant_id=100000 AND receiver_id=990000702;') == '1',
              'full application recipient read persisted')
        check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + where
                  + ' AND tenant_id<>100000;') == '0', 'realtime publication tenant isolation persisted')
    proof['databaseAndHttpVerified'] = True
    proof['formalProviderTested'] = False
    return proof
