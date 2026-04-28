import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, ClipboardCheck, RefreshCcw, Users, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { HrEmployee, listEmployees } from '@/services/api/hr';

const normalizeRows = <T,>(data: unknown): T[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (Array.isArray((data as { records?: unknown[] }).records)) {
    return (data as { records: T[] }).records;
  }
  if (Array.isArray((data as { rows?: unknown[] }).rows)) {
    return (data as { rows: T[] }).rows;
  }
  return [];
};

const moduleEntries = [
  {
    title: '员工档案',
    description: '维护员工基础信息和紧急联系人',
    path: '/hr/employees',
    icon: Users,
  },
  {
    title: '人事审批',
    description: '处理休假和加班登记的通过、驳回',
    path: '/hr/approvals',
    icon: ClipboardCheck,
  },
  {
    title: '加班登记',
    description: '按上午、下午、晚上班段折算调休额度',
    path: '/hr/overtime/applications',
    icon: Clock3,
  },
  {
    title: '休假登记',
    description: '单日选择上午、下午或全天并扣减天制额度',
    path: '/hr/leave/application',
    icon: CalendarDays,
  },
  {
    title: '假期额度',
    description: '查看和调整年假、调休等可用额度',
    path: '/hr/leave/quota',
    icon: Wallet,
  },
];

const statusLabel: Record<string, string> = {
  PENDING: '待入职',
  PROBATION: '试用期',
  REGULAR: '正式',
  RESIGNED: '已离职',
};

const HrDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await listEmployees();
      setEmployees(normalizeRows<HrEmployee>(data));
    } catch (error) {
      console.error(error);
      toast.error('员工数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  const summary = useMemo(() => {
    const activeCount = employees.filter((item) => item.employeeStatus !== 'RESIGNED').length;
    const regularCount = employees.filter((item) => item.employeeStatus === 'REGULAR').length;
    const pendingCount = employees.filter((item) => item.employeeStatus === 'PENDING').length;
    return { total: employees.length, activeCount, regularCount, pendingCount };
  }, [employees]);

  const latestEmployees = useMemo(
    () => employees.slice().sort((a, b) => String(b.createTime || '').localeCompare(String(a.createTime || ''))).slice(0, 6),
    [employees],
  );

  return (
    <TablePageLayout
      className="gap-4"
      filters={(
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">HR 轻版工作台</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">保留员工档案、加班登记、休假登记和假期额度</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadEmployees()}>
              <RefreshCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
              刷新
            </Button>
          </div>
        </div>
      )}
      table={(
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['员工总数', summary.total],
                ['在岗员工', summary.activeCount],
                ['正式员工', summary.regularCount],
                ['待入职', summary.pendingCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                  <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {moduleEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => navigate(entry.path)}
                    className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                        <Icon size={18} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{entry.description}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
              最近员工
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">正在加载...</div>
              ) : latestEmployees.length ? (
                latestEmployees.map((employee) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => navigate('/hr/employees')}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900"
                  >
                    <span>
                      <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{employee.name}</span>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                        {employee.employeeNo} · {employee.deptName || '未分配部门'}
                      </span>
                    </span>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      {statusLabel[employee.employeeStatus] || employee.employeeStatus}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">暂无员工档案</div>
              )}
            </div>
          </div>
        </div>
      )}
    />
  );
};

export default HrDashboardPage;
