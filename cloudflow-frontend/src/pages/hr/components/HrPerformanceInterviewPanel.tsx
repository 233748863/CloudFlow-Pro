import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Edit, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  Label,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { DictBadge } from '@/components/common/DictBadge';
import {
  hrPerformanceInterviewApi,
  type HrPerformanceInterview,
} from '@/services/api/hr/batch2';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

interface Props {
  open: boolean;
  resultId?: number;
  employeeId?: number;
  employeeName?: string;
  onClose: () => void;
}

const emptyForm = (): HrPerformanceInterview => ({
  interviewTime: '',
  location: '',
  consensus: '',
  improvements: '',
  status: 'DRAFT',
});

export const HrPerformanceInterviewPanel = ({ open, resultId, employeeId, employeeName, onClose }: Props) => {
  const [list, setList] = useState<HrPerformanceInterview[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<HrPerformanceInterview | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HrPerformanceInterview | null>(null);

  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const data = await hrPerformanceInterviewApi.list({ resultId, employeeId });
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载面谈记录失败'));
    } finally {
      setLoading(false);
    }
  }, [open, resultId, employeeId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const startCreate = () => {
    setEditing({ ...emptyForm(), resultId, employeeId, employeeName });
  };

  const startEdit = (item: HrPerformanceInterview) => {
    setEditing({ ...item });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.interviewTime) {
      toast.error('请选择面谈时间');
      return;
    }
    setSubmitting(true);
    try {
      if (editing.id) {
        await hrPerformanceInterviewApi.update(editing.id, editing);
        toast.success('已更新');
      } else {
        await hrPerformanceInterviewApi.create(editing);
        toast.success('已新增');
      }
      setEditing(null);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (id: number) => {
    setSubmitting(true);
    try {
      await hrPerformanceInterviewApi.confirm(id);
      toast.success('已确认');
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '确认失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete?.id) return;
    setSubmitting(true);
    try {
      await hrPerformanceInterviewApi.remove(pendingDelete.id);
      toast.success('已删除');
      setPendingDelete(null);
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '删除失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <BaseDialog
        open={open}
        title={`绩效面谈记录 - ${employeeName || ''}`}
        onClose={onClose}
        width="wide"
        footer={(
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={startCreate}>
              <Plus className="mr-1 h-4 w-4" />新建面谈
            </Button>
            <Button variant="outline" onClick={onClose}>关闭</Button>
          </div>
        )}
      >
        {loading ? (
          <div className="py-10 text-center text-sm text-cf-faint">
            <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
          </div>
        ) : list.length === 0 ? (
          <div className="py-10 text-center text-sm text-cf-faint">暂无面谈记录</div>
        ) : (
          <InnerTableSurface>
            <div className="admin-source-section-head border-b border-slate-200 p-4 dark:border-slate-800">
              <div>
                <strong>面谈记录</strong>
                <span>{list.length} 条记录，草稿状态可编辑、确认或删除</span>
              </div>
            </div>
              <table className="unity-data-table admin-source-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>面谈时间</th>
                    <th>状态</th>
                    <th>参与人</th>
                    <th>双方共识</th>
                    <th>改进项</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="font-medium text-cf-body">{item.interviewTime || '-'}</div>
                        <div className="text-xs text-cf-subtle">{item.location || '-'}</div>
                      </td>
                      <td>
                        <DictBadge dictType="hr_perf_interview_status" value={String(item.status || 'DRAFT')} />
                      </td>
                      <td>
                        <div className="text-sm text-cf-body">{item.interviewerName || '-'}</div>
                        <div className="text-xs text-cf-subtle">HR：{item.hrWitnessName || '-'}</div>
                      </td>
                      <td className="max-w-[260px]">
                        <div className="line-clamp-2 whitespace-pre-wrap text-xs text-cf-muted">
                          {item.consensus || '-'}
                        </div>
                      </td>
                      <td className="max-w-[260px]">
                        <div className="line-clamp-2 whitespace-pre-wrap text-xs text-cf-muted">
                          {item.improvements || '-'}
                        </div>
                      </td>
                      <td>
                        {item.status === 'DRAFT' ? (
                          <div className="admin-users-row-actions">
                            <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => startEdit(item)} disabled={submitting}>
                              <Edit size={15} />
                            </button>
                            <button type="button" data-tooltip="确认" aria-label="确认" onClick={() => item.id && void handleConfirm(item.id)} disabled={submitting}>
                              <Check size={15} />
                            </button>
                            <button type="button" className="danger" data-tooltip="删除" aria-label="删除" onClick={() => setPendingDelete(item)} disabled={submitting}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-cf-faint">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </InnerTableSurface>
        )}
      </BaseDialog>

      <BaseDialog
        open={!!editing}
        title={editing?.id ? '编辑面谈' : '新建面谈'}
        onClose={() => setEditing(null)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={submitting}>保存</Button>
          </div>
        )}
      >
        {editing ? (
          <div className="admin-source-form-grid">
            <div className="space-y-1">
              <Label>面谈时间 *</Label>
              <DatePicker
                type="datetime-local"
                value={editing.interviewTime || ''}
                onChange={(e) => setEditing((cur) => cur ? { ...cur, interviewTime: e.target.value } : cur)}
              />
            </div>
            <div className="space-y-1">
              <Label>面谈地点</Label>
              <Input
                value={editing.location || ''}
                onChange={(e) => setEditing((cur) => cur ? { ...cur, location: e.target.value } : cur)}
                placeholder="如 会议室 / 视频会议"
              />
            </div>
            <div className="admin-source-form-wide space-y-1">
              <Label>双方共识</Label>
              <Textarea
                rows={3}
                value={editing.consensus || ''}
                onChange={(e) => setEditing((cur) => cur ? { ...cur, consensus: e.target.value } : cur)}
                placeholder="记录此次面谈达成的共识"
              />
            </div>
            <div className="admin-source-form-wide space-y-1">
              <Label>改进项</Label>
              <Textarea
                rows={3}
                value={editing.improvements || ''}
                onChange={(e) => setEditing((cur) => cur ? { ...cur, improvements: e.target.value } : cur)}
                placeholder="记录后续改进方向"
              />
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除面谈记录"
        message="确认删除该条面谈记录？此操作不可撤销。"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default HrPerformanceInterviewPanel;
