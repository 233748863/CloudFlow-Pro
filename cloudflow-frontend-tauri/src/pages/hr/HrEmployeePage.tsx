import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCcw,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import {
  Button,
  DatePicker,
  DeptSelector,
  Input,
  Label,
  PositionSelector,
  PostSelector,
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
  TableRowActions,
} from '@/components/common';
import { DictBadge } from '@/components/common/DictBadge';
import { DictSelect } from '@/components/common/DictSelect';
import { useDict } from '@/hooks/useDict';
import { cn } from '@/utils/cn';
import {
  HrEmployee,
  HrEmployeePayload,
  PositionOption,
  PostOption,
  createEmployee,
  getDeptTreeOptions,
  getEmployeeDetail,
  getPositionOptions,
  getPostOptions,
  listEmployees,
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

const InlineState = ({
  title,
  className,
}: {
  title: string;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
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
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-14">
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
  <section className="overflow-visible rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
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
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<HrEmployeePayload>(defaultForm);

  const employeeStatusDict = useDict('employee_status');

  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());

  const loadData = async (preferredEmployeeId?: number) => {
    setLoading(true);
    try {
      const [employeeRes, deptRes, postRes, positionRes] = await Promise.all([
        listEmployees(),
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions(),
      ]);
      const nextEmployees = normalizeRows<HrEmployee>(employeeRes);
      setEmployees(nextEmployees);
      setSelectedEmployeeId((prev) => {
        const targetId = preferredEmployeeId ?? prev;
        if (targetId && nextEmployees.some((item) => item.id === targetId)) {
          return targetId;
        }
        return nextEmployees[0]?.id ?? null;
      });
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(normalizeRows<PostOption>(postRes));
      setPositionOptions(normalizeRows<PositionOption>(positionRes));
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '员工数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredEmployees = useMemo(
    () =>
      employees.filter((item) => {
        const matchedKeyword =
          !deferredKeyword
          || [
            item.name,
            item.employeeNo,
            item.deptName,
            item.postName,
            item.positionName,
            item.phone,
            item.email,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(deferredKeyword));
        const matchedStatus = status === 'ALL' || item.employeeStatus === status;
        return matchedKeyword && matchedStatus;
      }),
    [deferredKeyword, employees, status],
  );

  useEffect(() => {
    if (!filteredEmployees.length) {
      setSelectedEmployeeId(null);
      return;
    }

    if (!selectedEmployeeId || !filteredEmployees.some((item) => item.id === selectedEmployeeId)) {
      setSelectedEmployeeId(filteredEmployees[0].id);
    }
  }, [filteredEmployees, selectedEmployeeId]);

  const summary = useMemo(() => {
    const probationCount = employees.filter((item) => item.employeeStatus === 'PROBATION').length;
    const regularCount = employees.filter((item) => item.employeeStatus === 'REGULAR').length;
    const resignedCount = employees.filter((item) => item.employeeStatus === 'RESIGNED').length;

    return {
      total: employees.length,
      filtered: filteredEmployees.length,
      probationCount,
      regularCount,
      resignedCount,
    };
  }, [employees, filteredEmployees.length]);

  const hasActiveFilters = status !== 'ALL' || keyword.trim().length > 0;

  const resetForm = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(false);
  };

  const handleCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
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
        await loadData(editingId);
      } else {
        const createdId = await createEmployee(payload);
        toast.success('员工档案已创建');
        await loadData(createdId);
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
      <TablePageLayout
        className="gap-4"
        filters={(
          <FilterBar
            search={{
              value: keyword,
              onChange: setKeyword,
              placeholder: '按姓名、工号、部门、岗位搜索',
              widthClassName: 'w-full xl:w-80',
            }}
            filters={[
              <div key="status" className="w-full sm:w-40">
                <Select value={status} onValueChange={setStatus}>
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
              </div>,
            ]}
            actions={[
              ...(hasActiveFilters ? [
                <Button
                  key="reset"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setKeyword('');
                    setStatus('ALL');
                  }}
                >
                  重置
                </Button>,
              ] : []),
              <Button key="refresh" variant="outline" size="sm" onClick={() => void loadData(selectedEmployeeId ?? undefined)}>
                <RefreshCcw size={14} className={cn('mr-1.5', loading && 'animate-spin')} />
                刷新
              </Button>,
              <Button key="create" size="sm" onClick={handleCreate}>
                <Plus size={14} className="mr-1.5" />
                新建员工
              </Button>,
            ]}
          />
        )}
        table={(<TableSurfaceCard>
          <div className="grid h-full min-h-[720px] xl:grid-cols-[minmax(0,1.3fr)_minmax(400px,0.94fr)]">
            <div className="min-w-0 xl:border-r xl:border-slate-200 dark:xl:border-slate-800">
              <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">员工列表</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    共 {summary.total} 人，当前筛选 {summary.filtered} 人
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

              <div className="min-h-0 overflow-auto">
                <div className="overflow-x-auto">
                  <Table className="min-w-[840px]">
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                      <TableRow>
                        <TableHead>工号</TableHead>
                        <TableHead>员工信息</TableHead>
                        <TableHead>组织岗位</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="whitespace-nowrap">入职日期</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableStateRow colSpan={6} title="正在加载员工档案..." loading />
                      ) : filteredEmployees.length === 0 ? (
                        <TableStateRow colSpan={6} title="暂无符合条件的员工数据" />
                      ) : (
                        filteredEmployees.map((item) => {
                          const active = selectedEmployeeId === item.id;
                          const employeeMeta = [item.phone, item.email].filter(Boolean).join(' / ') || '暂无联系方式';
                          const organizationMeta = item.deptName || '未分配部门';
                          const positionMeta = [item.postName, item.positionName].filter(Boolean).join(' / ') || '未配置岗位';

                          return (
                            <TableRow
                              key={item.id}
                              className={cn(
                                'cursor-pointer',
                                active && 'bg-cyan-50/70 dark:bg-cyan-950/20',
                              )}
                              onClick={() => setSelectedEmployeeId(item.id)}
                            >
                              <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                                {item.employeeNo}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {item.name}
                                </div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {employeeMeta}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-slate-900 dark:text-slate-100">
                                  {organizationMeta}
                                </div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {positionMeta}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  <DictBadge
                                    dictType="employee_type"
                                    value={item.employeeType}
                                    className="rounded-full"
                                  />
                                  <DictBadge
                                    dictType="employee_status"
                                    value={item.employeeStatus}
                                    className="rounded-full"
                                  />
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{toDateInputValue(item.hireDate) || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div onClick={(event) => event.stopPropagation()}>
                                  <TableRowActions
                                    actions={[
                                      { key: 'detail', semantic: 'view', label: '详情', onClick: () => setSelectedEmployeeId(item.id) },
                                      { key: 'edit', semantic: 'edit', label: '编辑', onClick: () => void handleEdit(item.id) },
                                    ]}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <div className="min-h-0 min-w-0">
              <HrEmployeeWorkspace
                employees={employees}
                selectedEmployeeId={selectedEmployeeId}
                loading={loading}
                onEditEmployee={handleEdit}
              />
            </div>
          </div>
        </TableSurfaceCard>)}
      />

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
              {submitting ? '保存中...' : editingId ? '保存修改' : '创建员工'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <DialogSection title="基础信息">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">姓名</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">手机号</Label>
                <Input
                  value={form.phone || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">邮箱</Label>
                <Input
                  value={form.email || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">入职日期</Label>
                <DatePicker
                  type="date"
                  value={form.hireDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, hireDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">转正日期</Label>
                <DatePicker
                  type="date"
                  value={form.regularDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, regularDate: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">部门</Label>
                <DeptSelector
                  single
                  allowClear
                  value={form.deptId ?? null}
                  onChange={(id) => setForm((prev) => ({ ...prev, deptId: id ?? undefined }))}
                  placeholder="请选择部门"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">岗位</Label>
                <PostSelector
                  single
                  allowClear
                  value={form.postId ?? null}
                  onChange={(id) => setForm((prev) => ({ ...prev, postId: id ?? undefined }))}
                  placeholder="请选择岗位"
                />
              </div>
              <div className="space-y-2">
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
    </>
  );
};

export default HrEmployeePage;
