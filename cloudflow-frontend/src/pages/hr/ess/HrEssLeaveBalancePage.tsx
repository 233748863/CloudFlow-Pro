import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrLeaveQuotaVO,
  listHrLeaveQuotas,
  resolveCurrentEmployee,
} from '@/services/api/hr';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + 1 - i);

export const HrEssLeaveBalancePage: React.FC = () => {
  const [rows, setRows] = useState<HrLeaveQuotaVO[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number>(CURRENT_YEAR);

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

  const filters = (
    <FilterBar
      filters={[
        <div key="year" className="w-full sm:w-36">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>)}
            </SelectContent>
          </Select>
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${rows.length} 项` }]}
      actions={[
        <Button key="refresh" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCcw className="mr-1.5 h-4 w-4" />刷新
        </Button>,
      ]}
    />
  );

  const table = (
    <TableSurfaceCard>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <TableHeader className="sticky top-0 z-10">
            <tr>
              <TableHead>假类</TableHead>
              <TableHead>代码</TableHead>
              <TableHead>总额度</TableHead>
              <TableHead>已使用</TableHead>
              <TableHead>剩余</TableHead>
              <TableHead>单位</TableHead>
            </tr>
          </TableHeader>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">
                  <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-sm text-slate-400">暂无额度记录</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.leaveTypeId}-${row.year ?? year}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm font-medium">{row.leaveTypeName || `类型#${row.leaveTypeId}`}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{row.leaveCode || '-'}</td>
                  <td className="px-4 py-3 text-sm">{Number(row.totalQuota ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-sm">{Number(row.usedQuota ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-300">{Number(row.remainQuota ?? 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-sm">{row.unit || '天'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </TableSurfaceCard>
  );

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={table} />
    </div>
  );
};

export default HrEssLeaveBalancePage;
