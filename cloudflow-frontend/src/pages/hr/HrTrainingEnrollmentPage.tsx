import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Plus, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import {
  HrTrainingEnrollment,
  HrTrainingSession,
  listTrainingEnrollments,
  listMyTrainingEnrollments,
  enrollTraining,
  checkInTraining,
  completeTraining,
  cancelTrainingEnrollment,
  listTrainingSessions,
} from '@/services/api/hr';
import { normalizeRows, formatDateTimeValue } from './hrShared';
import { DictLabel } from '@/components/common/DictLabel';

const EnrollmentList: React.FC<{ mine: boolean }> = ({ mine }) => {
  const [rows, setRows] = useState<HrTrainingEnrollment[]>([]);
  const [sessions, setSessions] = useState<HrTrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [comment, setComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetcher = mine ? listMyTrainingEnrollments : listTrainingEnrollments;
      const [enrollRes, sessRes] = await Promise.all([fetcher({ pageSize: 200 }), listTrainingSessions({ pageSize: 500 })]);
      setRows(normalizeRows<HrTrainingEnrollment>(enrollRes));
      setSessions(normalizeRows<HrTrainingSession>(sessRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '报名记录加载失败'));
    } finally {
      setLoading(false);
    }
  }, [mine]);

  useEffect(() => { void load(); }, [load]);

  const handleEnroll = async () => {
    if (!sessionId) {
      toast.error('请选择班次');
      return;
    }
    try {
      await enrollTraining({ sessionId: Number(sessionId), enrollType: 'SELF', comment });
      toast.success('已提交报名');
      setOpen(false);
      setSessionId('');
      setComment('');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '报名失败'));
    }
  };

  const handleCheckIn = async (id: number) => {
    try { await checkInTraining(id); toast.success('已签到'); await load(); } catch (error) { toast.error(getErrorMessage(error, '签到失败')); }
  };

  const handleComplete = async (id: number) => {
    try {
      await completeTraining(id, { completionStatus: 'PASSED' });
      toast.success('已完成');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCancel = async (id: number) => {
    try { await cancelTrainingEnrollment(id); toast.success('已取消'); await load(); } catch (error) { toast.error(getErrorMessage(error, '取消失败')); }
  };

  const registeringSessions = sessions.filter((s) => s.status === 'REGISTERING');

  return (
    <div className="admin-source-content-grid">
      <section className="card admin-users-toolbar">
        <div className="admin-users-filter-grid">
          <div className="admin-users-toolbar-actions">
            <span className="admin-users-filter-count">{`共 ${rows.length} 条`}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
          </Button>
          {mine ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />我要报名
            </Button>
          ) : null}
        </div>
      </section>
      <InnerTableSurface>
        <div className="admin-horizontal-scroll">
          <table className="unity-data-table admin-source-table min-w-[840px]">
            <thead>
              <tr>
                <th>班次</th>
                <th>类型</th>
                <th>状态</th>
                <th>签到时间</th>
                <th>结业状态</th>
                <th>分数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="admin-settings-empty">加载中...</td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.courseName || `课程#${row.courseId ?? '-'}`}</div>
                    <small className="text-cf-subtle">{row.sessionNo || `班次#${row.sessionId}`}</small>
                  </td>
                  <td><span className="badge badge-gray">{row.enrollType === 'SELF' ? '自报' : '指派'}</span></td>
                  <td><DictLabel dictType="hr_enroll_status" value={String(row.status ?? '')} fallback="-" /></td>
                  <td>{formatDateTimeValue(row.checkInTime)}</td>
                  <td><DictLabel dictType="hr_enroll_completion" value={String(row.completionStatus ?? '')} fallback="-" /></td>
                  <td>{row.score ?? '-'}</td>
                  <td>
                    <div className="admin-users-row-actions">
                      {row.status === 'APPROVED' && !row.checkInTime ? (
                        <button type="button" data-tooltip="签到" aria-label="签到" onClick={() => void handleCheckIn(row.id)}>
                          <Check size={15} />
                        </button>
                      ) : null}
                      {row.status === 'APPROVED' && row.checkInTime && row.completionStatus !== 'PASSED' ? (
                        <button type="button" data-tooltip="完成" aria-label="完成" onClick={() => void handleComplete(row.id)}>
                          <Check size={15} />
                        </button>
                      ) : null}
                      {row.status === 'PENDING' || row.status === 'APPROVED' ? (
                        <button type="button" className="danger" data-tooltip="取消" aria-label="取消" onClick={() => void handleCancel(row.id)}>
                          <Ban size={15} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="admin-settings-empty">暂无记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </InnerTableSurface>

      <BaseDialog open={open} title="我要报名" onClose={() => setOpen(false)} bodyClassName="admin-dialog-stack"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleEnroll()}>提交</Button></div>}>
        <>
          <div className="admin-dialog-field">
            <Label>选择班次（仅显示报名中）</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue placeholder="请选择班次" /></SelectTrigger>
              <SelectContent>
                {registeringSessions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {`班次${s.sessionNo || `#${s.id}`} · ${formatDateTimeValue(s.startTime)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field"><Label>备注</Label><Input value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        </>
      </BaseDialog>
    </div>
  );
};

export const HrTrainingEnrollmentPage: React.FC = () => (
  <section className="admin-source-page hr-training-enrollment-page">
    <TablePageLayout
      className="hr-training-enrollment-layout"
      actions={
        <>
          <header className="admin-source-header">
            <div>
              <p className="admin-source-kicker">TRAINING ENROLLMENTS</p>
              <h2>培训报名</h2>
              <span>查看个人报名，维护全员报名签到和结业状态</span>
            </div>
          </header>
          <section className="admin-source-stat-grid">
            <article className="card admin-source-stat admin-source-tone-blue">
              <div className="admin-source-stat-icon"><Plus size={18} /></div>
              <div><p>我的报名</p><strong>个人</strong><span>报名、签到和查看结业</span></div>
            </article>
            <article className="card admin-source-stat admin-source-tone-green">
              <div className="admin-source-stat-icon"><Check size={18} /></div>
              <div><p>全员报名</p><strong>管理</strong><span>跟踪报名状态和成绩</span></div>
            </article>
          </section>
        </>
      }
      table={
        <Tabs defaultValue="mine" className="admin-source-content-grid">
          <TabsList className="admin-source-tabs w-full justify-start overflow-x-auto lg:w-auto">
            <TabsTrigger value="mine" className="flex-1 lg:flex-none">我的报名</TabsTrigger>
            <TabsTrigger value="all" className="flex-1 lg:flex-none">全员报名</TabsTrigger>
          </TabsList>
          <TabsContent value="mine"><EnrollmentList mine /></TabsContent>
          <TabsContent value="all"><EnrollmentList mine={false} /></TabsContent>
        </Tabs>
      }
    />
  </section>
);

export default HrTrainingEnrollmentPage;
