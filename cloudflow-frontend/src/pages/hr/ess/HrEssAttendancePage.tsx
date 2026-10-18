import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import type { HrRecord } from '@/services/api/hr';
import { ruleGet, rulePost } from '@/services/api/hr/rules';
import { getErrorMessage } from '@/utils/errorMessage';
import { toBackendDateString } from '@/utils/dateFormat';
import { HrCrudPanel } from '../HrDomainWorkspace';
import { RuleFormDialog, RulePage } from '../rules/RuleWorkspace';
import { isMobileDevice } from '@/utils/device';
const MobileAttendanceCheckIn = React.lazy(() => import('@/mobile/pages/MobileAttendanceCheckIn'));

const attendanceNames: Record<string, string> = {
  PRESENT: '出勤', NORMAL: '正常', ABSENT: '缺勤', LATE: '迟到', EARLY_LEAVE: '早退',
  LEAVE: '请假', HOLIDAY: '节假日', REST: '休息', MISSING: '缺卡',
  EARLY_EXIT: '早退', LATE_AND_EARLY: '迟到且早退', HALF_DAY: '半天', BUSINESS_TRIP: '出差', PENDING: '待打卡',
};
const appealNames: Record<string, string> = {
  DRAFT: '草稿', PENDING: '待处理', APPROVED: '已通过', REJECTED: '已驳回', CANCELLED: '已撤回',
};

export default function HrEssAttendancePage() {
  const [showHistory, setShowHistory] = useState(false);
  const mobile = isMobileDevice();
  if (mobile && !showHistory) return <React.Suspense fallback={<p className="p-4">正在加载考勤…</p>}>
    <MobileAttendanceCheckIn onShowHistory={() => setShowHistory(true)} />
  </React.Suspense>;
  return <HrEssAttendanceWorkspace onReturnToPunch={mobile ? () => setShowHistory(false) : undefined} />;
}

function HrEssAttendanceWorkspace({ onReturnToPunch }: { onReturnToPunch?: () => void }) {
  const [rows, setRows] = useState<HrRecord[]>([]);
  const [appeals, setAppeals] = useState<HrRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ cancelId?: number } | null>(null);
  const [form, setForm] = useState<HrRecord>({});
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [records, submissions] = await Promise.all([
        ruleGet('/ess/attendance/records'), ruleGet('/ess/attendance/appeals'),
      ]);
      setRows(records);
      setAppeals(submissions);
    } catch (error) { toast.error(getErrorMessage(error, '本人考勤加载失败')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const punch = (logType: 'IN' | 'OUT') => {
    if (busy) return;
    if (!navigator.geolocation) { toast.error('当前浏览器不支持定位'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(position => {
      void rulePost('/ess/attendance/checkins', {
        logType, latitude: position.coords.latitude, longitude: position.coords.longitude,
      }).then(() => {
        toast.success('打卡已提交，地点有效性由服务器核验');
        return load();
      }).catch(error => toast.error(getErrorMessage(error, '打卡失败'))).finally(() => setBusy(false));
    }, () => {
      toast.error('未取得位置，请允许浏览器定位后重试');
      setBusy(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  return <RulePage title="我的考勤" description="使用服务器时间记录本人打卡；跨夜班次按实际排班归属考勤日。" actions={<>
    {onReturnToPunch && <Button variant="outline" onClick={onReturnToPunch}>返回移动打卡</Button>}
    <Button disabled={busy} onClick={() => punch('IN')}>上班打卡</Button>
    <Button variant="outline" disabled={busy} onClick={() => punch('OUT')}>下班打卡</Button>
    <Button variant="outline" disabled={loading} onClick={() => void load()}>刷新</Button>
  </>}>
    <Tabs defaultValue="records">
      <TabsList><TabsTrigger value="records">每日考勤</TabsTrigger><TabsTrigger value="appeals">我的考勤申诉</TabsTrigger></TabsList>
      <TabsContent value="records"><HrCrudPanel<HrRecord> title="每日考勤结论" rows={rows} loading={loading} pageSize={20} columns={[
        { key: 'attendanceDate', label: '考勤日' },
        { key: 'status', label: '结论', render: row => attendanceNames[row.status] || row.status },
        { key: 'firstCheckinTime', label: '首次打卡' }, { key: 'lastCheckoutTime', label: '末次打卡' },
        { key: 'workMinutes', label: '工作分钟' }, { key: 'lateMinutes', label: '迟到分钟' },
      ]} actions={row => [{ label: '考勤申诉', semantic: 'edit', onClick: () => {
        setForm({ attendanceRecordId: row.id, attendanceDate: row.attendanceDate, exceptionType: row.status });
        setDialog({});
      } }]} /></TabsContent>
      <TabsContent value="appeals"><HrCrudPanel<HrRecord> title="本人考勤申诉" rows={appeals} loading={loading} pageSize={20} columns={[
        { key: 'attendanceDate', label: '考勤日' }, { key: 'reason', label: '原因' },
        { key: 'status', label: '状态', render: row => appealNames[row.status] || row.status },
        { key: 'managerRemark', label: '主管意见' }, { key: 'hrRemark', label: '人事意见' },
      ]} actions={row => ['DRAFT', 'PENDING'].includes(row.status) ? [{ label: '撤回', semantic: 'void', onClick: () => {
        setForm({ confirmed: false });
        setDialog({ cancelId: row.id });
      } }] : []} /></TabsContent>
    </Tabs>
    <RuleFormDialog open={dialog !== null} title={dialog?.cancelId ? '撤回考勤申诉' : '提交考勤申诉'} form={form} setForm={setForm} onClose={() => setDialog(null)} fields={dialog?.cancelId ? [
      { key: 'confirmed', label: '确认撤回本次考勤申诉', type: 'checkbox', required: true },
    ] : [
      { key: 'reason', label: '申诉原因', type: 'textarea', required: true },
      { key: 'expectedCheckIn', label: '申请补录上班时刻', type: 'datetime-local' },
      { key: 'expectedCheckOut', label: '申请补录下班时刻', type: 'datetime-local' },
    ]} onSubmit={async values => {
      if (dialog?.cancelId) {
        if (!values.confirmed) throw new Error('请确认撤回');
        await rulePost(`/ess/attendance/appeals/${dialog.cancelId}/cancel`);
        toast.success('考勤申诉已撤回');
      } else {
        await rulePost('/ess/attendance/appeals', {
          ...values,
          expectedCheckIn: values.expectedCheckIn ? toBackendDateString(values.expectedCheckIn) : null,
          expectedCheckOut: values.expectedCheckOut ? toBackendDateString(values.expectedCheckOut) : null,
        });
        toast.success('考勤申诉已提交');
      }
      await load();
    }} />
  </RulePage>;
}
