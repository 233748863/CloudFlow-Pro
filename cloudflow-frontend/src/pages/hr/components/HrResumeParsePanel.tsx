import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Edit, LoaderCircle, RefreshCw, Save, X } from 'lucide-react';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { DictBadge } from '@/components/common/DictBadge';
import {
  hrResumeApi,
  type HrResumeParsedRecord,
  type HrResumeParsedFieldsPayload,
} from '@/services/api/hr/batch2';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';

interface Props {
  open: boolean;
  candidateId: number | null;
  candidateName?: string;
  defaultResumeUrl?: string;
  onClose: () => void;
}

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
          <div className="py-10 text-center text-sm text-cf-faint">
            <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
          </div>
        ) : records.length === 0 ? (
          <div className="py-10 text-center text-sm text-cf-faint">暂无解析记录，点击"重新解析"触发</div>
        ) : (
          <InnerTableSurface>
            <div className="admin-source-section-head border-b border-slate-200 p-4 dark:border-slate-800">
              <div>
                <strong>解析记录</strong>
                <span>{records.length} 条记录，待处理状态可编辑、确认回填或驳回</span>
              </div>
            </div>
              <table className="unity-data-table admin-source-table min-w-[1100px]">
                <thead>
                  <tr>
                    <th>状态</th>
                    <th>候选信息</th>
                    <th>学历 / 技能</th>
                    <th>工作经历</th>
                    <th>置信度</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const isEditing = editingId === record.id;
                    return (
                      <>
                        <tr key={record.id}>
                          <td>
                            <DictBadge dictType="hr_resume_parse_status" value={String(record.status || 'PENDING')} />
                            {record.createTime ? <div className="mt-1 text-xs text-cf-subtle">{record.createTime}</div> : null}
                          </td>
                          <td>
                            <div className="font-medium text-cf-body">{record.parsedName || '-'}</div>
                            <div className="text-xs text-cf-subtle">{record.parsedPhone || '-'}</div>
                            <div className="text-xs text-cf-subtle">{record.parsedEmail || '-'}</div>
                          </td>
                          <td className="max-w-[240px]">
                            <div className="text-sm text-cf-body">{record.parsedEducation || '-'}</div>
                            <div className="line-clamp-2 whitespace-pre-wrap text-xs text-cf-subtle">{record.parsedSkills || '-'}</div>
                          </td>
                          <td className="max-w-[320px]">
                            <div className="line-clamp-3 whitespace-pre-wrap text-xs text-cf-muted">
                              {record.parsedWorkExperience || '-'}
                            </div>
                            {record.reviewRemark ? (
                              <div className="mt-1 text-xs text-cf-subtle">复核意见：{record.reviewRemark}</div>
                            ) : null}
                          </td>
                          <td className="tabular-nums">{formatConfidence(record.confidence)}</td>
                          <td>
                            {record.status === 'PENDING' && !isEditing ? (
                              <div className="admin-users-row-actions">
                                <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => startEdit(record)} disabled={submitting}>
                                  <Edit size={15} />
                                </button>
                                <button type="button" data-tooltip="确认回填" aria-label="确认回填" onClick={() => void confirmRecord(record.id)} disabled={submitting}>
                                  <Check size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  data-tooltip="驳回" aria-label="驳回"
                                  onClick={() => {
                                    setRejectingId(record.id);
                                    setRejectReason('');
                                  }}
                                  disabled={submitting}
                                >
                                  <X size={15} />
                                </button>
                              </div>
                            ) : null}
                            {isEditing ? (
                              <div className="admin-users-row-actions">
                                <button type="button" data-tooltip="取消" aria-label="取消" onClick={cancelEdit} disabled={submitting}>
                                  <X size={15} />
                                </button>
                                <button type="button" data-tooltip="保存" aria-label="保存" onClick={() => void saveEdit(record.id)} disabled={submitting}>
                                  <Save size={15} />
                                </button>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                        {isEditing ? (
                          <tr key={`${record.id}-edit`}>
                            <td colSpan={6}>
                              <div className="admin-source-form-grid py-2">
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
                                <div className="admin-source-form-wide space-y-1">
                                  <Label className="text-xs">工作经历</Label>
                                  <Textarea
                                    rows={3}
                                    value={editForm.parsedWorkExperience || ''}
                                    onChange={(e) => setEditForm((f) => ({ ...f, parsedWorkExperience: e.target.value }))}
                                  />
                                </div>
                                <div className="admin-source-form-wide space-y-1">
                                  <Label className="text-xs">技能</Label>
                                  <Textarea
                                    rows={2}
                                    value={editForm.parsedSkills || ''}
                                    onChange={(e) => setEditForm((f) => ({ ...f, parsedSkills: e.target.value }))}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </>
                    );
                  })}
                </tbody>
              </table>
          </InnerTableSurface>
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
        <div className="admin-source-form-grid">
          <Label>驳回理由（可选）</Label>
          <Textarea className="admin-source-form-wide" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="例如：识别错误、字段缺失等" />
        </div>
      </BaseDialog>
    </>
  );
};

export default HrResumeParsePanel;
