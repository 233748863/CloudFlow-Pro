import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, LoaderCircle, MapPin, Pencil, Plus, RefreshCcw, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTalentCalibrationSession,
  HrTalentReview,
  createCalibrationSession,
  listCalibrationSessions,
  listTalentReviews,
  updateCalibrationSession,
} from '@/services/api/hr';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { useAuth } from '@/context/AuthContext';
import { formatDateTimeValue, normalizeRows } from '../hrShared';
import { DictLabel } from '@/components/common/DictLabel';
import { useDict } from '@/hooks/useDict';

const defaultForm = { sessionNo: '', scheduledAt: '', location: '', agenda: '', minutes: '', status: 'PLANNED' };

const toDateTimePickerValue = (value?: string | null) => {
  if (!value) return '';
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  return match ? `${match[1]}T${match[2]}` : text;
};

export const HrTalentCalibrationPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission?.('hr:talent:review:session') ?? true;
  const canAdd = hasPermission?.('hr:talent:review:session') ?? true;

  const [reviews, setReviews] = useState<HrTalentReview[]>([]);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<HrTalentCalibrationSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HrTalentCalibrationSession | null>(null);
  const [form, setForm] = useState(defaultForm);
  const statusOptions = useDict('hr_talent_calibration_status').getOptions();

  useEffect(() => {
    void (async () => {
      try {
        const res = await listTalentReviews({ pageSize: 200 });
        const list = normalizeRows<HrTalentReview>(res);
        setReviews(list);
        if (list.length) setReviewId(list[0].id);
      } catch (error) {
        toast.error(getErrorMessage(error, '盘点列表加载失败'));
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!reviewId) return;
    setLoading(true);
    try {
      const res = await listCalibrationSessions(reviewId);
      setSessions(normalizeRows<HrTalentCalibrationSession>(res));
    } catch (error) {
      toast.error(getErrorMessage(error, '校准会议加载失败'));
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const openEdit = (s: HrTalentCalibrationSession) => {
    setEditing(s);
    setForm({
      sessionNo: s.sessionNo ?? '',
      scheduledAt: toDateTimePickerValue(s.scheduledAt),
      location: s.location ?? '',
      agenda: s.agenda ?? '',
      minutes: s.minutes ?? '',
      status: s.status ?? 'PLANNED',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!reviewId) {
      toast.error('请先选择盘点活动');
      return;
    }
    try {
      if (editing) {
        await updateCalibrationSession(editing.id, form);
      } else {
        await createCalibrationSession(reviewId, form as never);
      }
      toast.success('已保存');
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const plannedCount = sessions.filter((session) => session.status === 'PLANNED').length;
  const completedCount = sessions.filter((session) => session.status === 'COMPLETED').length;

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">TALENT CALIBRATION</p>
                  <h2>人才校准会议</h2>
                  <span>按盘点活动维护校准会议、议程和会议纪要</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || !reviewId}>
                    <RefreshCcw className={loading ? 'mr-1.5 h-4 w-4 animate-spin' : 'mr-1.5 h-4 w-4'} />刷新
                  </Button>
                  {canAdd ? (
                    <Button size="sm" onClick={openCreate} disabled={!reviewId}>
                      <Plus className="mr-1.5 h-4 w-4" />新建会议
                    </Button>
                  ) : null}
                </div>
              </header>
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <div className="admin-source-stat-icon"><Users size={18} /></div>
                  <div><p>会议总数</p><strong>{sessions.length}</strong><span>当前盘点活动</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <div className="admin-source-stat-icon"><CalendarClock size={18} /></div>
                  <div><p>计划中</p><strong>{plannedCount}</strong><span>待召开会议</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <div className="admin-source-stat-icon"><MapPin size={18} /></div>
                  <div><p>已完成</p><strong>{completedCount}</strong><span>已形成纪要</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span className="input-label">盘点活动</span>
                  <Select value={reviewId ? String(reviewId) : ''} onValueChange={(v) => setReviewId(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="选择盘点活动" /></SelectTrigger>
                    <SelectContent>
                      {reviews.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.reviewName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="admin-users-toolbar-actions">
                <span className="admin-users-filter-count">共 {sessions.length} 条</span>
              </div>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[920px]">
                  <thead>
                    <tr>
                      <th>会议编号</th>
                      <th>时间</th>
                      <th>地点</th>
                      <th>议程</th>
                      <th>状态</th>
                      <th className="text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!reviewId ? (
                      <tr>
                        <td colSpan={6} className="admin-settings-empty">请选择盘点活动</td>
                      </tr>
                    ) : loading ? (
                      <tr>
                        <td colSpan={6} className="admin-settings-empty">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : sessions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="admin-settings-empty">暂无校准会议</td>
                      </tr>
                    ) : (
                      sessions.map((s) => (
                        <tr key={s.id}>
                          <td className="font-mono text-xs">{s.sessionNo}</td>
                          <td>{formatDateTimeValue(s.scheduledAt) || '-'}</td>
                          <td>{s.location || '-'}</td>
                          <td className="max-w-xs truncate">{s.agenda || '-'}</td>
                          <td><DictLabel dictType="hr_talent_calibration_status" value={s.status} fallback="-" /></td>
                          <td>
                            <div className="admin-users-row-actions">
                              {canEdit ? (
                                <button type="button" title="编辑/纪要" onClick={() => openEdit(s)}>
                                  <Pencil size={15} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </InnerTableSurface>
          }
        />
      </section>

      <BaseDialog
        open={open}
        title={editing ? '编辑会议 / 录入纪要' : '新建校准会议'}
        onClose={() => setOpen(false)}
        bodyClassName="admin-dialog-stack"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={!canEdit && !canAdd}>保存</Button>
          </div>
        }
      >
        <>
          <div className="admin-dialog-field"><Label>会议编号</Label><Input value={form.sessionNo} onChange={(e) => setForm((p) => ({ ...p, sessionNo: e.target.value }))} placeholder="留空自动生成" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="admin-dialog-field">
              <Label>时间</Label>
              <DatePicker
                className="h-10"
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((p) => ({ ...p, scheduledAt: e.target.value }))}
              />
            </div>
            <div className="admin-dialog-field"><Label>地点</Label><Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></div>
          </div>
          <div className="admin-dialog-field">
            <Label>状态</Label>
            <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field"><Label>议程</Label><Textarea value={form.agenda} onChange={(e) => setForm((p) => ({ ...p, agenda: e.target.value }))} rows={3} /></div>
          <div className="admin-dialog-field"><Label>会议纪要</Label><Textarea value={form.minutes} onChange={(e) => setForm((p) => ({ ...p, minutes: e.target.value }))} rows={6} /></div>
        </>
      </BaseDialog>
    </>
  );
};

export default HrTalentCalibrationPage;
