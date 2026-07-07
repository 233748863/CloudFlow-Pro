import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { toast } from 'sonner';
import { Pencil, RefreshCcw, Trash2, X } from 'lucide-react';
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
import { useDict } from '@/hooks/useDict';

interface Props {
  onClose: () => void;
}

export const HrRecruitmentChannelPanel = ({ onClose }: Props) => {
  const channelTypeDict = useDict('hr_recruit_channel_type');
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
    <section className="admin-source-page">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">RECRUITMENT CHANNELS</p>
          <h2>招聘渠道维护</h2>
          <span>维护招聘渠道成本、联系人和转化数据</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
            关闭
          </Button>
        </div>
      </header>

      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
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
            {channelTypeDict.getOptions().map((opt) => (
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
        </div>
        <div className="admin-users-toolbar-actions">
        <Button onClick={() => void handleSave()}>{editing.id ? '更新' : '新增'}</Button>
          <span className="admin-users-filter-count">共 {channels.length} 个渠道</span>
        </div>
      </section>

      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[980px]">
            <thead>
              <tr>
                <th>编码</th>
                <th>名称</th>
                <th>类型</th>
                <th>费用</th>
                <th>候选人数</th>
                <th>录用</th>
                <th>录用率</th>
                <th>人均成本</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
            {channels.map((channel) => {
              const stat = stats.find((s) => s.id === channel.id);
              return (
                <tr key={channel.id}>
                  <td>{channel.channelCode}</td>
                  <td>{channel.channelName}</td>
                  <td>
                    {channelTypeDict.getLabel(String(channel.channelType ?? '')) || '-'}
                  </td>
                  <td>{channel.costAmount?.toLocaleString?.() ?? '-'}</td>
                  <td>{stat?.totalCandidates ?? 0}</td>
                  <td>{stat?.hiredCount ?? 0}</td>
                  <td>{stat?.hireRate != null ? `${(stat.hireRate * 100).toFixed(1)}%` : '-'}</td>
                  <td>{stat?.costPerHire != null ? stat.costPerHire.toLocaleString() : '-'}</td>
                  <td><span className="badge badge-gray">{getRecruitChannelStatusLabel(channel.status)}</span></td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" title="编辑" onClick={() => setEditing(channel)}>
                        <Pencil size={15} />
                      </button>
                      <button type="button" className="danger" title="删除" onClick={() => void handleRemove(channel.id || 0)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {channels.length === 0 ? (
              <tr>
                <td colSpan={10} className="admin-settings-empty">
                  暂无渠道
                </td>
              </tr>
            ) : null}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>
    </section>
  );
};

export default HrRecruitmentChannelPanel;
