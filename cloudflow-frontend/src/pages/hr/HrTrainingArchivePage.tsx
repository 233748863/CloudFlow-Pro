import React, { useCallback, useEffect, useState } from 'react';
import { Award, BookOpen, Clock, GraduationCap, RefreshCcw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, StatCard, TableHead, TableHeader } from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrTrainingArchive,
  getMyTrainingArchive,
  getEmployeeTrainingArchive,
} from '@/services/api/hr';
import { formatDateValue } from './hrShared';
import { getTrainingEnrollmentStatusLabel } from '@/utils/enumLabels';

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

  const filters = (
    <FilterBar
      search={{
        value: employeeId,
        onChange: setEmployeeId,
        onSubmit: handleQuery,
        placeholder: '员工 ID(留空查我的)',
        widthClassName: 'w-full sm:w-[200px]',
      }}
      actions={[
        ...(employeeId
          ? [
              <Button key="reset" variant="outline" size="sm" onClick={() => { setEmployeeId(''); void load(); }}>
                <RotateCcw className="mr-1.5 h-4 w-4" />查我的
              </Button>,
            ]
          : []),
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
      ]}
    />
  );

  const table = (
    loading ? (
      <TableSurfaceCard>
        <div className="py-12 text-center text-sm text-slate-400">加载中...</div>
      </TableSurfaceCard>
    ) : !archive ? (
      <TableSurfaceCard>
        <div className="py-12 text-center text-sm text-slate-400">无档案数据</div>
      </TableSurfaceCard>
    ) : (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard title="累计学时" value={Number(archive.totalCreditHours ?? 0).toFixed(1)} icon={<Clock className="h-5 w-5" />} iconVariant="primary" />
          <StatCard title="已完成课程" value={archive.completedCount} icon={<BookOpen className="h-5 w-5" />} iconVariant="success" />
          <StatCard title="进行中" value={archive.ongoingCount} icon={<GraduationCap className="h-5 w-5" />} iconVariant="warning" />
          <StatCard title="获得证书" value={archive.certificateCount} icon={<Award className="h-5 w-5" />} iconVariant="primary" />
        </div>

        <TableSurfaceCard>
          <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">参训记录</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <TableHeader>
                <tr>
                  <TableHead>班次</TableHead>
                  <TableHead>课程</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>完成状态</TableHead>
                  <TableHead>分数</TableHead>
                  <TableHead>签到时间</TableHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {archive.enrollments?.length ? archive.enrollments.map((row: Record<string, unknown>) => (
                  <tr key={String(row.id)}>
                    <td className="px-4 py-2 text-sm">{String(row.sessionNo || `#${row.sessionId}`)}</td>
                    <td className="px-4 py-2 text-sm">{String(row.courseName || `#${row.courseId}`)}</td>
                    <td className="px-4 py-2 text-sm">{getTrainingEnrollmentStatusLabel(row.status as string)}</td>
                    <td className="px-4 py-2 text-sm">{getTrainingEnrollmentStatusLabel(row.completionStatus as string) || '-'}</td>
                    <td className="px-4 py-2 text-sm">{(row.score as React.ReactNode) ?? '-'}</td>
                    <td className="px-4 py-2 text-xs">{formatDateValue(row.checkInTime)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">无参训记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TableSurfaceCard>

        <TableSurfaceCard>
          <div className="px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">获得证书</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <TableHeader>
                <tr>
                  <TableHead>证书号</TableHead>
                  <TableHead>课程</TableHead>
                  <TableHead>颁发日期</TableHead>
                  <TableHead>状态</TableHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {archive.certificates?.length ? archive.certificates.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-mono text-xs">{row.certNo}</td>
                    <td className="px-4 py-2 text-sm">{`#${row.courseId}`}</td>
                    <td className="px-4 py-2 text-xs">{formatDateValue(row.issueDate)}</td>
                    <td className="px-4 py-2 text-sm">{row.status === 'VALID' ? '有效' : '已撤销'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-400">暂无证书</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TableSurfaceCard>
      </div>
    )
  );

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} />
    </div>
  );
};

export default HrTrainingArchivePage;
