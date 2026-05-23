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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

const DEFAULT_DISTRIBUTION = [
  { grade: 'S', percent: 10 },
  { grade: 'A', percent: 30 },
  { grade: 'B', percent: 50 },
  { grade: 'C', percent: 10 },
];

const GRADE_TONE: Record<string, string> = {
  S: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/40',
  A: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/40',
  B: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900/40',
  C: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
};

const MODE_TONE: Record<string, string> = {
  BLOCK: 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:ring-rose-800/50',
  WARN: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800/50',
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
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <Plus className="h-4 w-4 text-teal-600 dark:text-teal-300" />
            新增分布规则
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-4">
              {distribution.map((row, idx) => (
                <div
                  key={row.grade}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950/60"
                >
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1',
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
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 tabular-nums',
                totalPercent === 100
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/40'
                  : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/40',
              )}
            >
              {totalPercent === 100 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              合计 {totalPercent}%
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>规则名</TableHead>
                <TableHead>分布</TableHead>
                <TableHead>模式</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((row) => {
                const mode = String(row.enforceMode || '').toUpperCase();
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-700 dark:text-slate-200">{row.ruleName}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(row.distribution || []).map((d: any) => (
                          <span
                            key={d.grade}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 tabular-nums',
                              GRADE_TONE[d.grade] || GRADE_TONE.C,
                            )}
                          >
                            {d.grade} · {d.percent}%
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                          MODE_TONE[mode] || MODE_TONE.WARN,
                        )}
                      >
                        {mode || row.enforceMode}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => void handleRemove(row.id || 0)}>
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="flex flex-col items-center gap-2 py-10 text-slate-400 dark:text-slate-500">
                      <ListChecks className="h-8 w-8 opacity-50" />
                      <span className="text-sm">暂无分布规则，使用上方表单新增</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </BaseDialog>
  );
};

export default HrPerformanceDistributionPanel;
