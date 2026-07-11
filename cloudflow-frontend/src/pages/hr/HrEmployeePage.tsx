import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Eye,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { getConfigIntSync, useConfigValue } from '@/hooks/useSystemConfig';
import { SYS_HR_EMPLOYEE_DEFAULT_CREATE_MODE, SYS_PAGE_DEFAULT_PAGE_SIZE } from '@/constants/sysConfig';
import { BaseDialog } from '@/components/common/BaseDialog';
import {
  Button,
  DatePicker,
  DeptSelector,
  Input,
  Label,
  Pagination,
  PositionSelector,
  PostSelector,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { DictBadge } from '@/components/common/DictBadge';
import { DictSelect } from '@/components/common/DictSelect';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import { useDict } from '@/hooks/useDict';
import { cn } from '@/utils/cn';
import {
  HrEmployee,
  HrEmployeeCreateMode,
  HrEmployeePayload,
  PositionOption,
  PostOption,
  createEmployee,
  createEmployeeOnboardingRequest,
  getDeptTreeOptions,
  getEmployeeDetail,
  getPositionOptions,
  getPostOptions,
  pageEmployees,
  updateEmployee,
} from '@/services/api/hr';
import { flattenDeptTree, normalizeRows, toDateInputValue } from './hrShared';
import HrEmployeeWorkspace from './HrEmployeeWorkspace';

const defaultForm: HrEmployeePayload = {
  employeeNo: '',
  name: '',
  gender: 'MALE',
  phone: '',
  email: '',
  deptId: undefined,
  postId: undefined,
  positionId: undefined,
  employeeType: 'FULL_TIME',
  employeeStatus: 'PROBATION',
  hireDate: '',
};

const normalizeCreateMode = (value: string): HrEmployeeCreateMode =>
  value.trim().toUpperCase() === 'WORKFLOW' ? 'WORKFLOW' : 'DIRECT';

const InlineState = ({
  title,
  className,
}: {
  title: string;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="admin-source-stat-icon mb-3 h-10 w-10 border border-cyan-100 bg-[#effbfe] text-[#0d95b5] dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-200">
      <Users className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const TableStateRow = ({
  colSpan,
  title,
  loading = false,
}: {
  colSpan: number;
  title: string;
  loading?: boolean;
}) => (
  <tr>
    <td colSpan={colSpan} className="admin-settings-empty">
      <InlineState title={title} className={loading ? 'py-6' : 'py-4'} />
    </td>
  </tr>
);

const DialogSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="card overflow-visible">
    <div className="admin-source-section-head border-b border-slate-200 p-4 dark:border-slate-800">
      <div>
        <strong>{title}</strong>
      </div>
    </div>
    <div className="overflow-visible p-4">{children}</div>
  </section>
);

export const HrEmployeePage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('ALL');
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10));
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<HrEmployeePayload>(defaultForm);
  const [creationMode, setCreationMode] = useState<HrEmployeeCreateMode>('DIRECT');
  const [defaultCreationModeValue] = useConfigValue(SYS_HR_EMPLOYEE_DEFAULT_CREATE_MODE, 'DIRECT');

  const employeeStatusDict = useDict('employee_status');

  const deferredKeyword = useDeferredValue(keyword.trim());

  const loadOptions = useCallback(async () => {
    try {
      const [deptRes, postRes, positionRes] = await Promise.all([
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions(),
      ]);
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(normalizeRows<PostOption>(postRes));
      setPositionOptions(normalizeRows<PositionOption>(positionRes));
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '员工基础选项加载失败'));
    }
  }, []);

  const loadEmployees = useCallback(async (
    preferredEmployeeId?: number,
    overrides?: Partial<{ pageNum: number; pageSize: number; keyword: string; status: string }>,
  ) => {
    setLoading(true);
    try {
      const nextPageNum = overrides?.pageNum ?? pageNum;
      const nextPageSize = overrides?.pageSize ?? pageSize;
      const nextKeyword = overrides?.keyword ?? deferredKeyword;
      const nextStatus = overrides?.status ?? status;
      const employeePage = await pageEmployees({
        pageNum: nextPageNum,
        pageSize: nextPageSize,
        keyword: nextKeyword || undefined,
        employeeStatus: nextStatus === 'ALL' ? undefined : nextStatus,
      });
      const nextEmployees = normalizeRows<HrEmployee>(employeePage.rows || employeePage.records || []);
      setEmployees(nextEmployees);
      setTotal(employeePage.total || 0);
      setSelectedEmployeeId((prev) => {
        const targetId = preferredEmployeeId ?? prev;
        if (targetId && nextEmployees.some((item) => item.id === targetId)) {
          return targetId;
        }
        return nextEmployees[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '员工数据加载失败'));
    } finally {
      setLoading(false);
    }
  }, [deferredKeyword, pageNum, pageSize, status]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const summary = useMemo(() => {
    const probationCount = employees.filter((item) => item.employeeStatus === 'PROBATION').length;
    const regularCount = employees.filter((item) => item.employeeStatus === 'REGULAR').length;
    const resignedCount = employees.filter((item) => item.employeeStatus === 'RESIGNED').length;

    return {
      total,
      pageCount: employees.length,
      probationCount,
      regularCount,
      resignedCount,
    };
  }, [employees, total]);

  const hasActiveFilters = status !== 'ALL' || keyword.trim().length > 0;

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(false);
  };

  const handleCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setCreationMode(normalizeCreateMode(defaultCreationModeValue));
    setDialogOpen(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const detail = await getEmployeeDetail(id);
      setSelectedEmployeeId(id);
      setEditingId(id);
      setForm({
        employeeNo: detail.employeeNo,
        name: detail.name,
        gender: detail.gender,
        birthDate: toDateInputValue(detail.birthDate) || undefined,
        phone: detail.phone || undefined,
        email: detail.email || undefined,
        deptId: detail.deptId || undefined,
        postId: detail.postId || undefined,
        positionId: detail.positionId || undefined,
        employeeType: detail.employeeType,
        employeeStatus: detail.employeeStatus,
        hireDate: toDateInputValue(detail.hireDate) || undefined,
        regularDate: toDateInputValue(detail.regularDate) || undefined,
        resignDate: toDateInputValue(detail.resignDate) || undefined,
      });
      setDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '员工详情获取失败'));
    }
  };

  const handleViewDetail = (id: number) => {
    setSelectedEmployeeId(id);
    setDetailDialogOpen(true);
  };

  const handleEditFromDetail = (id: number) => {
    setDetailDialogOpen(false);
    void handleEdit(id);
  };

  const closeDetailDialog = () => {
    setDetailDialogOpen(false);
  };

  const validateForm = () => {
    if (!editingId && !form.employeeNo.trim()) {
      toast.error('请先填写工号');
      return false;
    }
    if (!form.name.trim()) {
      toast.error('请先填写姓名');
      return false;
    }
    if (form.employeeStatus !== 'PENDING' && !form.hireDate) {
      toast.error('待入职之外的员工状态必须填写入职日期');
      return false;
    }
    if (form.hireDate && form.regularDate && form.regularDate < form.hireDate) {
      toast.error('转正日期不能早于入职日期');
      return false;
    }
    if (form.hireDate && form.resignDate && form.resignDate < form.hireDate) {
      toast.error('离职日期不能早于入职日期');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const payload: HrEmployeePayload = {
      employeeNo: form.employeeNo.trim(),
      name: form.name.trim(),
      gender: form.gender,
      birthDate: form.birthDate || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      deptId: form.deptId ?? null,
      postId: form.postId ?? null,
      positionId: form.positionId ?? null,
      employeeType: form.employeeType,
      employeeStatus: form.employeeStatus,
      hireDate: form.hireDate || null,
      regularDate: form.regularDate || null,
      resignDate: form.resignDate || null,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        const { employeeNo, ...updatePayload } = payload;
        await updateEmployee(editingId, updatePayload);
        toast.success('员工档案已更新');
        setPageNum(1);
        await loadEmployees(editingId, { pageNum: 1 });
      } else {
        if (creationMode === 'WORKFLOW') {
          const result = await createEmployeeOnboardingRequest(payload);
          toast.success(`入职审批已提交（${result.applicationNo}）`);
        } else {
          const createdId = await createEmployee(payload);
          toast.success('员工档案已创建');
          setPageNum(1);
          await loadEmployees(createdId, { pageNum: 1 });
        }
      }
      resetForm();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
            <div>
              <p className="admin-source-kicker">HR EMPLOYEES</p>
              <h2>员工档案</h2>
              <span>维护员工基础资料、组织岗位和在职状态</span>
            </div>
            <div className="admin-source-controls">
              <Button variant="outline" size="sm" onClick={() => void loadEmployees(selectedEmployeeId ?? undefined)}>
                <RefreshCcw size={14} className={cn('mr-1.5', loading && 'animate-spin')} />
                刷新
              </Button>
              <Button size="sm" onClick={handleCreate}>
                <Plus size={14} className="mr-1.5" />
                新建员工
              </Button>
            </div>
              </header>
        
              <section className="admin-source-stat-grid">
            <article className="card admin-source-stat admin-source-tone-blue">
              <div className="admin-source-stat-icon"><Users size={18} /></div>
              <div><p>员工总数</p><strong>{summary.total}</strong><span>当前查询结果</span></div>
            </article>
            <article className="card admin-source-stat admin-source-tone-green">
              <div className="admin-source-stat-icon"><Users size={18} /></div>
              <div><p>正式员工</p><strong>{summary.regularCount}</strong><span>当前页</span></div>
            </article>
            <article className="card admin-source-stat admin-source-tone-amber">
              <div className="admin-source-stat-icon"><Users size={18} /></div>
              <div><p>试用员工</p><strong>{summary.probationCount}</strong><span>当前页</span></div>
            </article>
            <article className="card admin-source-stat admin-source-tone-violet">
              <div className="admin-source-stat-icon"><Users size={18} /></div>
              <div><p>离职员工</p><strong>{summary.resignedCount}</strong><span>当前页</span></div>
            </article>
              </section>
            </>
          }
        
          filters={
            <section className="card admin-users-toolbar">
            <div className="admin-users-filter-grid">
              <label className="admin-source-search">
                <span className="input-label">搜索员工</span>
                <div className="admin-source-search-field">
                  <Search size={16} />
                  <Input
                    className="h-[42px]"
                    type="search"
                    value={keyword}
                    onChange={(event) => {
                      setKeyword(event.target.value);
                      setPageNum(1);
                    }}
                    placeholder="姓名、工号、部门、岗位"
                  />
                </div>
              </label>
              <label>
                <span className="input-label">员工状态</span>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value);
                    setPageNum(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="员工状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {employeeStatusDict.data?.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <div className="admin-users-toolbar-actions">
              {hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setKeyword('');
                    setStatus('ALL');
                    setPageNum(1);
                  }}
                >
                  重置
                </Button>
              ) : null}
            </div>
            </section>
          }
        
          table={
            <InnerTableSurface className="flex min-h-0 flex-1 flex-col" wrapperClassName="flex min-h-0 flex-col">
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">员工列表</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      共 {summary.total} 人，当前页 {summary.pageCount} 人
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span>试用 {summary.probationCount}</span>
                    <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-800" />
                    <span>正式 {summary.regularCount}</span>
                    <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-800" />
                    <span>离职 {summary.resignedCount}</span>
                  </div>
                </div>
        
                <div className="admin-horizontal-scroll">
                    <table className="unity-data-table admin-source-table min-w-[840px]">
                      <thead>
                        <tr>
                          <th>工号</th>
                          <th>员工信息</th>
                          <th>组织岗位</th>
                          <th>状态</th>
                          <th>入职日期</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          <TableStateRow colSpan={6} title="正在加载员工档案..." loading />
                        ) : employees.length === 0 ? (
                          <TableStateRow colSpan={6} title="暂无符合条件的员工数据" />
                        ) : (
                          employees.map((item) => {
                            const employeeMeta = [item.phone, item.email].filter(Boolean).join(' / ') || '暂无联系方式';
                            const organizationMeta = item.deptName || '未分配部门';
                            const positionMeta = [item.postName, item.positionName].filter(Boolean).join(' / ') || '未配置岗位';
        
                            return (
                              <tr key={item.id}>
                                <td className="font-medium text-slate-900 dark:text-slate-100">
                                  {item.employeeNo}
                                </td>
                                <td>
                                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {item.name}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {employeeMeta}
                                  </div>
                                </td>
                                <td>
                                  <div className="text-sm text-slate-900 dark:text-slate-100">
                                    {organizationMeta}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {positionMeta}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex flex-wrap gap-1.5">
                                    <DictBadge
                                      dictType="employee_type"
                                      value={item.employeeType}
                                      className="rounded-md"
                                    />
                                    <DictBadge
                                      dictType="employee_status"
                                      value={item.employeeStatus}
                                      className="rounded-md"
                                    />
                                  </div>
                                </td>
                                <td className="whitespace-nowrap">{toDateInputValue(item.hireDate) || '-'}</td>
                                <td>
                                  <div onClick={(event) => event.stopPropagation()}>
                                    <div className="admin-users-row-actions">
                                      <button type="button" title="详情" onClick={() => void handleViewDetail(item.id)}>
                                        <Eye size={15} />
                                      </button>
                                      <button type="button" title="编辑" onClick={() => void handleEdit(item.id)}>
                                        <Pencil size={15} />
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                </div>
              </div>
        
              {total > 0 ? (
                <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
                  <Pagination
                    total={total}
                    page={pageNum}
                    pageSize={pageSize}
                    onPageChange={setPageNum}
                    onPageSizeChange={(nextPageSize) => {
                      setPageSize(nextPageSize);
                      setPageNum(1);
                    }}
                  />
                </div>
              ) : null}
            </InnerTableSurface>
          }
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={editingId ? '编辑员工档案' : '新建员工档案'}
        onClose={resetForm}
        maxWidthClassName="max-w-5xl"
        bodyClassName="overflow-visible"
        panelClassName="overflow-visible"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetForm}>
              取消
            </Button>
            <Button disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting
                ? (editingId || creationMode === 'DIRECT' ? '保存中...' : '提交中...')
                : editingId
                  ? '保存修改'
                  : creationMode === 'WORKFLOW'
                    ? '提交审批'
                    : '创建员工'}
            </Button>
          </div>
        )}
      >
        <div className="admin-dialog-stack">
          {!editingId ? (
            <DialogSection title="创建方式">
              <div className="admin-dialog-field max-w-md">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">员工档案生成方式</Label>
                <Select
                  value={creationMode}
                  onValueChange={(value) => setCreationMode(normalizeCreateMode(value))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECT">直接创建</SelectItem>
                    <SelectItem value="WORKFLOW">审批通过后创建</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {creationMode === 'WORKFLOW'
                    ? '提交后进入入职审批，审批通过前不会生成员工档案。'
                    : '保存后立即生成员工档案。'}
                </span>
              </div>
            </DialogSection>
          ) : null}
          <DialogSection title="基础信息">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">工号</Label>
                <Input
                  value={form.employeeNo}
                  disabled={Boolean(editingId)}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, employeeNo: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">姓名</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">性别</Label>
                <Select
                  value={form.gender}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, gender: value }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">男</SelectItem>
                    <SelectItem value="FEMALE">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">员工状态</Label>
                <DictSelect
                  dictType="employee_status"
                  value={form.employeeStatus}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, employeeStatus: value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">员工类型</Label>
                <DictSelect
                  dictType="employee_type"
                  value={form.employeeType}
                  onChange={(value) =>
                    setForm((prev) => ({ ...prev, employeeType: value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">出生日期</Label>
                <DatePicker
                  type="date"
                  value={form.birthDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, birthDate: event.target.value }))
                  }
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection title="联系方式与时间">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">手机号</Label>
                <Input
                  value={form.phone || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">邮箱</Label>
                <Input
                  value={form.email || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">入职日期</Label>
                <DatePicker
                  type="date"
                  value={form.hireDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, hireDate: event.target.value }))
                  }
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">转正日期</Label>
                <DatePicker
                  type="date"
                  value={form.regularDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, regularDate: event.target.value }))
                  }
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">离职日期</Label>
                <DatePicker
                  type="date"
                  value={form.resignDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, resignDate: event.target.value }))
                  }
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection title="组织与岗位">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">部门</Label>
                <DeptSelector
                  single
                  allowClear
                  value={form.deptId ?? null}
                  onChange={(id) => setForm((prev) => ({ ...prev, deptId: id ?? undefined }))}
                  placeholder="请选择部门"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">岗位</Label>
                <PostSelector
                  single
                  allowClear
                  value={form.postId ?? null}
                  onChange={(id) => setForm((prev) => ({ ...prev, postId: id ?? undefined }))}
                  placeholder="请选择岗位"
                />
              </div>
              <div className="admin-dialog-field">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位</Label>
                <PositionSelector
                  single
                  allowClear
                  deptId={form.deptId ?? null}
                  value={form.positionId ?? null}
                  onChange={(id) => setForm((prev) => ({ ...prev, positionId: id ?? undefined }))}
                  placeholder="请选择职位"
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>

      <BaseDialog
        open={detailDialogOpen}
        title="员工详情"
        onClose={closeDetailDialog}
        width="full"
        bodyClassName="!p-0 !overflow-y-auto"
        panelClassName="max-h-[92vh]"
      >
        <HrEmployeeWorkspace
          employees={employees}
          selectedEmployeeId={selectedEmployeeId}
          loading={loading}
          onEditEmployee={handleEditFromDetail}
        />
      </BaseDialog>
    </>
  );
};

export default HrEmployeePage;
