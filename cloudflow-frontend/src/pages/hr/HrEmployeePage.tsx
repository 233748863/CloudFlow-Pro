import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Plus,
  RefreshCcw,
  Search,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  Label,
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
} from '@/components/ui';
import {
  HrEmployee,
  HrEmployeePayload,
  PostOption,
  PositionOption,
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
  employeeStatus: 'PENDING',
  hireDate: '',
};

const statusLabel: Record<string, string> = {
  PENDING: '待入职',
  PROBATION: '试用期',
  REGULAR: '正式员工',
  RESIGNED: '已离职',
};

const typeLabel: Record<string, string> = {
  FULL_TIME: '全职',
  PART_TIME: '兼职',
  INTERN: '实习生',
  CONTRACTOR: '外包',
};

const statusTone = (status?: string | null) => {
  switch (status) {
    case 'REGULAR':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
    case 'PROBATION':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
    case 'RESIGNED':
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
    default:
      return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
  }
};

const typeTone = (type?: string | null) => {
  switch (type) {
    case 'PART_TIME':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200';
    case 'INTERN':
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200';
    case 'CONTRACTOR':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
};

const InlineState = ({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <Users className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow = ({
  colSpan,
  title,
  description,
  loading = false,
}: {
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-14">
      <InlineState
        title={title}
        description={description}
        className={loading ? 'py-6' : 'py-4'}
      />
    </td>
  </tr>
);

const DialogSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {description ? (
        <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
      ) : null}
    </div>
    <div className="p-4">{children}</div>
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
      toast.error('员工数据加载失败');
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
          !keyword
          || [
            item.name,
            item.employeeNo,
            item.deptName,
            item.postName,
            item.positionName,
            item.phone,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword.toLowerCase()));
        const matchedStatus = status === 'ALL' || item.employeeStatus === status;
        return matchedKeyword && matchedStatus;
      }),
    [employees, keyword, status],
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

  const selectedEmployee = useMemo(
    () => employees.find((item) => item.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

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
      toast.error('员工详情获取失败');
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
    // 例如试用期、正式或离职员工，后续工龄和年假规则都依赖入职日期。
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
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Users className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Employee Directory
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          员工档案
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          员工主数据收敛为参考后台列表页语法，先锁定员工，再继续维护合同、证件和紧急联系人。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          总数 {loading ? '--' : summary.total}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          命中 {loading ? '--' : summary.filtered}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          试用期 {loading ? '--' : summary.probationCount}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          正式员工 {loading ? '--' : summary.regularCount}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          已离职 {loading ? '--' : summary.resignedCount}
        </span>
        {selectedEmployee ? (
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
            当前 {selectedEmployee.name}
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadData(selectedEmployeeId ?? undefined)}>
            <RefreshCcw size={14} className={`mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            刷新列表
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus size={14} className="mr-1.5" />
            新建员工
          </Button>
        </div>
      </div>

      <TablePageLayout
        filters={(
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  className="pl-10"
                  placeholder="按姓名、工号、部门、岗位搜索"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>

              <div className="w-full sm:w-40">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="员工状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    <SelectItem value="PENDING">待入职</SelectItem>
                    <SelectItem value="PROBATION">试用期</SelectItem>
                    <SelectItem value="REGULAR">正式员工</SelectItem>
                    <SelectItem value="RESIGNED">已离职</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <Button
                variant="outline"
                onClick={() => {
                  setKeyword('');
                  setStatus('ALL');
                }}
              >
                重置筛选
              </Button>
            </div>
          </div>
        )}
        table={(
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">员工列表</div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  点击行即可切换下方员工档案工作区。
                </div>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                {loading ? '同步中' : `${filteredEmployees.length} 条记录`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1080px]">
                <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                  <TableRow>
                    <TableHead>工号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>部门</TableHead>
                    <TableHead>岗位</TableHead>
                    <TableHead>职位</TableHead>
                    <TableHead>员工类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>入职日期</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableStateRow
                      colSpan={9}
                      title="正在加载员工档案..."
                      description="稍后会展示当前查询范围内的员工主数据。"
                      loading
                    />
                  ) : filteredEmployees.length === 0 ? (
                    <TableStateRow
                      colSpan={9}
                      title="暂无符合条件的员工数据"
                      description="可以调整筛选条件，或先新增一位员工。"
                    />
                  ) : (
                    filteredEmployees.map((item) => (
                      <TableRow
                        key={item.id}
                        className={selectedEmployeeId === item.id ? 'bg-cyan-50/70 dark:bg-cyan-950/20' : 'cursor-pointer'}
                        onClick={() => setSelectedEmployeeId(item.id)}
                      >
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          {item.employeeNo}
                        </TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.deptName || '-'}</TableCell>
                        <TableCell>{item.postName || '-'}</TableCell>
                        <TableCell>{item.positionName || '-'}</TableCell>
                        <TableCell>
                          <span
                            className={[
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              typeTone(item.employeeType),
                            ].join(' ')}
                          >
                            {typeLabel[item.employeeType] || item.employeeType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={[
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              statusTone(item.employeeStatus),
                            ].join(' ')}
                          >
                            {statusLabel[item.employeeStatus] || item.employeeStatus}
                          </span>
                        </TableCell>
                        <TableCell>{toDateInputValue(item.hireDate) || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant={selectedEmployeeId === item.id ? 'default' : 'outline'}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedEmployeeId(item.id);
                              }}
                            >
                              {selectedEmployeeId === item.id ? '已选中' : '查看'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleEdit(item.id);
                              }}
                            >
                              <Edit3 size={14} className="mr-1.5" />
                              编辑
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      />

      <HrEmployeeWorkspace
        employees={employees}
        selectedEmployeeId={selectedEmployeeId}
        loading={loading}
        onEditEmployee={handleEdit}
      />

      <BaseDialog
        open={dialogOpen}
        title={editingId ? '编辑员工档案' : '新建员工档案'}
        description="员工主数据直接写入 HR 标准接口，组织、状态和时间字段保持同一套后台表单语法。"
        onClose={resetForm}
        maxWidthClassName="max-w-5xl"
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
          <DialogSection
            title="基础信息"
            description="先维护工号、姓名、性别、状态和员工类型。"
          >
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
                <Select
                  value={form.employeeStatus}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, employeeStatus: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">待入职</SelectItem>
                    <SelectItem value="PROBATION">试用期</SelectItem>
                    <SelectItem value="REGULAR">正式员工</SelectItem>
                    <SelectItem value="RESIGNED">已离职</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">员工类型</Label>
                <Select
                  value={form.employeeType}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, employeeType: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">全职</SelectItem>
                    <SelectItem value="PART_TIME">兼职</SelectItem>
                    <SelectItem value="INTERN">实习生</SelectItem>
                    <SelectItem value="CONTRACTOR">外包</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">出生日期</Label>
                <Input
                  type="date"
                  value={form.birthDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, birthDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="联系方式与时间"
            description="联系方式会影响流程通知，入转离时间会影响工龄和规则计算。"
          >
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
                <Input
                  type="date"
                  value={form.hireDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, hireDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">转正日期</Label>
                <Input
                  type="date"
                  value={form.regularDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, regularDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">离职日期</Label>
                <Input
                  type="date"
                  value={form.resignDate || ''}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, resignDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="组织与岗位"
            description="部门、岗位和职位决定员工在组织、流程和薪酬中的归属。"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">部门</Label>
                <Select
                  value={form.deptId ? String(form.deptId) : undefined}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, deptId: Number(value) }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择部门" />
                  </SelectTrigger>
                  <SelectContent>
                    {deptOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">岗位</Label>
                <Select
                  value={form.postId ? String(form.postId) : undefined}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, postId: Number(value) }))}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {postOptions.map((option) => (
                      <SelectItem key={option.postId} value={String(option.postId)}>
                        {option.postName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">职位</Label>
                <Select
                  value={form.positionId ? String(form.positionId) : undefined}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, positionId: Number(value) }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="请选择职位" />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.map((option) => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrEmployeePage;
