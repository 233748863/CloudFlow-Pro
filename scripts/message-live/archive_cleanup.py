"""Archive exact owned A2 live results, then remove their disposable directories."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
from datetime import datetime

import psutil

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.cloudflow-runtime/batch-g-integration'
REFERENCE = BASE / '9799534e1a3a47b5958330f14ae16dc7'
DOCUMENT = ROOT / 'docs/design/A2-全项验收映射-20261016.md'


def reference_state():
    state_file = REFERENCE / 'state.json'
    identities = []
    for item in json.loads(state_file.read_text(encoding='utf-8-sig'))['processes']:
        try:
            process = psutil.Process(item['id'])
            command = ' '.join(process.cmdline())
        except psutil.NoSuchProcess:
            if item['name'] == 'smtp-fixture':
                continue
            raise
        if item['marker'].lower() not in command.lower():
            # The optional Java fixture has exited; Windows may reuse its PID.
            if item['name'] == 'smtp-fixture' and process.name().lower() not in ('java.exe', 'javaw.exe'):
                continue
            raise RuntimeError('Reference identity changed')
        identities.append((process.pid, process.create_time()))
    return hashlib.sha256(state_file.read_bytes()).hexdigest(), identities


def assert_plain(path):
    for item in [path, *path.parents]:
        attributes = item.lstat().st_file_attributes
        if attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise RuntimeError('Linked cleanup path rejected')


proof = reference_state()
targets = []
for name in sys.argv[1:]:
    if not re.fullmatch('[a-f0-9]{32}', name) or name == REFERENCE.name:
        raise ValueError('Exact owned run ID required')
    path = BASE / name
    assert_plain(path)
    result = json.loads((path / 'result.json').read_text(encoding='utf-8'))
    if Path(result['run']).resolve() != path.resolve():
        raise RuntimeError('Run result path mismatch')
    transport = path / 'transport-proof.json'
    if result['passed'] and result.get('scope', 'transport') == 'transport' and not transport.is_file():
        raise RuntimeError('Passed transport result requires its detailed proof')
    http_proof = path / 'http-proof.json'
    if result['passed'] and result.get('scope') == 'http' and not http_proof.is_file():
        raise RuntimeError('Passed HTTP result requires its detailed proof')
    if http_proof.is_file():
        result['httpProof'] = json.loads(http_proof.read_text(encoding='utf-8'))
    browser_proof = path / 'record-browser/result.json'
    if browser_proof.is_file() and not result.get('httpProof', {}).get('recordBrowser'):
        result['recordBrowserProof'] = json.loads(browser_proof.read_text(encoding='utf-8'))
    center_proof = path / 'center-browser/result.json'
    if center_proof.is_file() and not result.get('httpProof', {}).get('centerBrowser'):
        result['centerBrowserProof'] = json.loads(center_proof.read_text(encoding='utf-8'))
    hr_proof = path / 'hr-approval-proof.json'
    realtime_proof = path / 'realtime-browser/result.json'
    if realtime_proof.is_file() and not result.get('httpProof', {}).get('realtimeBrowser'):
        result['realtimeBrowserProof'] = json.loads(realtime_proof.read_text(encoding='utf-8'))
    subscribe_proof = path / 'subscribe-browser/result.json'
    if subscribe_proof.is_file() and not result.get('httpProof', {}).get('subscribeBrowser'):
        result['subscribeBrowserProof'] = json.loads(subscribe_proof.read_text(encoding='utf-8'))
    announcement_proof = path / 'announcement-browser/result.json'
    if announcement_proof.is_file() and not result.get('httpProof', {}).get('announcementBrowser'):
        result['announcementBrowserProof'] = json.loads(announcement_proof.read_text(encoding='utf-8'))
    if hr_proof.is_file():
        result['hrApprovalProof'] = json.loads(hr_proof.read_text(encoding='utf-8'))
    if transport.is_file():
        details = json.loads(transport.read_text(encoding='utf-8'))
        publishing = details['publishing']
        notices = details['notices']
        auth1 = set(publishing['auth1'])
        auth2 = set(publishing['auth2'])
        result['transportProof'] = {
            'publishedByInstance': {name: len(ids) for name, ids in publishing.items()},
            'dualUnionCount': len(auth1 | auth2),
            'dualOverlapCount': len(auth1 & auth2),
            'noticeCount': len(notices),
            'distinctNoticeCount': len({notice['title'] for notice in notices}),
            'allCreateTimesText': all(isinstance(notice.get('createTime'), str)
                                      and bool(notice['createTime']) for notice in notices)}
    tracked = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '--', str(path.relative_to(ROOT))],
                             check=True, capture_output=True, text=True,
                             creationflags=subprocess.CREATE_NO_WINDOW)
    if tracked.stdout.strip():
        raise RuntimeError('Tracked files protected')
    for process in psutil.process_iter(['pid', 'cmdline', 'exe']):
        if process.pid == psutil.Process().pid:
            continue
        command = ' '.join(process.info['cmdline'] or []).replace('\\', '/').lower()
        if str(path).replace('\\', '/').lower() in command or ('redis-' + name + '.conf') in command:
            raise RuntimeError('Active owned process protected')
    files = []
    for item in path.rglob('*'):
        if item.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
            raise RuntimeError('Linked cleanup child rejected')
        if item.is_file():
            files.append(item)
    targets.append((path, result, len(files), sum(item.stat().st_size for item in files)))
if not targets:
    raise ValueError('At least one exact run ID required')
before = shutil.disk_usage(ROOT.anchor).free
with DOCUMENT.open('a', encoding='utf-8') as output:
    for path, result, count, size in targets:
        output.write('\n\n' + datetime.now().astimezone().isoformat() + ' A2 独立进程验收 ' + result['round'].upper()
                     + '（' + path.name + '）：' + json.dumps(result, ensure_ascii=False)
                     + '。直接运行当前 target/classes、资源和缓存依赖，无整套复制；完整产品基线仍 B184/F135/R63。'
                     + ('五类代表业务链路通过；其他业务分支、页面和 A2 全项仍须按验收映射补验。'
                        if result['passed'] and result.get('httpProof', {}).get('business', {}).get('fiveBusinessRepresentativeChainsComplete')
                        else '本记录仅覆盖列出的实际检查，不能认定五类业务端到端或 A2 全项通过。')
                     + '已核实绝对路径、所有祖先及子项无链接、无受控文件、无运行进程使用；准备清理 '
                     + str(count) + ' 个文件、' + str(size) + ' 逻辑字节；删除前磁盘可用 ' + str(before) + ' 字节。')
for path, result, count, size in targets:
    shutil.rmtree(path)
    if path.exists():
        raise RuntimeError('Owned deletion incomplete')
if reference_state() != proof:
    raise RuntimeError('Reference changed during cleanup')
after = shutil.disk_usage(ROOT.anchor).free
summary = {'directories': len(targets), 'files': sum(item[2] for item in targets),
           'logicalBytes': sum(item[3] for item in targets), 'freeBefore': before, 'freeAfter': after,
           'referenceProcesses': len(proof[1]), 'deleted': True}
with DOCUMENT.open('a', encoding='utf-8') as output:
    output.write('\n清理完成：' + json.dumps(summary, ensure_ascii=False)
                 + '。自有数据库、配置、账号、日志和检查类已删除；空间差值不归因于本项目，参考进程和 state 保持。\n')
print(json.dumps(summary))
