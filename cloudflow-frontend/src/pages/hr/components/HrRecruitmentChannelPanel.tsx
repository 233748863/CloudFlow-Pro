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
  listRecruitmentChannels,
  saveRecruitmentChannel,
  deleteRecruitmentChannel,
  getRecruitmentChannelStats,
  type RecruitmentChannel,
  type RecruitmentChannelStat,
} from '@/services/api/hr/recruitment';
import { getRecruitChannelStatusLabel } from '@/utils/enumLabels';
import { getErrorMessage } from '@/utils/errorMessage';

const TYPE_OPTIONS = [
  { value: 'PORTAL', label: '招聘门户' },
  { value: 'HEADHUNTER', label: '猎头' },
  { value: 'REFERRAL', label: '内推' },
  { value: 'CAMPUS', label: '校招' },
  { value: 'SOCIAL', label: '社招' },
  { value: 'OTHER', label: '其他' },
];

interface Props {
  onClose: () => void;
}

export const HrRecruitmentChannelPanel = ({ onClose }: Props) => {
  const [channels, setChannels] = useState<RecruitmentChannel[]>([]);
  const [stats, setStats] = useState<RecruitmentChannelStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<RecruitmentChannel>({ status: 'ACTIVE', channelType: 'PORTAL' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, statList] = await Promise.all([listRecruitmentChannels(), getRecruitmentChannelStats()]);
      setChannels(list || []);
      setStats(statList || []);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载渠道失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSave = async () => {
    if (!editing.channelName?.trim() || !editing.channelCode?.trim()) {
      toast.error('渠道编码与名称必填');
      return;
    }
    try {
      await saveRecruitmentChannel(editing);
      toast.success(editing.id ? '已更新' : '已新增');
      setEditing({ status: 'ACTIVE', channelType: 'PORTAL' });
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    }
  };

  const handleRemove = async (id: number) => {
    try {
      await deleteRecruitmentChannel(id);
      toast.success('已删除');
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="text-base font-semibold">招聘渠道维护</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            刷新
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
        <Input
          placeholder="渠道编码"
          value={editing.channelCode || ''}
          onChange={(e) => setEditing((prev) => ({ ...prev, channelCode: e.target.value }))}
        />
        <Input
          placeholder="渠道名称"
          value={editing.channelName || ''}
          onChange={(e) => setEditing((prev) => ({ ...prev, channelName: e.target.value }))}
        />
        <Select
          value={editing.channelType || 'PORTAL'}
          onValueChange={(v) => setEditing((prev) => ({ ...prev, channelType: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="渠道类型" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="渠道费用(年)"
          type="number"
          value={editing.costAmount ?? ''}
          onChange={(e) => setEditing((prev) => ({ ...prev, costAmount: Number(e.target.value) || 0 }))}
        />
        <Input
          placeholder="联系人"
          value={editing.contactName || ''}
          onChange={(e) => setEditing((prev) => ({ ...prev, contactName: e.target.value }))}
        />
        <Input
          placeholder="联系电话"
          value={editing.contactPhone || ''}
          onChange={(e) => setEditing((prev) => ({ ...prev, contactPhone: e.target.value }))}
        />
        <Input
          placeholder="联系邮箱"
          value={editing.contactEmail || ''}
          onChange={(e) => setEditing((prev) => ({ ...prev, contactEmail: e.target.value }))}
        />
        <Button onClick={() => void handleSave()}>{editing.id ? '更新' : '新增'}</Button>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>费用</TableHead>
              <TableHead>候选人数</TableHead>
              <TableHead>录用</TableHead>
              <TableHead>录用率</TableHead>
              <TableHead>人均成本</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => {
              const stat = stats.find((s) => s.id === channel.id);
              return (
                <TableRow key={channel.id}>
                  <TableCell>{channel.channelCode}</TableCell>
                  <TableCell>{channel.channelName}</TableCell>
                  <TableCell>
                    {TYPE_OPTIONS.find((opt) => opt.value === channel.channelType)?.label || channel.channelType}
                  </TableCell>
                  <TableCell>{channel.costAmount?.toLocaleString?.() ?? '-'}</TableCell>
                  <TableCell>{stat?.totalCandidates ?? 0}</TableCell>
                  <TableCell>{stat?.hiredCount ?? 0}</TableCell>
                  <TableCell>{stat?.hireRate != null ? `${(stat.hireRate * 100).toFixed(1)}%` : '-'}</TableCell>
                  <TableCell>{stat?.costPerHire != null ? stat.costPerHire.toLocaleString() : '-'}</TableCell>
                  <TableCell>{getRecruitChannelStatusLabel(channel.status)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="soft" size="sm" onClick={() => setEditing(channel)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleRemove(channel.id || 0)}>
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {channels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-slate-400">
                  暂无渠道
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default HrRecruitmentChannelPanel;
