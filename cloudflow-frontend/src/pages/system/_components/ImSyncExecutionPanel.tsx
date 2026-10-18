import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common';
import { applyImSync } from '@/services/api/im';
import type { ImSyncReport, ImSyncResult } from '@/services/api/im';
import { platformHttpStatus } from '@/services/api/platformAccess';
import { getAuthSessionVersion } from '@/utils/authStorage';
import { getErrorMessage } from '@/utils/errorMessage';

interface Props {
  report: ImSyncReport;
  enabled: boolean;
  onBusy: (busy: boolean) => void;
  onDenied: () => void;
  onAccepted: (result: ImSyncResult) => void;
}

export function ImSyncExecutionPanel({ report, enabled, onBusy, onDenied, onAccepted }: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const canApply = enabled && report.header.fullSnapshot && !report.configurationChanged && !report.progress?.effectsPending
    && ['PREVIEWED', 'RUNNING'].includes(report.header.status) && /^[a-f0-9]{64}$/.test(report.hash);
  const execute = async () => {
    if (!confirmed || !canApply || locked.current || uncertain) return;
    const session = getAuthSessionVersion();
    const current = () => active.current && session === getAuthSessionVersion();
    locked.current = true; setBusy(true); onBusy(true); setError('');
    try {
      const result = await applyImSync(report.header.syncRunId, report.header.configVersion, report.hash);
      if (current()) onAccepted(result);
    } catch (failure) {
      if (!current()) return;
      const status = platformHttpStatus(failure);
      if (status === 401 || status === 403) onDenied();
      else {
        setUncertain(status == null || status >= 500);
        setConfirmed(false);
        setError(getErrorMessage(failure, '执行结果未确认，请查询原批次进度；不要重新生成批次'));
      }
    } finally {
      locked.current = false;
      if (current()) { setBusy(false); onBusy(false); }
    }
  };
  return <section className="card space-y-3 p-4" aria-label="确认组织同步执行">
    <p>仅执行本报告对应的版本与摘要；冲突项目不写入，其余项目分批处理。组织变更可能使当前登录失效，请重新登录查询原批次。</p>
    {report.progress?.effectsPending && <p role="status">已提交变更正在等待安全清理，后台将自动恢复；此时不能继续业务写入。</p>}
    {error && <p role="alert">{error}</p>}
    {uncertain && <p role="status">已禁止重复提交，请先点击“查询原批次进度”核对结果。</p>}
    <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" checked={confirmed} disabled={busy || !canApply || uncertain}
        onChange={event => setConfirmed(event.target.checked)} />
      我已核对变更，确认执行本批
    </label>
    <Button disabled={busy || !confirmed || !canApply || uncertain} onClick={() => void execute()}>
      {busy ? '正在提交执行…' : report.header.mode === 'APPLY' ? '继续执行本批' : '执行本批'}
    </Button>
  </section>;
}
