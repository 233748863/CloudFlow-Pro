import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrLeaveQuotaVO,
  listHrLeaveQuotas,
  resolveCurrentEmployee,
} from '@/services/api/hr';

export const HrEssLeaveBalancePage: React.FC = () => {
  const [rows, setRows] = useState<HrLeaveQuotaVO[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const employee = await resolveCurrentEmployee();
      if (!employee?.id) {
        toast.error('未找到当前员工档案');
        setRows([]);
        return;
      }
      const data = await listHrLeaveQuotas({ employeeId: employee.id, year });
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(getErrorMessage(error, '假期余额加载失败'));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-50">
            <CalendarClock className="h-5 w-5" />我的假期余额
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">{year} 年度</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}>← {year - 1}</Button>
          <Button variant="outline" size="sm" onClick={() => setYear(new Date().getFullYear())}>今年</Button>
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}>{year + 1} →</Button>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCcw className="mr-1 h-3 w-3" />刷新
          </Button>
        </div>
      </div>

      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>假类</TableHead>
              <TableHead>代码</TableHead>
              <TableHead>总额度</TableHead>
              <TableHead>已使用</TableHead>
              <TableHead>剩余</TableHead>
              <TableHead>单位</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">加载中...</TableCell></TableRow>
            ) : rows.length ? rows.map((row) => (
              <TableRow key={`${row.leaveTypeId}-${row.year ?? year}`}>
                <TableCell className="font-medium">{row.leaveTypeName || `类型#${row.leaveTypeId}`}</TableCell>
                <TableCell className="text-xs text-slate-500">{row.leaveCode || '-'}</TableCell>
                <TableCell>{Number(row.totalQuota ?? 0).toFixed(1)}</TableCell>
                <TableCell>{Number(row.usedQuota ?? 0).toFixed(1)}</TableCell>
                <TableCell className="font-semibold text-emerald-600 dark:text-emerald-300">
                  {Number(row.remainQuota ?? 0).toFixed(1)}
                </TableCell>
                <TableCell>{row.unit || '天'}</TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">暂无额度记录</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableSurfaceCard>
    </div>
  );
};

export default HrEssLeaveBalancePage;
