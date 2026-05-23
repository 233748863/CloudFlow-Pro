import { useEffect, useState } from 'react';
import {
  BaseDialog,
  Button,
  EmployeeSelector,
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
import { RefreshCcw, Sigma, UserPlus, Users2 } from 'lucide-react';
import {
  invitePerformance360,
  submitPerformance360Response,
  cancelPerformance360Evaluator,
  listPerformance360Evaluators,
  aggregatePerformance360,
  type PerformanceEvaluator,
} from '@/services/api/hr/performance';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';

type EvaluatorSource = 'SELF' | 'MANAGER' | 'PEER' | 'SUBORDINATE' | 'CUSTOMER';

const SOURCE_OPTIONS: Array<{ value: EvaluatorSource; label: string; external?: boolean }> = [
  { value: 'SELF', label: '自评' },
  { value: 'MANAGER', label: '上级' },
  { value: 'PEER', label: '同事' },
  { value: 'SUBORDINATE', label: '下属' },
  { value: 'CUSTOMER', label: '客户（外部）', external: true },
];

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800/50',
  COMPLETED: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800/50',
  CANCELLED: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:ring-slate-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: '待评分',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const isExternalSource = (source: EvaluatorSource) =>
  SOURCE_OPTIONS.find((opt) => opt.value === source)?.external === true;

interface Props {
  open: boolean;
  objectiveId?: number;
  onClose: () => void;
}

export const Hr360EvaluationPanel = ({ open, objectiveId, onClose }: Props) => {
  const [evaluateeId, setEvaluateeId] = useState<number | null>(null);

  const [evaluators, setEvaluators] = useState<PerformanceEvaluator[]>([]);
  const [loading, setLoading] = useState(false);

  const [inviteSource, setInviteSource] = useState<EvaluatorSource>('PEER');
  const [inviteEvaluatorId, setInviteEvaluatorId] = useState<number | null>(null);
  const [inviteExternalId, setInviteExternalId] = useState('');
  const [inviteWeight, setInviteWeight] = useState('1.0');

  const [respondScore, setRespondScore] = useState<Record<number, string>>({});

  const external = isExternalSource(inviteSource);

  const loadData = async () => {
    if (!objectiveId || !evaluateeId) {
      setEvaluators([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listPerformance360Evaluators(objectiveId, evaluateeId);
      setEvaluators(list || []);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载 360 评估列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setEvaluateeId(null);
      setEvaluators([]);
      setInviteEvaluatorId(null);
      setInviteExternalId('');
      setInviteSource('PEER');
      setRespondScore({});
      return;
    }
    void loadData();
  }, [open, objectiveId, evaluateeId]);

  useEffect(() => {
    // 切换来源时清空对应输入，避免内部/外部 ID 串台
    setInviteEvaluatorId(null);
    setInviteExternalId('');
  }, [inviteSource]);

  const resolveEvaluatorId = (): number | null => {
    if (external) {
      const parsed = Number(inviteExternalId);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return inviteEvaluatorId;
  };

  const handleInvite = async () => {
    if (!objectiveId || !evaluateeId) {
      toast.error('请先选择被评人');
      return;
    }
    const evaluatorId = resolveEvaluatorId();
    if (!evaluatorId) {
      toast.error(external ? '请输入外部客户 ID' : '请选择评估人');
      return;
    }
    try {
      await invitePerformance360({
        objectiveId,
        evaluateeId,
        evaluators: [{ evaluatorId, source: inviteSource, weight: Number(inviteWeight) || 1 }],
      });
      toast.success('已邀请评估人');
      setInviteEvaluatorId(null);
      setInviteExternalId('');
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, '邀请失败'));
    }
  };

  const handleSubmitResponse = async (evaluatorId: number) => {
    const scoreStr = respondScore[evaluatorId];
    const score = Number(scoreStr);
    if (!score || score < 0 || score > 100) {
      toast.error('得分需在 0-100 之间');
      return;
    }
    try {
      await submitPerformance360Response({ evaluatorId, score });
      toast.success('已提交评分');
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, '提交失败'));
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await cancelPerformance360Evaluator(id);
      toast.success('已取消');
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, '取消失败'));
    }
  };

  const handleAggregate = async () => {
    if (!objectiveId || !evaluateeId) {
      toast.error('请先选择被评人');
      return;
    }
    try {
      const res = (await aggregatePerformance360(objectiveId, evaluateeId)) as any;
      const data = res?.data || res;
      toast.success(`聚合完成：总分 ${data?.totalScore ?? '-'} / 等级 ${data?.grade ?? '-'}`);
    } catch (err) {
      toast.error(getErrorMessage(err, '聚合失败'));
    }
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      width="extra-wide"
      title="360 度评估"
      description="邀请上级 / 同事 / 下属 / 客户参与多维度评分，自动按权重聚合得分"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading || !evaluateeId}>
            <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button variant="soft" size="sm" onClick={() => void handleAggregate()} disabled={!evaluateeId}>
            <Sigma className="h-4 w-4" />
            聚合得分
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
            <Users2 className="h-4 w-4 text-teal-600 dark:text-teal-300" />
            被评人
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[240px] flex-1">
              <EmployeeSelector
                single
                value={evaluateeId}
                onChange={(id) => setEvaluateeId(id)}
                placeholder="选择被评估员工"
                allowClear
              />
            </div>
            {evaluateeId ? (
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900/40">
                当前被评人 #{evaluateeId}
              </span>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500">未选择被评人，下方列表为空</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <UserPlus className="h-4 w-4 text-teal-600 dark:text-teal-300" />
            邀请评估人
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[180px_minmax(0,1fr)_120px_auto]">
            <Select value={inviteSource} onValueChange={(v) => setInviteSource(v as EvaluatorSource)}>
              <SelectTrigger>
                <SelectValue placeholder="评估来源" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {external ? (
              <Input
                placeholder="外部客户 ID（CRM 客户主键）"
                value={inviteExternalId}
                onChange={(e) => setInviteExternalId(e.target.value)}
              />
            ) : (
              <EmployeeSelector
                single
                value={inviteEvaluatorId}
                onChange={(id) => setInviteEvaluatorId(id)}
                placeholder="选择评估人"
                allowClear
              />
            )}
            <Input
              placeholder="权重"
              value={inviteWeight}
              onChange={(e) => setInviteWeight(e.target.value)}
              type="number"
              step="0.1"
              min="0"
              max="1"
            />
            <Button onClick={() => void handleInvite()} disabled={!evaluateeId}>
              <UserPlus className="h-4 w-4" />
              邀请
            </Button>
          </div>
          {external ? (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              客户来源为外部参与方，需在 CRM 客户表中已存在；权重建议 0-1 之间
            </p>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>评估人</TableHead>
                <TableHead>来源</TableHead>
                <TableHead>权重</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evaluators.map((row) => {
                const statusKey = String(row.status || 'PENDING').toUpperCase();
                const isExternal = String(row.evaluatorSource || '').toUpperCase() === 'CUSTOMER';
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-700 dark:text-slate-200">
                      {isExternal ? `外部客户 #${row.evaluatorId}` : `员工 #${row.evaluatorId}`}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                          isExternal
                            ? 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900/40'
                            : 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700',
                        )}
                      >
                        {SOURCE_OPTIONS.find((opt) => opt.value === row.evaluatorSource)?.label || row.evaluatorSource}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">{row.weight}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                          STATUS_TONE[statusKey] || STATUS_TONE.PENDING,
                        )}
                      >
                        {STATUS_LABEL[statusKey] || row.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Input
                          className="w-24"
                          placeholder="0-100"
                          value={respondScore[row.id || 0] || ''}
                          onChange={(e) =>
                            setRespondScore((prev) => ({ ...prev, [row.id || 0]: e.target.value }))
                          }
                        />
                        <Button variant="soft" size="sm" onClick={() => void handleSubmitResponse(row.id || 0)}>
                          提交评分
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleCancel(row.id || 0)}>
                          取消
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {evaluators.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <div className="flex flex-col items-center gap-2 py-10 text-slate-400 dark:text-slate-500">
                      <Users2 className="h-8 w-8 opacity-50" />
                      <span className="text-sm">
                        {evaluateeId ? '暂无评估人，使用上方表单邀请' : '请先选择被评人'}
                      </span>
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

export default Hr360EvaluationPanel;
