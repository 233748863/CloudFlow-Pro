import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
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
  TableHead,
  TableHeader,
  TableRowActions,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
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
    <div className="space-y-4">
      <FilterBar
        stats={[{ label: '', value: `共 ${rows.length} 条` }]}
        actions={[
          <Button key="refresh" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
          </Button>,
          ...(mine ? [
            <Button key="enroll" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />我要报名
            </Button>,
          ] : []),
        ]}
      />
      <TableSurfaceCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px]">
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>班次</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>签到时间</TableHead>
                <TableHead>结业状态</TableHead>
                <TableHead>分数</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">加载中…</td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{`班次#${row.sessionId}`}</td>
                  <td className="px-4 py-3 text-sm">{row.enrollType === 'SELF' ? '自报' : '指派'}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_enroll_status" value={String(row.status ?? '')} fallback="-" /></td>
                  <td className="px-4 py-3 text-xs">{formatDateTimeValue(row.checkInTime)}</td>
                  <td className="px-4 py-3 text-sm"><DictLabel dictType="hr_enroll_completion" value={String(row.completionStatus ?? '')} fallback="-" /></td>
                  <td className="px-4 py-3 text-sm">{row.score ?? '-'}</td>
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'checkin', semantic: 'confirm', label: '签到', onClick: () => void handleCheckIn(row.id), hidden: !(row.status === 'APPROVED' && !row.checkInTime) },
                        { key: 'complete', semantic: 'confirm', label: '完成', onClick: () => void handleComplete(row.id), hidden: !(row.status === 'APPROVED' && row.checkInTime && row.completionStatus !== 'PASSED') },
                        { key: 'cancel', semantic: 'void', label: '取消', onClick: () => void handleCancel(row.id), hidden: !(row.status === 'PENDING' || row.status === 'APPROVED') },
                      ]}
                    />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
    </div>
  );
};

export const HrTrainingEnrollmentPage: React.FC = () => (
  <div className="space-y-4">
    <Tabs defaultValue="mine" className="space-y-4">
      <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
        <TabsTrigger value="mine" className="flex-1 lg:flex-none">我的报名</TabsTrigger>
        <TabsTrigger value="all" className="flex-1 lg:flex-none">全员报名</TabsTrigger>
      </TabsList>
      <TabsContent value="mine"><EnrollmentList mine /></TabsContent>
      <TabsContent value="all"><EnrollmentList mine={false} /></TabsContent>
    </Tabs>
  </div>
);

export default HrTrainingEnrollmentPage;
