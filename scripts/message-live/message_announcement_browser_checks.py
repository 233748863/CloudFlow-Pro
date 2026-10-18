"""AC-13 formal announcement publisher to actual personal-message delivery."""
import json
import shutil


def run(context, clients, request):
    root, directory = context['ROOT'], context['RUN']
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    oa = 'http://127.0.0.1:' + str(context['SERVICES']['oa']['port'])
    prefix = 'A2HTTP-' + context['ROUND'] + '-publish-browser'
    departments = request('/system/dept/tree')

    def flatten(nodes):
        return [item for node in nodes for item in [node, *flatten(node.get('children') or [])]]

    department = next(row for row in flatten(departments) if str(row['deptId']) == '100')
    role = next(row for row in request('/system/role/optionselect') if row['roleKey'] == 'admin')

    def cookies(session):
        values = [{'name': item.name, 'value': item.value, 'domain': '127.0.0.1', 'path': '/',
                   'httpOnly': item.name == 'Authorization', 'secure': item.secure, 'sameSite': 'Lax'}
                  for item in session.cookies]
        check(any(item['name'] == 'Authorization' and item['httpOnly'] for item in values)
              and any(item['name'] == 'XSRF-TOKEN' for item in values), 'announcement real login cookie pair')
        return values

    private = directory / 'private/announcement-browser-input.json'
    output = directory / 'announcement-browser'
    private.write_text(json.dumps({'authBase': 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port']),
        'oaBase': oa, 'output': str(output), 'prefix': prefix, 'department': department['deptName'],
        'role': role['roleName'], 'sessions': {user: cookies(clients[user])
            for user in ('admin', 'other', 'tenant', 'readonly')}}, ensure_ascii=False), encoding='utf-8')
    try:
        context['execute']([shutil.which('node'), root / 'cloudflow-frontend/scripts/check-announcement-live-browser.mjs',
                            private], timeout=300, cwd=root / 'cloudflow-frontend')
    finally:
        private.unlink(missing_ok=True)
    proof = json.loads((output / 'result.json').read_text(encoding='utf-8'))
    check(proof['passed'] and proof['assertions'] >= 35 and not proof['errors'],
          'formal announcement publishing and personal message browser checks passed')
    check(len(proof['publications']) == 3, 'exactly three actual browser publications')
    for publication in proof['publications']:
        title, identity, scope = publication['title'], publication['id'], publication['scope']
        check(identity.isdigit() and title.startswith(prefix), 'owned browser announcement identity')
        stored = json.loads(sql(
            "SELECT JSON_OBJECT('title',title,'content',content,'scope',scope_type,'scopeValue',scope_value,"
            "'type',type,'priority',priority,'isTop',is_top,'status',status,'sender',CAST(sender_id AS CHAR)) "
            'FROM cloud_flow_db.oa_announcement WHERE tenant_id=100000 AND announcement_id=' + identity + ';'))
        check(stored['title'] == title and stored['content'] == publication['content']
              and stored['scope'] == scope and stored['scopeValue'] == (None if scope == 'ALL' else '100' if scope == 'DEPT' else 'admin')
              and str(stored['type']) == '2' and stored['priority'] == 'H' and stored['isTop'] == 1
              and stored['status'] == '1' and stored['sender'] == ('990000702' if scope == 'ROLE' else '990000701'),
              scope + ' browser submitted business fields match database')
        users = "SELECT u.user_id FROM cloud_flow_db.sys_user u WHERE u.tenant_id=100000 AND u.deleted=0 AND u.status='0'"
        if scope == 'DEPT':
            users += ' AND u.dept_id=100'
        elif scope == 'ROLE':
            users += (" AND EXISTS (SELECT 1 FROM cloud_flow_db.sys_user_role ur JOIN cloud_flow_db.sys_role r "
                      "ON ur.role_id=r.role_id AND r.tenant_id=ur.tenant_id WHERE ur.user_id=u.user_id "
                      "AND ur.tenant_id=u.tenant_id AND r.role_key='admin' AND r.deleted=0 AND r.status='0')")
        expected = sorted(sql(users + ';').splitlines())
        where = "biz_type='OA_ANNOUNCEMENT' AND biz_id='" + identity + "' AND channel_type='INTERNAL'"
        wait(lambda: sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + where
                         + " AND tenant_id=100000 AND send_status='SUCCESS';") == str(len(expected)),
             35, scope + ' exact actual browser publication recipients delivered')
        actual = sorted(sql('SELECT receiver_id FROM cloud_flow_db.sys_message_record WHERE ' + where + ';').splitlines())
        check(actual == expected and len(actual) == len(set(actual)), scope + ' exact target roster without duplicates')
        check(sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE ' + where
                  + " AND (tenant_id<>100000 OR message_category<>'ANNOUNCEMENT' OR link_url<>'/announcement');") == '0',
              scope + ' category business link and tenant match')
        check(sql('SELECT read_flag FROM cloud_flow_db.sys_message_record WHERE ' + where
                  + ' AND tenant_id=100000 AND receiver_id=990000702;') == '1',
              scope + ' actual recipient browser read persisted')
        for user in ('admin', 'other'):
            rows = request('/system/message/mine?category=ANNOUNCEMENT&pageSize=200', user=user)['rows']
            check(len([row for row in rows if str(row['bizId']) == identity]) == 1,
                  scope + ' ' + user + ' HTTP reread contains exactly one actual message')
        check(all(str(row['bizId']) != identity for row in
                  request('/system/message/mine?category=ANNOUNCEMENT&pageSize=200', user='tenant')['rows']),
              scope + ' cross-tenant HTTP reread excludes publication')
        publication['recipientCount'] = len(actual)
    count_before = sql("SELECT COUNT(*) FROM cloud_flow_db.oa_announcement WHERE title LIKE '" + prefix + "%';")
    request('/announcement/publish', {'title': prefix + '-denied', 'content': 'readonly forbidden',
            'type': '2', 'scopeType': 'ALL'}, 'POST', user='readonly', endpoint=oa, denied=True)
    check(sql("SELECT COUNT(*) FROM cloud_flow_db.oa_announcement WHERE title LIKE '" + prefix + "%';") == count_before == '3',
          'readonly publication rejection creates no database row')
    proof['databaseAndHttpVerified'] = True
    proof['formalProviderTested'] = False
    return proof
