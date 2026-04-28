import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, RefreshCcw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  DatePicker,
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
} from '@/components/common';
import {
  HrEmployee,
  HrEmployeePayload,
  PostOption,
  createEmployee,
  getDeptTreeOptions,
  getEmployeeDetail,
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
  employeeType: 'FULL_TIME',
  employeeStatus: 'REGULAR',
  hireDate: '',
};

const statusLabel: Record<string, string> = {
  REGULAR: '正式员工',
  RESIGNED: '已离职',
};

const typeLabel: Record<string, string> = {
  FULL_TIME: '全职',
  PART_TIME: '兼职',
  INTERN: '实习生',
  CONTRACTOR: '外包',
};

const InlineState = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <Users className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const TableStateRow = ({ colSpan, title }: { colSpan: number; title: string }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-14">
      <InlineState title={title} />
    </td>
  </tr>
);

const DialogSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
      {title}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const HrEmployeePage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<HrEmployeePayload>(defaultForm);

  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());

  const loadData = async (preferredEmployeeId?: number) => {
    setLoading(true);
    try {
      const [employeeRes, deptRes, postRes] = await Promise.all([
        listEmployees(),
        getDeptTreeOptions(),
        getPostOptions(),
      ]);
      const nextEmployees = normalizeRows<HrEmployee>(employeeRes);
      setEmployees(nextEmployees);
      setSelectedEmployeeId((prev) => {
        const targetId = preferredEmployeeId ?? prev;
        if (targetId && nextEmployees.some((item) => item.id === targetId)) return targetId;
        return nextEmployees[0]?.id ?? null;
      });
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(normalizeRows<PostOption>(postRes));
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
          !deferredKeyword
          || [item.name, item.employeeNo, item.deptName, item.postName, item.phone, item.email]
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
    if (!form.hireDate) {
      toast.error('员工档案必须填写入职日期');
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="relative w-full xl:w-80">
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
                      <SelectItem value="REGULAR">正式员工</SelectItem>
                      <SelectItem value="RESIGNED">已离职</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void loadData(selectedEmployeeId ?? undefined)}>
                  <RefreshCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                  刷新
                </Button>
                <Button size="sm" onClick={handleCreate}>
                  <Plus size={14} className="mr-1.5" />
                  新建员工
                </Button>
              </div>
            </div>
          </div>
        )}
        table={(
          <div className="grid h-full min-h-[720px] xl:grid-cols-[minmax(0,1.3fr)_minmax(400px,0.94fr)]">
            <div className="min-w-0 xl:border-r xl:border-slate-200 dark:xl:border-slate-800">
              <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">员工列表</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    共 {employees.length} 人，当前筛选 {filteredEmployees.length} 人
                  </div>
                </div>
              </div>

              <div className="min-h-0 overflow-auto">
                <div className="overflow-x-auto">
                  <Table className="min-w-[780px]">
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
                        <TableStateRow colSpan={6} title="正在加载员工档案..." />
                      ) : filteredEmployees.length === 0 ? (
                        <TableStateRow colSpan={6} title="暂无符合条件的员工数据" />
                      ) : (
                        filteredEmployees.map((item) => {
                          const active = selectedEmployeeId === item.id;
                          const employeeMeta = [item.phone, item.email].filter(Boolean).join(' / ') || '暂无联系方式';
                          const organizationMeta = item.deptName || '未分配部门';
                          const postMeta = item.postName || '未配置岗位';

                          return (
                            <TableRow
                              key={item.id}
                              className={active ? 'cursor-pointer bg-cyan-50/70 dark:bg-cyan-950/20' : 'cursor-pointer'}
                              onClick={() => setSelectedEmployeeId(item.id)}
                            >
                              <TableCell className="font-medium text-slate-900 dark:text-slate-100">{item.employeeNo}</TableCell>
                              <TableCell>
                                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{employeeMeta}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-slate-900 dark:text-slate-100">{organizationMeta}</div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{postMeta}</div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                    {typeLabel[item.employeeType] || item.employeeType}
                                  </span>
                                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
                                    {statusLabel[item.employeeStatus] || item.employeeStatus}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{toDateInputValue(item.hireDate) || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2 whitespace-nowrap">
                                  <Button
                                    size="sm"
                                    variant={active ? 'default' : 'outline'}
                                    className="h-8"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedEmployeeId(item.id);
                                    }}
                                  >
                                    详情
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8"
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
        )}
      />

      <BaseDialog
        open={dialogOpen}
        title={editingId ? '编辑员工档案' : '新建员工档案'}
        onClose={resetForm}
        maxWidthClassName="max-w-5xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetForm}>取消</Button>
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
                <Label>工号</Label>
                <Input value={form.employeeNo} disabled={Boolean(editingId)} onChange={(event) => setForm((prev) => ({ ...prev, employeeNo: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>姓名</Label>
                <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>性别</Label>
                <Select value={form.gender} onValueChange={(value) => setForm((prev) => ({ ...prev, gender: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">男</SelectItem>
                    <SelectItem value="FEMALE">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>员工状态</Label>
                <Select value={form.employeeStatus} onValueChange={(value) => setForm((prev) => ({ ...prev, employeeStatus: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REGULAR">正式员工</SelectItem>
                    <SelectItem value="RESIGNED">已离职</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>员工类型</Label>
                <Select value={form.employeeType} onValueChange={(value) => setForm((prev) => ({ ...prev, employeeType: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FULL_TIME">全职</SelectItem>
                    <SelectItem value="PART_TIME">兼职</SelectItem>
                    <SelectItem value="INTERN">实习生</SelectItem>
                    <SelectItem value="CONTRACTOR">外包</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>出生日期</Label>
                <DatePicker type="date" value={form.birthDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, birthDate: event.target.value }))} />
              </div>
            </div>
          </DialogSection>

          <DialogSection title="联系方式与时间">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label>手机号</Label>
                <Input value={form.phone || ''} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>邮箱</Label>
                <Input value={form.email || ''} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>入职日期</Label>
                <DatePicker type="date" value={form.hireDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, hireDate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>转正日期</Label>
                <DatePicker type="date" value={form.regularDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, regularDate: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>离职日期</Label>
                <DatePicker type="date" value={form.resignDate || ''} onChange={(event) => setForm((prev) => ({ ...prev, resignDate: event.target.value }))} />
              </div>
            </div>
          </DialogSection>

          <DialogSection title="组织与岗位">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>部门</Label>
                <Select value={form.deptId ? String(form.deptId) : undefined} onValueChange={(value) => setForm((prev) => ({ ...prev, deptId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择部门" /></SelectTrigger>
                  <SelectContent>
                    {deptOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>岗位</Label>
                <Select value={form.postId ? String(form.postId) : undefined} onValueChange={(value) => setForm((prev) => ({ ...prev, postId: Number(value) }))}>
                  <SelectTrigger><SelectValue placeholder="请选择岗位" /></SelectTrigger>
                  <SelectContent>
                    {postOptions.map((option) => (
                      <SelectItem key={option.postId} value={String(option.postId)}>{option.postName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>
    </>
  );
};

export default HrEmployeePage;
