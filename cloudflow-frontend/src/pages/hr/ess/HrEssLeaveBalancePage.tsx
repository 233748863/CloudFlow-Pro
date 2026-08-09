import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Clock, LoaderCircle, RefreshCcw, TimerReset, WalletCards } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
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

  const totalQuota = rows.reduce((sum, row) => sum + Number(row.totalQuota ?? 0), 0);
  const usedQuota = rows.reduce((sum, row) => sum + Number(row.usedQuota ?? 0), 0);
  const remainQuota = rows.reduce((sum, row) => sum + Number(row.remainQuota ?? 0), 0);

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">leave balance</p>
                  <h2>假期余额</h2>
                  <span>查看当前员工年度假期额度、已使用额度和剩余额度。</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                    <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
                  </Button>
                </div>
              </header>
        
              <section className="admin-source-stat-grid">
                <article className="card admin-source-stat admin-source-tone-blue">
                  <span className="admin-source-stat-icon"><CalendarDays size={18} /></span>
                  <div><p>假类数量</p><strong>{rows.length}</strong><span>{year} 年额度项</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-violet">
                  <span className="admin-source-stat-icon"><WalletCards size={18} /></span>
                  <div><p>总额度</p><strong>{totalQuota.toFixed(1)}</strong><span>全部假类合计</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-amber">
                  <span className="admin-source-stat-icon"><TimerReset size={18} /></span>
                  <div><p>已使用</p><strong>{usedQuota.toFixed(1)}</strong><span>已消耗额度</span></div>
                </article>
                <article className="card admin-source-stat admin-source-tone-green">
                  <span className="admin-source-stat-icon"><Clock size={18} /></span>
                  <div><p>剩余额度</p><strong>{remainQuota.toFixed(1)}</strong><span>可申请余额</span></div>
                </article>
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-users-filter-grid">
                <label>
                  <span>年度</span>
                  <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                    <SelectTrigger className="cf-control"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <div className="admin-users-toolbar-actions">
                  <span className="admin-users-filter-count">共 {rows.length} 项</span>
                </div>
              </div>
            </section>
          }
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col">
              <div className="admin-horizontal-scroll">
                <table className="unity-data-table admin-source-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th>假类</th>
                      <th>代码</th>
                      <th>总额度</th>
                      <th>已使用</th>
                      <th>剩余</th>
                      <th>单位</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">
                          <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin" />加载中...
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-cf-faint">暂无额度记录</td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={`${row.leaveTypeId}-${row.year ?? year}`}>
                          <td className="text-sm font-medium">{row.leaveTypeName || `类型#${row.leaveTypeId}`}</td>
                          <td className="text-xs text-cf-subtle">{row.leaveCode || '-'}</td>
                          <td className="text-sm">{Number(row.totalQuota ?? 0).toFixed(1)}</td>
                          <td className="text-sm">{Number(row.usedQuota ?? 0).toFixed(1)}</td>
                          <td className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">{Number(row.remainQuota ?? 0).toFixed(1)}</td>
                          <td className="text-sm">{row.unit || '天'}</td>
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
    </>
  );
};

export default HrEssLeaveBalancePage;
