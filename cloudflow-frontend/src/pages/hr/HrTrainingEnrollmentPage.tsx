import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, RefreshCcw, XCircle } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
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
import { normalizeRows, formatDateTimeValue, enumLabel } from './hrShared';

const enrollStatusLabel: Record<string, string> = {
  PENDING: '待审批',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  WITHDRAWN: '已退出',
};

const completionLabel: Record<string, string> = {
  PENDING: '未结业',
  PASSED: '已通过',
  FAILED: '未通过',
};

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
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-slate-500">{mine ? '我的报名记录' : '全员报名记录'}</div>
        <div className="flex gap-2">
          {mine ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />我要报名
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1 h-3 w-3" />刷新
          </Button>
        </div>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>班次</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>签到时间</TableHead>
              <TableHead>结业状态</TableHead>
              <TableHead>分数</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
            ) : rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{`班次#${row.sessionId}`}</TableCell>
                <TableCell>{row.enrollType === 'SELF' ? '自报' : '指派'}</TableCell>
                <TableCell>{enumLabel(enrollStatusLabel, row.status)}</TableCell>
                <TableCell>{formatDateTimeValue(row.checkInTime)}</TableCell>
                <TableCell>{enumLabel(completionLabel, row.completionStatus)}</TableCell>
                <TableCell>{row.score ?? '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {row.status === 'APPROVED' && !row.checkInTime ? (
                      <Button size="sm" variant="outline" onClick={() => void handleCheckIn(row.id)}>
                        <CheckCircle2 className="mr-1 h-3 w-3" />签到
                      </Button>
                    ) : null}
                    {row.status === 'APPROVED' && row.checkInTime && row.completionStatus !== 'PASSED' ? (
                      <Button size="sm" variant="outline" onClick={() => void handleComplete(row.id)}>完成</Button>
                    ) : null}
                    {row.status === 'PENDING' || row.status === 'APPROVED' ? (
                      <Button size="sm" variant="ghost" onClick={() => void handleCancel(row.id)}>
                        <XCircle className="mr-1 h-3 w-3" />取消
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无记录</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>

      <BaseDialog open={open} title="我要报名" onClose={() => setOpen(false)}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>取消</Button><Button onClick={() => void handleEnroll()}>提交</Button></div>}>
        <div className="space-y-3">
          <div>
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
          <div><Label>备注</Label><Input value={comment} onChange={(e) => setComment(e.target.value)} /></div>
        </div>
      </BaseDialog>
    </>
  );
};

export const HrTrainingEnrollmentPage: React.FC = () => (
  <div className="p-6">
    <div className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-50">培训报名</div>
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">我的报名</TabsTrigger>
        <TabsTrigger value="all">全员报名</TabsTrigger>
      </TabsList>
      <TabsContent value="mine"><EnrollmentList mine /></TabsContent>
      <TabsContent value="all"><EnrollmentList mine={false} /></TabsContent>
    </Tabs>
  </div>
);

export default HrTrainingEnrollmentPage;
