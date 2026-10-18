"""FR-7 checks against real authenticated HTTP, MySQL and Redis delivery."""
import json
import time
from urllib.parse import urlencode


def run(context, request, clients, client, accounts):
    check, sql, wait = (context[name] for name in ('check', 'sql', 'wait_for'))
    path = '/system/message/record'
    prefix = 'A2HTTP-' + context['ROUND']

    def query(**extra):
        return request(path + '/list?' + urlencode({
            'beginTime': '2031-01-15', 'endTime': '2031-01-15',
            'pageNum': 1, 'pageSize': 20, **extra}))

    rows = [
        (970001, 100000, 'EMAIL', 'FAILED', 'PAY', 'A', 701, '2031-01-15 00:00:00', 'REJECTED'),
        (970002, 100000, 'INTERNAL', 'SUCCESS', 'PAY', 'A', 702, '2031-01-15 12:00:00', None),
        (970003, 100000, 'EMAIL', 'UNKNOWN', 'OTHER', 'B', 701, '2031-01-15 23:59:59', 'UNCONFIRMED'),
        (970004, 100000, 'EMAIL', 'RETRYABLE', 'OTHER', 'B', 703, '2031-01-15 13:00:00', 'TEMPORARY'),
        (970005, 100000, 'SMS', 'SKIPPED', 'OTHER', 'B', 703, '2031-01-15 14:00:00', 'SKIPPED_DETAIL'),
        (970006, 100000, 'EMAIL', 'SUCCESS', None, 'C', 704, '2031-01-15 15:00:00', 'HISTORIC_DETAIL'),
        (970007, 100000, 'SMS', 'FAILED', 'THIRD', 'B', 703, '2031-01-15 16:00:00', 'REJECTED'),
        (970008, 100000, 'EMAIL', 'SUCCESS', 'PAY', 'A', 701, '2031-01-16 00:00:00', None),
        (970009, 100000, 'EMAIL', 'FAILED', 'OLDER', 'A', 701, '2031-01-14 23:59:59', 'OLDER'),
        (970010, 100001, 'EMAIL', 'FAILED', 'PAY', 'A', 701, '2031-01-15 10:00:00', 'FOREIGN'),
    ]

    def literal(value):
        if value is None:
            return 'NULL'
        if isinstance(value, int):
            return str(value)
        if any(char in value for char in "'\\"):
            raise ValueError('Unexpected fixture SQL literal')
        return "'" + value + "'"

    sql('INSERT INTO cloud_flow_db.sys_message_record '
        '(record_id,tenant_id,channel_type,send_status,template_code,biz_type,receiver_id,create_time,error_msg,'
        'receiver_type,title,content) VALUES '
        + ','.join('(' + ','.join(map(literal, row + ('USER', 'record-check', 'record-content')))
                   + ')' for row in rows) + ';')
    page = query()
    check(page['total'] == 7 and len(page['rows']) == 7
          and str(page['rows'][0]['recordId']) == '970003',
          'FR7 HTTP date range excludes next day and other tenant and orders newest first')
    check(str(query(pageNum=2, pageSize=2)['rows'][0]['recordId']) == '970006',
          'FR7 HTTP pagination applies actual offset')
    check(query(channelType=' email ')['total'] == 4, 'FR7 HTTP channel filter normalizes case and whitespace')
    page = query(channelType=' email ', sendStatus=' failed ', templateCode='PA', bizType='A', receiverId=701)
    check(page['total'] == 1 and str(page['rows'][0]['recordId']) == '970001',
          'FR7 HTTP combines channel status partial template business receiver and date filters')
    check(query(receiverId=703)['total'] == 3 and query(templateCode='OTHER')['total'] == 3,
          'FR7 HTTP independent receiver and template filters')
    check(query(beginTime='2031-01-15 13:00:00', endTime='2031-01-15 15:00:00')['total'] == 3,
          'FR7 HTTP exact timestamp boundaries are inclusive')
    check(all(not any('cipher' in key.lower() or 'encrypted' in key.lower() for key in row)
              for row in query()['rows']), 'FR7 HTTP records expose no ciphertext fields')
    date_query = '?' + urlencode({'beginTime': '2031-01-15', 'endTime': '2031-01-15'})
    stats = request(path + '/statistics' + date_query)
    check((stats['total'], stats['success'], stats['failed'], stats['unknown']) == (7, 2, 2, 1)
          and abs(stats['successRate'] - 2 / 7) < 1e-9, 'FR7 HTTP status totals and overall success rate')
    check(stats['channelSuccessRates'] == {'EMAIL': .25, 'INTERNAL': 1, 'SMS': 0}
          and stats['templateSuccessRates'] == {'PAY': .5, 'OTHER': 0, 'THIRD': 0},
          'FR7 HTTP channel and named-template rates use correct denominators')
    check(stats['topFailureReasons'] == [{'reason': 'REJECTED', 'count': 2}],
          'FR7 HTTP failure ranking excludes unresolved skipped and successful record details')
    empty = request(path + '/statistics?beginTime=2031-02-01&endTime=2031-02-01')
    check(empty['total'] == 0 and empty['successRate'] == 0 and not empty['topFailureReasons']
          and not empty['channelSuccessRates'] and not empty['templateSuccessRates'],
          'FR7 HTTP empty statistics return zero and empty groups')
    tenant_page = request(path + '/list' + date_query, user='tenant')
    check(tenant_page['total'] == 1 and str(tenant_page['rows'][0]['recordId']) == '970010',
          'FR7 HTTP tenant query sees only its own records')
    tenant_stats = request(path + '/statistics' + date_query, user='tenant')
    check(tenant_stats['total'] == 1 and tenant_stats['topFailureReasons'] == [{'reason': 'FOREIGN', 'count': 1}],
          'FR7 HTTP tenant statistics exclude other tenant data')

    tied_ids = list(range(971000, 971013))
    sql('INSERT INTO cloud_flow_db.sys_message_record '
        '(record_id,tenant_id,channel_type,send_status,receiver_id,create_time,'
        'receiver_type,title,content,message_category,read_flag) VALUES '
        + ','.join('(' + str(record_id) + ",100000,'INTERNAL','SUCCESS',990000701,"
                   + "'2031-01-17 12:00:00','USER','pagination-check','pagination-content','SYSTEM',1)"
                   for record_id in tied_ids) + ';')
    try:
        expected = [str(record_id) for record_id in reversed(tied_ids)]
        for endpoint in (path + '/list', '/system/message/mine'):
            pages = [request(endpoint + '?' + urlencode({
                'beginTime': '2031-01-17', 'endTime': '2031-01-17',
                'pageNum': number, 'pageSize': 10})) for number in (1, 2)]
            actual = [str(record['recordId']) for page in pages for record in page['rows']]
            check(all(page['total'] == len(tied_ids) for page in pages) and actual == expected,
                  'FR7 equal timestamps paginate by descending unique record ID ' + endpoint)
    finally:
        sql('DELETE FROM cloud_flow_db.sys_message_record WHERE tenant_id=100000 AND record_id IN ('
            + ','.join(map(str, tied_ids)) + ');')

    context['SESSION'].cookies.clear()
    base = 'http://127.0.0.1:' + str(context['SERVICES']['auth1']['port'])
    token = context['login'](base, next(account for account in accounts if account['username'] == 'g_import_readonly'))
    clients['readonly'] = client(token)
    request(path + '/list', user='readonly', denied=True)
    request(path + '/statistics', user='readonly', denied=True)
    request(path + '/970001/resend', {}, 'POST', user='readonly', denied=True)

    first = sql("SELECT record_id FROM cloud_flow_db.sys_message_record WHERE biz_id='"
                + prefix + "-unsupported-0' AND channel_type='SMS' AND send_status='FAILED';")
    check(first.isdigit(), 'FR7 resend source is a real SDK failed delivery')
    context['sdk']('sms', 1, prefix + '-resend-batch')
    wait(lambda: sql("SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE biz_id='"
                     + prefix + "-resend-batch-0' AND send_status='FAILED';") == '1', 30, 'second resend source')
    second = sql("SELECT record_id FROM cloud_flow_db.sys_message_record WHERE biz_id='"
                 + prefix + "-resend-batch-0' AND send_status='FAILED';")
    originals = {source: sql('SELECT * FROM cloud_flow_db.sys_message_record WHERE record_id=' + source + ';')
                 for source in (first, second)}
    denied = request(path + '/' + first + '/resend', {}, 'POST', user='tenant')
    check(denied['requested'] == 1 and denied['accepted'] == 0, 'FR7 cross-tenant resend queues nothing')
    single = request(path + '/' + first + '/resend', {}, 'POST')
    check(single['requested'] == 1 and single['accepted'] == 1, 'FR7 HTTP single failed resend accepted')

    def descendants(source):
        return sql('SELECT COUNT(*) FROM cloud_flow_db.sys_message_record WHERE tenant_id=100000 AND resend_from_id='
                   + source + ';')

    wait(lambda: descendants(first) == '1', 30, 'single resend creates one linked record via outbox and Redis')
    batch = request(path + '/' + ','.join((first, second, '970002', '970003', '970010', '-1')) + '/resend', {}, 'POST')
    check(batch['requested'] == 6 and batch['accepted'] == 2,
          'FR7 HTTP batch accepts failed only and skips success unknown foreign and absent records')
    wait(lambda: descendants(second) == '1', 30, 'batch resend creates one linked record via outbox and Redis')
    time.sleep(2)
    check(descendants(first) == '1' and descendants(second) == '1',
          'FR7 repeated source in batch does not create a duplicate record')
    check(all(sql('SELECT * FROM cloud_flow_db.sys_message_record WHERE record_id=' + source + ';') == original
              for source, original in originals.items()), 'FR7 resend preserves every original record field')
    for source in (first, second):
        page = request(path + '/list?' + urlencode({'channelType': 'SMS', 'pageSize': 200}))
        linked = [row for row in page['rows'] if str(row.get('resendFromId')) == source]
        check(len(linked) == 1 and str(linked[0]['recordId']) != source and linked[0].get('deliveryId')
              and linked[0]['sendStatus'] == 'FAILED',
              'FR7 HTTP lists distinct linked delivery; unimplemented SMS remains failed')
    proof = {'queryStatisticsFixture': 'owned isolated database rows through actual HTTP',
             'resend': 'actual SDK failed source, authenticated HTTP, outbox, Redis and new linked records',
             'originalRecordsUnchanged': True, 'duplicateSourceCreatesOneRecord': True,
             'provider': 'unimplemented SMS; no vendor call', 'globalComplete': False}
    (context['RUN'] / 'record-http-proof.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
    return proof
