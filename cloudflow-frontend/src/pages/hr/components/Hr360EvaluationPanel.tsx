import { useEffect, useState } from 'react';
import {
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
import {
  invitePerformance360,
  submitPerformance360Response,
  cancelPerformance360Evaluator,
  listPerformance360Evaluators,
  aggregatePerformance360,
  type PerformanceEvaluator,
} from '@/services/api/hr/performance';
import { getErrorMessage } from '@/utils/errorMessage';

const SOURCE_OPTIONS: Array<{ value: 'SELF' | 'MANAGER' | 'PEER' | 'SUBORDINATE' | 'CUSTOMER'; label: string }> = [
  { value: 'SELF', label: '自评' },
  { value: 'MANAGER', label: '上级' },
  { value: 'PEER', label: '同事' },
  { value: 'SUBORDINATE', label: '下属' },
  { value: 'CUSTOMER', label: '客户' },
];

interface Props {
  objectiveId?: number;
  evaluateeId?: number;
  onClose: () => void;
}

export const Hr360EvaluationPanel = ({ objectiveId, evaluateeId, onClose }: Props) => {
  const [evaluators, setEvaluators] = useState<PerformanceEvaluator[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEvaluatorId, setInviteEvaluatorId] = useState('');
  const [inviteSource, setInviteSource] = useState<'SELF' | 'MANAGER' | 'PEER' | 'SUBORDINATE' | 'CUSTOMER'>('PEER');
  const [inviteWeight, setInviteWeight] = useState('1.0');
  const [respondScore, setRespondScore] = useState<Record<number, string>>({});

  const loadData = async () => {
    if (!objectiveId || !evaluateeId) return;
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
    void loadData();
  }, [objectiveId, evaluateeId]);

  const handleInvite = async () => {
    if (!objectiveId || !evaluateeId) {
      toast.error('请先选择被评人');
      return;
    }
    const evaluatorId = Number(inviteEvaluatorId);
    if (!evaluatorId) {
      toast.error('评估人 ID 必填');
      return;
    }
    try {
      await invitePerformance360({
        objectiveId,
        evaluateeId,
        evaluators: [{ evaluatorId, source: inviteSource, weight: Number(inviteWeight) || 1 }],
      });
      toast.success('已邀请评估人');
      setInviteEvaluatorId('');
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
    if (!objectiveId || !evaluateeId) return;
    try {
      const res = (await aggregatePerformance360(objectiveId, evaluateeId)) as any;
      const data = res?.data || res;
      toast.success(`聚合完成：总分 ${data?.totalScore ?? '-'} / 等级 ${data?.grade ?? '-'}`);
    } catch (err) {
      toast.error(getErrorMessage(err, '聚合失败'));
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">360 度评估 · 被评人 #{evaluateeId || '-'}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            刷新
          </Button>
          <Button variant="soft" size="sm" onClick={() => void handleAggregate()}>
            聚合得分
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <Input placeholder="评估人 ID" value={inviteEvaluatorId} onChange={(e) => setInviteEvaluatorId(e.target.value)} />
        <Select value={inviteSource} onValueChange={(v) => setInviteSource(v as any)}>
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
        <Input placeholder="权重(0-1)" value={inviteWeight} onChange={(e) => setInviteWeight(e.target.value)} />
        <Button onClick={() => void handleInvite()}>邀请评估人</Button>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>评估人</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>权重</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evaluators.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.evaluatorId}</TableCell>
                <TableCell>
                  {SOURCE_OPTIONS.find((opt) => opt.value === row.evaluatorSource)?.label || row.evaluatorSource}
                </TableCell>
                <TableCell>{row.weight}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Input
                      className="w-20"
                      placeholder="评分"
                      value={respondScore[row.id || 0] || ''}
                      onChange={(e) => setRespondScore((prev) => ({ ...prev, [row.id || 0]: e.target.value }))}
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
            ))}
            {evaluators.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400">
                  暂无评估人
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Hr360EvaluationPanel;
