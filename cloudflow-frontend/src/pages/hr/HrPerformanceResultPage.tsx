import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ruleGet } from '@/services/api/hr/rules';
import { getErrorMessage } from '@/utils/errorMessage';
import { showValue } from './rules/RuleWorkspace';

interface PerformanceResult {
  id: string | number;
  objectiveId?: string | number;
  assignmentId?: string | number;
  employeeId?: string | number;
  score?: string | number;
  grade?: string;
  summary?: string;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

const statuses: Record<string, string> = {
  DRAFT: '草稿', SUBMITTED: '已提交', APPROVING: '审批中',
  APPROVED: '已批准', REJECTED: '已驳回', CLOSED: '已关闭', ARCHIVED: '已归档',
};

export default function HrPerformanceResultPage({ resultId }: { resultId: string }) {
  const [state, setState] = useState<{ id: string; result?: PerformanceResult; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (!/^[1-9]\d{0,18}$/.test(resultId) || BigInt(resultId) > 9223372036854775807n) {
      setState({ id: resultId, error: '绩效结果编号无效' });
      return () => { active = false; };
    }
    void ruleGet<PerformanceResult>(`/performance/results/${resultId}`).then(result => {
      if (!active) return;
      setState(String(result?.id) === resultId
        ? { id: resultId, result }
        : { id: resultId, error: '绩效结果不存在或无权查看' });
    }).catch(error => {
      if (active) setState({ id: resultId, error: getErrorMessage(error, '绩效结果加载失败') });
    });
    return () => { active = false; };
  }, [resultId]);
  const current = state?.id === resultId ? state : null;
  const result = current?.result;
  const fields: Array<[string, unknown]> = result ? [
    ['结果编号', result.id], ['员工编号', result.employeeId],
    ['目标编号', result.objectiveId], ['分解编号', result.assignmentId],
    ['得分', result.score], ['等级', result.grade],
    ['状态', statuses[result.status || ''] || result.status],
    ['创建时间', result.createTime], ['更新时间', result.updateTime],
  ] : [];
  return <section className="space-y-4 p-4 pb-24 sm:p-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold text-cf-title">绩效结果</h1><p className="mt-2 text-sm text-cf-subtle">查看关联结果的评分、等级和评价。</p></div>
      <Link className="inline-flex min-h-11 items-center self-start rounded text-sm underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" to="/hr/performance">返回绩效管理</Link>
    </header>
    {!current && <p role="status">正在加载绩效结果…</p>}
    {current?.error && <p role="alert" className="rounded-lg border border-[var(--cf-border)] p-4">{current.error}</p>}
    {result && <article className="space-y-4 rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface)] p-4">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-sm text-cf-subtle">{label}</dt>
          <dd className="mt-1 break-words">{showValue(value)}</dd>
        </div>)}
      </dl>
      <div><h2 className="text-sm text-cf-subtle">评价总结</h2><p className="mt-1 whitespace-pre-wrap break-words">{showValue(result.summary)}</p></div>
    </article>}
  </section>;
}
