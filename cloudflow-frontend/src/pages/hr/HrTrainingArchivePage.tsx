import React, { useCallback, useEffect, useState } from 'react';
import { Archive, RefreshCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTrainingArchive,
  getMyTrainingArchive,
  getEmployeeTrainingArchive,
} from '@/services/api/hr';
import { formatDateValue } from './hrShared';

const StatCard: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br p-5 shadow-sm dark:border-slate-800 ${tone ?? 'from-sky-500/15 to-sky-500/5'}`}>
    <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">{value}</div>
  </div>
);

export const HrTrainingArchivePage: React.FC = () => {
  const [archive, setArchive] = useState<HrTrainingArchive | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');

  const load = useCallback(async (id?: number) => {
    setLoading(true);
    try {
      const data = id ? await getEmployeeTrainingArchive(id) : await getMyTrainingArchive();
      setArchive(data);
    } catch (error) {
      toast.error(getErrorMessage(error, '培训档案加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleQuery = () => {
    const id = Number(employeeId);
    if (!id) { void load(); return; }
    void load(id);
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
          <Archive className="h-5 w-5" />培训档案
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="员工 ID（留空查我的）" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-48" />
          <Button size="sm" variant="outline" onClick={handleQuery}><Search className="mr-1 h-3 w-3" />查询</Button>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCcw className="mr-1 h-3 w-3" />刷新</Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">加载中...</div>
      ) : archive ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="累计学时" value={Number(archive.totalCreditHours ?? 0).toFixed(1)} />
            <StatCard label="已完成课程" value={archive.completedCount} tone="from-emerald-500/15 to-emerald-500/5" />
            <StatCard label="进行中" value={archive.ongoingCount} tone="from-amber-500/15 to-amber-500/5" />
            <StatCard label="获得证书" value={archive.certificateCount} tone="from-violet-500/15 to-violet-500/5" />
          </div>

          <TableSurfaceCard className="p-5">
            <div className="mb-3 text-sm font-semibold">参训记录</div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>班次</TableHead><TableHead>课程</TableHead><TableHead>状态</TableHead><TableHead>完成状态</TableHead><TableHead>分数</TableHead><TableHead>签到时间</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {archive.enrollments?.length ? archive.enrollments.map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.sessionNo || `#${row.sessionId}`}</TableCell>
                    <TableCell>{row.courseName || `#${row.courseId}`}</TableCell>
                    <TableCell>{row.status}</TableCell>
                    <TableCell>{row.completionStatus || '-'}</TableCell>
                    <TableCell>{row.score ?? '-'}</TableCell>
                    <TableCell>{formatDateValue(row.checkInTime)}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-slate-400">无参训记录</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>

          <TableSurfaceCard className="p-5">
            <div className="mb-3 text-sm font-semibold">获得证书</div>
            <Table>
              <TableHeader>
                <TableRow><TableHead>证书号</TableHead><TableHead>课程</TableHead><TableHead>颁发日期</TableHead><TableHead>状态</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {archive.certificates?.length ? archive.certificates.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.certNo}</TableCell>
                    <TableCell>{`#${row.courseId}`}</TableCell>
                    <TableCell>{formatDateValue(row.issueDate)}</TableCell>
                    <TableCell>{row.status === 'VALID' ? '有效' : '已撤销'}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-sm text-slate-400">暂无证书</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableSurfaceCard>
        </>
      ) : (
        <div className="py-12 text-center text-sm text-slate-400">无档案数据</div>
      )}
    </div>
  );
};

export default HrTrainingArchivePage;
