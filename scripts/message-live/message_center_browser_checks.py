"""AC-12 formal bell and personal page with actual SDK/OA HTTP sources."""
import json
import shutil


def run(context, clients, request):
    root, directory = context['ROOT'], context['RUN']
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    prefix = 'A2HTTP-' + context['ROUND'] + '-center'
    mine = '/system/message/mine'
    sources = {}
    for user, mode, receiver in [('admin', 'center', 990000701), ('other', 'center-other', 990000702)]:
        request(mine + '/read', {'all': True}, 'PUT', user=user)
        own_prefix = prefix + '-' + user
        context['sdk'](mode, 15, own_prefix)
        where = "tenant_id=100000 AND channel_type='INTERNAL' AND biz_id LIKE '" + own_prefix + "-%'"
        wait(lambda: sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + where
                         + " AND send_status='SUCCESS';") == '15', 40, user + ' fifteen actual SDK category deliveries')
        rows = [json.loads(line) for line in sql(
            "SELECT JSON_OBJECT('id',CAST(record_id AS CHAR),'title',title,'category',message_category,"
            "'receiver',CAST(receiver_id AS CHAR)) FROM cloud_flow_db.sys_message_record WHERE " + where + ';').splitlines()]
        check(len(rows) == 15 and all(row['receiver'] == str(receiver) for row in rows),
              user + ' exact actual category source identities')
        sources[user] = sorted(rows, key=lambda row: int(row['title'].rsplit('-', 1)[1]))
        # Deterministic timestamp boundaries only; identities/content/status remain actual deliveries.
        for index, row in enumerate(sources[user]):
            stamp = ('2031-03-15 ' + ('00:00:00' if index == 10 else '23:59:59' if index == 14 else '12:00:00')
                     if index >= 10 else '2031-03-14 23:59:59')
            sql("UPDATE cloud_flow_db.sys_message_record SET create_time='" + stamp
                + "' WHERE tenant_id=100000 AND receiver_id=" + str(receiver) + ' AND record_id=' + row['id'] + ';')
    oa = 'http://127.0.0.1:' + str(context['SERVICES']['oa']['port'])
    title = prefix + '-announcement'
    request('/announcement/publish', {'title': title, 'content': 'Actual OA bell deduplication acceptance',
            'type': '2', 'scopeType': 'ALL', 'priority': 'M', 'isTop': 0}, 'POST', endpoint=oa)
    announcement_id = sql("SELECT announcement_id FROM cloud_flow_db.oa_announcement WHERE tenant_id=100000 AND title='" + title + "';")
    check(announcement_id.isdigit(), 'center actual OA announcement exists')
    for user in ('admin', 'other'):
        wait(lambda: any(str(row.get('bizId')) == announcement_id for row in
                         request(mine + '?category=ANNOUNCEMENT&pageSize=200', user=user)['rows']),
             30, user + ' receives actual OA announcement')

    def cookies(session):
        result = [{'name': item.name, 'value': item.value, 'domain': '127.0.0.1', 'path': '/',
                   'httpOnly': item.name == 'Authorization', 'secure': item.secure, 'sameSite': 'Lax'}
                  for item in session.cookies]
        check(any(item['name'] == 'Authorization' and item['httpOnly'] for item in result)
              and any(item['name'] == 'XSRF-TOKEN' for item in result), 'center real login cookie pair')
        return result

    private = directory / 'private/center-browser-input.json'
    output = directory / 'center-browser'
    data = {'authBase': 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port']),
            'oaBase': oa, 'output': str(output), 'sources': sources, 'announcement': title,
            'sessions': {user: cookies(clients[user]) for user in ('admin', 'other', 'tenant', 'readonly')}}
    private.write_text(json.dumps(data), encoding='utf-8')
    try:
        context['execute']([shutil.which('node'), root / 'cloudflow-frontend/scripts/check-message-center-live-browser.mjs',
                            private], timeout=300, cwd=root / 'cloudflow-frontend')
    finally:
        private.unlink(missing_ok=True)
    proof = json.loads((output / 'result.json').read_text(encoding='utf-8'))
    check(proof['passed'] and proof['assertions'] >= 45 and not proof['errors'],
          'formal bell and personal page real HTTP desktop and mobile checks passed')
    for user in ('admin', 'other'):
        ids = ','.join(row['id'] for row in sources[user])
        check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE record_id IN (' + ids
                  + ') AND read_flag=1;') == '15', user + ' browser all-read persisted all fifteen actual sources')
    proof['databaseAllReadVerified'] = True
    proof['sources'] = '30 actual SDK category deliveries and one actual OA HTTP publication; timestamps set for date boundaries'
    proof['liveWebSocketBrowserCovered'] = False
    return proof
