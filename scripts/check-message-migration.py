"""A2 source/seed migration checks; archive conclusions before deleting generated SQL."""
import hashlib
import json
from datetime import datetime
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
DOCUMENT = ROOT / 'docs/design/A2-全项验收映射-20261016.md'
CHECKS = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    CHECKS.append(label)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def plain(path):
    for item in [path, *path.parents]:
        check(not item.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT,
              'unlinked path ' + str(item))


def main():
    backend = ROOT / 'cloudflow-backend'
    files = []
    for module in backend.iterdir():
        if module.is_dir() and (module / 'src').is_dir():
            files.extend(p for p in (module / 'src').rglob('*') if p.is_file())
    common = backend / 'cloudflow-common'
    for module in common.iterdir():
        if module.is_dir() and (module / 'src').is_dir():
            files.extend(p for p in (module / 'src').rglob('*') if p.is_file())
    files.extend((backend / 'DB').glob('*.sql'))
    files.extend(p for p in (ROOT / 'cloudflow-frontend/src').rglob('*') if p.is_file())
    extensions = {'.java', '.xml', '.sql', '.ts', '.tsx', '.yml', '.yaml', '.properties'}
    sources = {p: p.read_text(encoding='utf-8-sig') for p in files if p.suffix in extensions}
    forbidden = re.compile(r'wf_notice(?!_type)|wf_notification_|hr_self_service_message|HrSelfServiceMessage|WfNotification(?:Config|Log)|ISysNoticeService')
    stale = [(str(p.relative_to(ROOT)), n, line.strip()) for p, source in sources.items()
             for n, line in enumerate(source.splitlines(), 1) if forbidden.search(line)]
    check(not stale, 'business source and formal SQL contain no removed message model: ' + repr(stale[:8]))
    old_dictionary = [(p, line.strip()) for p, source in sources.items()
                      for line in source.splitlines() if 'wf_notice_type' in line]
    expected_dictionary = [
        '-- 先迁数据，避免旧类型被清理后留下悬空的 wf_notice_type 明细。',
        "WHERE dict_type = 'wf_notice_type';",
        "WHERE dict_type = 'wf_notice_type';"]
    check([line for _, line in old_dictionary] == expected_dictionary
          and all(p.name == '06.cloudflow-business-seed.sql' for p, _ in old_dictionary),
          'old dictionary is referenced only by the two required upgrade statements and their comment')
    callers = {
        'oa': ['LicenseBorrowApprovalHandler', 'OaLicenseBorrowServiceImpl', 'OaLicenseServiceImpl',
               'OaRiskScanServiceImpl', 'OaSealApplicationServiceImpl', 'OaSealServiceImpl',
               'OaWorkflowFailureHelper', 'SealApplicationApprovalHandler', 'SyncServiceImpl', 'WorkplaceServiceImpl'],
        'workflow': ['ManualNodeHandler', 'NotificationNodeHandler', 'TaskReminderJob', 'TaskTimeoutJob',
                     'TimerScanJob', 'DeadlockDetectionService', 'AsyncWorkflowServiceImpl',
                     'CountersignServiceImpl', 'DeployEnhancementServiceImpl', 'NodeExecutionServiceImpl',
                     'NotificationServiceImpl', 'WfInstanceServiceImpl', 'WfTaskServiceImpl']}
    details = []
    for module, names in callers.items():
        scope = backend / ('cloudflow-service-' + module) / 'src/main/java'
        for name in names:
            matches = [p for p in sources if p.is_relative_to(scope) and p.stem == name]
            check(len(matches) == 1, module + '/' + name + ' uniquely located')
            source = sources[matches[0]]
            if name in ('SyncServiceImpl', 'WorkplaceServiceImpl'):
                check('OaMessageRecordMapper' in source and 'OaMessageRecord::' in source, name + ' reads unified message model')
                mode = 'unified-read-or-mark-read'
            elif name in ('TaskTimeoutJob', 'TimerScanJob'):
                delegate, invocation = ('TaskTimeoutNotifications', 'timeoutNotifications.manual(') if name == 'TaskTimeoutJob' else ('TimerFailureNotifications', 'timerFailureNotifications::send')
                check(delegate in source and invocation in source, name + ' delegates to unified sender')
                delegated = next(p for p in sources if p.is_relative_to(scope) and p.stem == delegate)
                check('MessageSender' in sources[delegated] and '.send(' in sources[delegated], delegate + ' calls SDK')
                mode = 'delegated-SDK'
            else:
                check('MessageSender' in source and ('.send(' in source), name + ' calls unified SDK')
                mode = 'direct-SDK'
            details.append({'module': module, 'caller': name, 'mode': mode})
    oa_scope = backend / 'cloudflow-service-oa/src/main/java'
    for name in ['SysNotice', 'SysNoticeMapper', 'SysNoticeController', 'InnerNoticeController', 'SysNoticeServiceImpl']:
        check(not any(p.is_relative_to(oa_scope) and p.stem == name for p in sources), 'old OA ' + name + ' removed')
    workflow_scope = backend / 'cloudflow-service-workflow/src/main/java'
    for name in ['WfTaskCandidate', 'WfTaskAttachment', 'WfDeployRecord', 'WfUrgeEffect']:
        matches = [p for p in sources if p.is_relative_to(workflow_scope) and p.stem == name]
        check(len(matches) == 1 and '@TableName(' in sources[matches[0]], name + ' independent entity retained')
    seed = sources[backend / 'DB/06.cloudflow-business-seed.sql']
    for category in ['TODO', 'CC', 'ANNOUNCEMENT', 'SYSTEM', 'BIZ_REMINDER']:
        check("'" + category + "', 'sys_message_category'" in seed, category + ' dictionary seed present')
    for name in ['AnnouncementBell', 'NoticeBell']:
        check(not any(p.stem == name for p in sources), name + ' obsolete component removed')
    api = sources[ROOT / 'cloudflow-frontend/src/services/api/notice.ts']
    check(api.count('/auth/system/message/mine') == 4, 'all four compatibility APIs use unified personal messages')
    inputs = {p: digest(p) for p in sources}
    inputs.update({p: digest(p) for p in (ROOT / 'scripts').glob('*seed*.ps1')})
    run = ROOT / '.cloudflow-runtime/message-migration' / uuid.uuid4().hex
    run.mkdir(parents=True)
    plain(run)
    generated = run / '07.cloudflow-demo-seed.sql'
    before = shutil.disk_usage(ROOT.anchor).free
    failure = None
    output = {}
    try:
        shell = shutil.which('pwsh.exe') or shutil.which('powershell.exe')
        check(bool(shell), 'PowerShell available')
        completed = subprocess.run([shell, '-NoLogo', '-NoProfile', '-File', str(ROOT / 'scripts/generate-demo-seed.ps1'),
                                    '-OutputPath', str(generated)], cwd=ROOT, capture_output=True, text=True,
                                   encoding='utf-8', errors='replace', timeout=240, creationflags=subprocess.CREATE_NO_WINDOW)
        check(completed.returncode == 0, 'formal demo seed generator exits successfully')
        check(generated.is_file(), 'generator creates its exact owned output')
        expected = backend / 'DB/07.cloudflow-demo-seed.sql'
        output = {'generatedBytes': generated.stat().st_size, 'generatedSha256': digest(generated),
                  'formalSha256': digest(expected)}
        check(output['generatedSha256'] == output['formalSha256'], 'formal 07 seed exactly equals full generator output')
        check(all(digest(p) == value for p, value in inputs.items()), 'all checked source seed and generator inputs unchanged')
    except Exception as exception:
        failure = type(exception).__name__ + ': ' + str(exception)
    finally:
        plain(run)
        tracked = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '--', str(run.relative_to(ROOT))],
                                 capture_output=True, text=True, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if tracked.stdout.strip():
            raise RuntimeError('Tracked files protected')
        owned = list(run.iterdir())
        if any(p != generated or not p.is_file() or p.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT for p in owned):
            raise RuntimeError('Unexpected cleanup child protected')
        summary = {'passed': failure is None, 'assertions': len(CHECKS), 'failure': failure,
                   'scannedFiles': len(sources), 'callers': details, **output, 'generatedDirectory': str(run),
                   'cleanupFiles': len(owned), 'cleanupLogicalBytes': sum(p.stat().st_size for p in owned),
                   'freeBefore': before, 'scope': 'source migration and full demo-seed reproducibility only',
                   'businessAcceptanceComplete': False}
        with DOCUMENT.open('a', encoding='utf-8') as stream:
            stream.write('\n\n' + datetime.now().astimezone().isoformat() + ' A2 存量迁移检查：'
                         + json.dumps(summary, ensure_ascii=False)
                         + '。仅覆盖源码、调用链结构和正式种子可重复生成；页面、完整实体功能回归及其他业务分支未据此认定通过。'
                         + '结论已归档，已核实绝对路径、祖先及子项无链接、无受控文件，生成器已退出，准备删除本轮生成副本。\n')
        for item in owned:
            item.unlink()
        run.rmdir()
        summary['freeAfter'] = shutil.disk_usage(ROOT.anchor).free
        summary['deleted'] = not run.exists()
        with DOCUMENT.open('a', encoding='utf-8') as stream:
            stream.write('迁移检查清理完成：' + json.dumps({key: summary[key] for key in
                         ['cleanupFiles', 'cleanupLogicalBytes', 'freeBefore', 'freeAfter', 'deleted']}, ensure_ascii=False)
                         + '；磁盘可用空间差值不归因于本项目。\n')
        print(json.dumps(summary, ensure_ascii=False))
    return 1 if failure else 0


if __name__ == '__main__':
    sys.exit(main())
