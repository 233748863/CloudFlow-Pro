import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, LoaderCircle, RefreshCw, Save, X } from 'lucide-react';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  hrResumeApi,
  type HrResumeParsedRecord,
  type HrResumeParsedFieldsPayload,
  type ResumeParsedStatus,
} from '@/services/api/hr/batch2';

interface Props {
  open: boolean;
  candidateId: number | null;
  candidateName?: string;
  defaultResumeUrl?: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<ResumeParsedStatus, { label: string; cls: string }> = {
  PENDING: { label: '待复核', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  CONFIRMED: { label: '已确认', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  REJECTED: { label: '已驳回', cls: 'border-rose-200 bg-rose-50 text-rose-700' },
};

const formatConfidence = (value?: number) => {
  if (value === undefined || value === null) return '-';
  return `${Math.round(value * 100)}%`;
};

export const HrResumeParsePanel = ({ open, candidateId, candidateName, defaultResumeUrl, onClose }: Props) => {
  const [records, setRecords] = useState<HrResumeParsedRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<HrResumeParsedFieldsPayload>({});
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchData = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true);
    try {
      const list = await hrResumeApi.listParsed(candidateId);
      setRecords(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error(getErrorMessage(err, '加载解析记录失败'));
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    if (open && candidateId) {
      void fetchData();
    } else {
      setRecords([]);
      setEditingId(null);
      setEditForm({});
    }
  }, [open, candidateId, fetchData]);

  const triggerParse = async () => {
    if (!candidateId) return;
    if (!defaultResumeUrl) {
      toast.error('请先上传简历附件后再触发解析');
      return;
    }
    setSubmitting(true);
    try {
      const firstUrl = (defaultResumeUrl || '').split(',')[0]?.trim();
      if (!firstUrl) {
        toast.error('未找到可解析的简历附件');
        return;
      }
      await hrResumeApi.parse({ candidateId, resumeUrl: firstUrl });
      toast.success('已触发解析，结果稍后回填');
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '触发解析失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (record: HrResumeParsedRecord) => {
    setEditingId(record.id);
    setEditForm({
      parsedName: record.parsedName || '',
      parsedPhone: record.parsedPhone || '',
      parsedEmail: record.parsedEmail || '',
      parsedEducation: record.parsedEducation || '',
      parsedWorkExperience: record.parsedWorkExperience || '',
      parsedSkills: record.parsedSkills || '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id: number) => {
    setSubmitting(true);
    try {
      await hrResumeApi.updateParsed(id, editForm);
      toast.success('已保存');
      setEditingId(null);
      setEditForm({});
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '保存失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmRecord = async (id: number) => {
    setSubmitting(true);
    try {
      await hrResumeApi.confirmParsed(id);
      toast.success('已确认，字段已回填到候选人');
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '确认失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    setSubmitting(true);
    try {
      await hrResumeApi.rejectParsed(rejectingId, rejectReason || undefined);
      toast.success('已驳回');
      setRejectingId(null);
      setRejectReason('');
      void fetchData();
    } catch (err) {
      toast.error(getErrorMessage(err, '驳回失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <BaseDialog
        open={open}
        title={`简历解析 - ${candidateName || ''}`}
        onClose={onClose}
        width="wide"
        footer={(
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => void fetchData()} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" />刷新
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>关闭</Button>
              <Button onClick={() => void triggerParse()} disabled={submitting}>
                {submitting ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
                重新解析
              </Button>
            </div>
          </div>
        )}
      >
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">
            <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
          </div>
        ) : records.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">暂无解析记录，点击"重新解析"触发</div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => {
              const status = STATUS_LABELS[record.status] || STATUS_LABELS.PENDING;
              const isEditing = editingId === record.id;
              return (
                <div key={record.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${status.cls}`}>
                        {status.label}
                      </span>
                      <span>置信度: {formatConfidence(record.confidence)}</span>
                      {record.createTime ? <span>解析时间: {record.createTime}</span> : null}
                    </div>
                    <div className="flex gap-2">
                      {record.status === 'PENDING' && !isEditing ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => startEdit(record)}>编辑</Button>
                          <Button size="sm" onClick={() => void confirmRecord(record.id)} disabled={submitting}>
                            <Check className="mr-1 h-3.5 w-3.5" />确认回填
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRejectingId(record.id);
                              setRejectReason('');
                            }}
                            disabled={submitting}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />驳回
                          </Button>
                        </>
                      ) : null}
                      {isEditing ? (
                        <>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>取消</Button>
                          <Button size="sm" onClick={() => void saveEdit(record.id)} disabled={submitting}>
                            <Save className="mr-1 h-3.5 w-3.5" />保存
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs">姓名</Label>
                        <Input
                          value={editForm.parsedName || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, parsedName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">手机号</Label>
                        <Input
                          value={editForm.parsedPhone || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, parsedPhone: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">邮箱</Label>
                        <Input
                          value={editForm.parsedEmail || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, parsedEmail: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">学历</Label>
                        <Input
                          value={editForm.parsedEducation || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, parsedEducation: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">工作经历</Label>
                        <Textarea
                          rows={3}
                          value={editForm.parsedWorkExperience || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, parsedWorkExperience: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">技能</Label>
                        <Textarea
                          rows={2}
                          value={editForm.parsedSkills || ''}
                          onChange={(e) => setEditForm((f) => ({ ...f, parsedSkills: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <div><span className="text-slate-500">姓名: </span>{record.parsedName || '-'}</div>
                      <div><span className="text-slate-500">手机号: </span>{record.parsedPhone || '-'}</div>
                      <div><span className="text-slate-500">邮箱: </span>{record.parsedEmail || '-'}</div>
                      <div><span className="text-slate-500">学历: </span>{record.parsedEducation || '-'}</div>
                      <div className="sm:col-span-2">
                        <div className="text-slate-500">工作经历:</div>
                        <div className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{record.parsedWorkExperience || '-'}</div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-slate-500">技能:</div>
                        <div className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{record.parsedSkills || '-'}</div>
                      </div>
                      {record.reviewRemark ? (
                        <div className="sm:col-span-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          复核意见: {record.reviewRemark}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </BaseDialog>

      <BaseDialog
        open={rejectingId !== null}
        title="驳回解析结果"
        onClose={() => setRejectingId(null)}
        footer={(
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectingId(null)}>取消</Button>
            <Button onClick={() => void handleReject()} disabled={submitting}>确认驳回</Button>
          </div>
        )}
      >
        <div className="space-y-2">
          <Label>驳回理由（可选）</Label>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="例如：识别错误、字段缺失等" />
        </div>
      </BaseDialog>
    </>
  );
};

export default HrResumeParsePanel;
