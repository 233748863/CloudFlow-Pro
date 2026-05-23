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
  listPerformanceDistributionRules,
  savePerformanceDistributionRule,
  deletePerformanceDistributionRule,
  validatePerformanceDistribution,
  type PerformanceDistributionRule,
} from '@/services/api/hr/performance';
import { getErrorMessage } from '@/utils/errorMessage';

const DEFAULT_DISTRIBUTION = [
  { grade: 'S', percent: 10 },
  { grade: 'A', percent: 30 },
  { grade: 'B', percent: 50 },
  { grade: 'C', percent: 10 },
];

interface Props {
  objectiveId?: number;
  onClose: () => void;
}

export const HrPerformanceDistributionPanel = ({ objectiveId, onClose }: Props) => {
  const [rules, setRules] = useState<PerformanceDistributionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [enforceMode, setEnforceMode] = useState<'BLOCK' | 'WARN'>('BLOCK');
  const [distribution, setDistribution] = useState(DEFAULT_DISTRIBUTION);

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
    void loadData();
  }, [objectiveId]);

  const handleSave = async () => {
    if (!ruleName.trim()) {
      toast.error('规则名称必填');
      return;
    }
    const total = distribution.reduce((acc, item) => acc + Number(item.percent || 0), 0);
    if (total !== 100) {
      toast.error(`各等级配额合计需为 100，当前为 ${total}`);
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
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">强制分布规则</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            刷新
          </Button>
          <Button variant="soft" size="sm" onClick={() => void handleValidate()}>
            校验当前分布
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input placeholder="规则名称(如：销售年终强制分布)" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
        <Select value={enforceMode} onValueChange={(v) => setEnforceMode(v as 'BLOCK' | 'WARN')}>
          <SelectTrigger>
            <SelectValue placeholder="拦截模式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BLOCK">BLOCK 强制拦截</SelectItem>
            <SelectItem value="WARN">WARN 仅提示</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => void handleSave()}>新增规则</Button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {distribution.map((row, idx) => (
          <div key={row.grade} className="flex items-center gap-2">
            <span className="w-8 text-center font-semibold">{row.grade}</span>
            <Input
              value={row.percent}
              onChange={(e) =>
                setDistribution((prev) =>
                  prev.map((item, i) => (i === idx ? { ...item, percent: Number(e.target.value) || 0 } : item)),
                )
              }
            />
            <span>%</span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>规则名</TableHead>
              <TableHead>分布</TableHead>
              <TableHead>模式</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.ruleName}</TableCell>
                <TableCell className="text-xs">
                  {(row.distribution || []).map((d: any) => `${d.grade}:${d.percent}%`).join(' / ')}
                </TableCell>
                <TableCell>{row.enforceMode}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => void handleRemove(row.id || 0)}>
                    删除
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400">
                  暂无规则
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default HrPerformanceDistributionPanel;
