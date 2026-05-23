import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Edit, LoaderCircle, Plus, Trash2 } from 'lucide-react';
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
import {
  hrPerformanceInterviewApi,
  type HrPerformanceInterview,
  type PerformanceInterviewStatus,
} from '@/services/api/hr/batch2';

interface Props {
  open: boolean;
  resultId?: number;
  employeeId?: number;
  employeeName?: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<PerformanceInterviewStatus, { label: string; cls: string }> = {
  DRAFT: { label: '草稿', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
  CONFIRMED: { label: '已确认', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
};

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
          <div className="py-10 text-center text-sm text-slate-400">
            <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
          </div>
        ) : list.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">暂无面谈记录</div>
        ) : (
          <div className="space-y-3">
            {list.map((item) => {
              const status = STATUS_LABELS[item.status || 'DRAFT'];
              return (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${status.cls}`}>
                        {status.label}
                      </span>
                      <span className="text-slate-700 dark:text-slate-200">{item.interviewTime}</span>
                      {item.location ? <span className="text-xs text-slate-500">@ {item.location}</span> : null}
                    </div>
                    <div className="flex gap-2">
                      {item.status === 'DRAFT' ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(item)}>
                            <Edit className="mr-1 h-3 w-3" />编辑
                          </Button>
                          <Button size="sm" onClick={() => item.id && void handleConfirm(item.id)} disabled={submitting}>
                            确认
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setPendingDelete(item)} disabled={submitting}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-2 text-xs">
                    <div><span className="text-slate-500">面谈人: </span>{item.interviewerName || '-'}</div>
                    {item.hrWitnessName ? <div><span className="text-slate-500">HR 旁听: </span>{item.hrWitnessName}</div> : null}
                    {item.consensus ? (
                      <div>
                        <div className="text-slate-500">双方共识:</div>
                        <div className="whitespace-pre-wrap rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">{item.consensus}</div>
                      </div>
                    ) : null}
                    {item.improvements ? (
                      <div>
                        <div className="text-slate-500">改进项:</div>
                        <div className="whitespace-pre-wrap rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">{item.improvements}</div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
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
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <div className="space-y-1">
              <Label>双方共识</Label>
              <Textarea
                rows={3}
                value={editing.consensus || ''}
                onChange={(e) => setEditing((cur) => cur ? { ...cur, consensus: e.target.value } : cur)}
                placeholder="记录此次面谈达成的共识"
              />
            </div>
            <div className="space-y-1">
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
