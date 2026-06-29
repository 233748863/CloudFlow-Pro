import { useEffect, useState } from 'react';
import {
  BaseDialog,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { toast } from 'sonner';
import { CheckCircle2, ListChecks, Plus, RefreshCcw, ShieldAlert, Trash2 } from 'lucide-react';
import {
  listPerformanceDistributionRules,
  savePerformanceDistributionRule,
  deletePerformanceDistributionRule,
  validatePerformanceDistribution,
  type PerformanceDistributionRule,
} from '@/services/api/hr/performance';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

const DEFAULT_DISTRIBUTION = [
  { grade: 'S', percent: 10 },
  { grade: 'A', percent: 30 },
  { grade: 'B', percent: 50 },
  { grade: 'C', percent: 10 },
];

const GRADE_TONE: Record<string, string> = {
  S: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/40',
  A: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40',
  B: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-900/40',
  C: 'bg-[var(--cf-surface-muted)] text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
};

const MODE_TONE: Record<string, string> = {
  BLOCK: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800/50',
  WARN: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50',
};

interface Props {
  open: boolean;
  objectiveId?: number;
  onClose: () => void;
}

export const HrPerformanceDistributionPanel = ({ open, objectiveId, onClose }: Props) => {
  const [rules, setRules] = useState<PerformanceDistributionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [enforceMode, setEnforceMode] = useState<'BLOCK' | 'WARN'>('BLOCK');
  const [distribution, setDistribution] = useState(DEFAULT_DISTRIBUTION);

  const totalPercent = distribution.reduce((acc, item) => acc + Number(item.percent || 0), 0);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await listPerformanceDistributionRules(objectiveId);
      setRules(list || []);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载分布规则失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setRuleName('');
      setDistribution(DEFAULT_DISTRIBUTION);
      return;
    }
    void loadData();
  }, [open, objectiveId]);

  const handleSave = async () => {
    if (!ruleName.trim()) {
      toast.error('规则名称必填');
      return;
    }
    if (totalPercent !== 100) {
      toast.error(`各等级配额合计需为 100，当前为 ${totalPercent}`);
      return;
    }
    try {
      await savePerformanceDistributionRule({
        objectiveId,
        ruleName,
        distribution,
        enforceMode,
        status: 'ACTIVE',
      });
      toast.success('已保存分布规则');
      setRuleName('');
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await deletePerformanceDistributionRule(id);
      toast.success('已删除');
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    }
  };

  const handleValidate = async () => {
    if (!objectiveId) return;
    try {
      const res = (await validatePerformanceDistribution({ objectiveId, grades: [] })) as any;
      const data = res?.data || res;
      if (data?.valid) {
        toast.success('分布校验通过');
      } else {
        toast.warning(`分布校验未通过：${(data?.violations || []).length} 处偏差`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, '校验失败'));
    }
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      width="extra-wide"
      title="强制分布规则"
      description="按 S / A / B / C 各等级配额拉通绩效评定，各等级合计需为 100%"
      bodyClassName="admin-dialog-stack"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="soft" size="sm" onClick={() => void handleValidate()}>
            <CheckCircle2 className="h-4 w-4" />
            校验当前分布
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <div className="admin-source-content-grid">
        <article className="card">
          <div className="admin-source-section-head border-b border-slate-200 p-4 dark:border-slate-800">
            <div>
              <strong>新增分布规则</strong>
              <span>配置等级配额和拦截模式，各等级合计需为 100%</span>
            </div>
            <div className="admin-users-toolbar-actions">
              <Plus className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-3">
            <Input
              placeholder="规则名称(如：销售年终强制分布)"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
            />
            <Select value={enforceMode} onValueChange={(v) => setEnforceMode(v as 'BLOCK' | 'WARN')}>
              <SelectTrigger>
                <SelectValue placeholder="拦截模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BLOCK">BLOCK 强制拦截</SelectItem>
                <SelectItem value="WARN">WARN 仅提示</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void handleSave()} disabled={totalPercent !== 100 || !ruleName.trim()}>
              <Plus className="h-4 w-4" />
              新增规则
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
              {distribution.map((row, idx) => (
                <div
                  key={row.grade}
                  className="flex items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-2 dark:border-slate-800 dark:bg-slate-950"
                >
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold border',
                      GRADE_TONE[row.grade] || GRADE_TONE.C,
                    )}
                  >
                    {row.grade}
                  </span>
                  <Input
                    className="w-full"
                    value={row.percent}
                    onChange={(e) =>
                      setDistribution((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, percent: Number(e.target.value) || 0 } : item)),
                      )
                    }
                  />
                  <span className="text-xs text-slate-500 dark:text-slate-400">%</span>
                </div>
              ))}
            </div>
            <div
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border tabular-nums',
                totalPercent === 100
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/40',
              )}
            >
              {totalPercent === 100 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              合计 {totalPercent}%
            </div>
          </div>
        </article>

        <InnerTableSurface>
            <table className="unity-data-table admin-source-table min-w-[760px]">
              <thead>
                <tr>
                  <th>规则名</th>
                  <th>分布</th>
                  <th>模式</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
              {rules.map((row) => {
                const mode = String(row.enforceMode || '').toUpperCase();
                return (
                  <tr key={row.id}>
                    <td className="font-medium text-slate-700 dark:text-slate-200">{row.ruleName}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(row.distribution || []).map((d: any) => (
                          <span
                            key={d.grade}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border tabular-nums',
                              GRADE_TONE[d.grade] || GRADE_TONE.C,
                            )}
                          >
                            {d.grade} · {d.percent}%
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border',
                          MODE_TONE[mode] || MODE_TONE.WARN,
                        )}
                      >
                        {mode || row.enforceMode}
                      </span>
                    </td>
                    <td>
                      <span className="inline-flex items-center rounded-md bg-[var(--cf-surface-muted)] px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <div className="admin-users-row-actions">
                        <button type="button" className="danger" title="删除" onClick={() => void handleRemove(row.id || 0)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-settings-empty">
                    <div className="flex flex-col items-center gap-2 py-10 text-slate-400 dark:text-slate-500">
                      <ListChecks className="h-8 w-8 opacity-50" />
                      <span className="text-sm">暂无分布规则，使用上方表单新增</span>
                    </div>
                  </td>
                </tr>
              ) : null}
              </tbody>
            </table>
        </InnerTableSurface>
      </div>
    </BaseDialog>
  );
};

export default HrPerformanceDistributionPanel;
