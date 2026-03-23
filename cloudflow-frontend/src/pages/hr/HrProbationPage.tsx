import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, FilePlus2, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
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
  Textarea,
} from '@/components/ui';
import {
  approveProbationConfirmation,
  HrEmployee,
  ProbationConfirmation,
  ProbationConfirmationPayload,
  createProbationConfirmation,
  getProbationConfirmation,
  listEmployees,
  listProbationByEmployee,
  rejectProbationConfirmation,
  sendProbationReminders,
  submitProbationConfirmation,
} from '@/services/api/hr';
import { buildEmployeeLabel, hasWorkflowStatus, matchEmployeeKeyword, normalizeRows, toDateInputValue } from './hrShared';

const defaultForm: ProbationConfirmationPayload = {
  employeeId: 0,
  probationStartDate: '',
  probationEndDate: '',
  expectedRegularDate: '',
  selfEvaluation: '',
  managerEvaluation: '',
};

const probationStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(APPROV|REGULAR|COMPLETE|PASS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(DRAFT|PENDING|SUBMIT)/i.test(status)) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

export const HrProbationPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ProbationConfirmationPayload>(defaultForm);
  const [applications, setApplications] = useState<ProbationConfirmation[]>([]);
  const [detail, setDetail] = useState<ProbationConfirmation | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectExtensionDays, setRejectExtensionDays] = useState('');

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const employeeRes = await listEmployees({ pageNum: 1, pageSize: 200 });
      setEmployees(normalizeRows<HrEmployee>(employeeRes));
    } catch (error) {
      console.error(error);
      toast.error('员工列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async (employeeId: number) => {
    setListLoading(true);
    try {
      const applicationRes = await listProbationByEmployee(employeeId);
      const rows = Array.isArray(applicationRes) ? applicationRes : [];
      setApplications(rows);
    } catch (error) {
      console.error(error);
      setApplications([]);
      toast.error('转正申请列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detailRes = await getProbationConfirmation(id);
      setDetail(detailRes);
      setRejectReason(detailRes.rejectReason || '');
      setRejectExtensionDays(detailRes.extensionDays ? String(detailRes.extensionDays) : '');
    } catch (error) {
      console.error(error);
      toast.error('转正申请详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveProbationConfirmation(id);
      toast.success('转正申请已审批通过');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批转正申请失败');
    }
  };

  const handleReject = async (id: number) => {
    if (!rejectReason.trim()) {
      toast.error('请填写驳回原因');
      return;
    }

    try {
      await rejectProbationConfirmation(
        id,
        rejectReason.trim(),
        rejectExtensionDays ? Number(rejectExtensionDays) : undefined,
      );
      toast.success('转正申请已驳回');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '驳回转正申请失败');
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setApplications([]);
      setDetail(null);
      return;
    }

    void loadApplications(Number(selectedEmployeeId));
  }, [selectedEmployeeId]);

  const filteredEmployees = useMemo(
    () => employees.filter(employee => matchEmployeeKeyword(employee, employeeKeyword)),
    [employees, employeeKeyword],
  );

  const selectedEmployee = useMemo(
    () => employees.find(item => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const submittedCount = useMemo(
    () => applications.filter(item => /(APPROV|PENDING|SUBMIT)/i.test(item.status || '')).length,
    [applications],
  );
  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canRejectDetail = hasWorkflowStatus(detail?.status, 'APPROVING');

  const resetCreateDialog = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployee ? selectedEmployee.id : 0,
    });
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployee ? selectedEmployee.id : employees[0]?.id || 0,
    });
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    try {
      const id = await createProbationConfirmation(createForm);
      toast.success(`转正申请已创建，申请 ID：${id}`);
      resetCreateDialog();
      if (createForm.employeeId) {
        setSelectedEmployeeId(String(createForm.employeeId));
        await loadApplications(createForm.employeeId);
      }
      await loadDetail(id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建转正申请失败');
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      await submitProbationConfirmation(id);
      toast.success('转正申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交转正申请失败');
    }
  };

  const handleSendReminders = async () => {
    try {
      await sendProbationReminders();
      toast.success('转正提醒已发送');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '发送提醒失败');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              <ShieldCheck size={14} />
              Probation Flow
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">转正申请中心</h1>
            <p className="mt-2 text-sm text-slate-500">按员工查看转正申请，支持创建、提交流程和发送提醒。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button className="rounded-2xl" onClick={handleOpenCreate}>
              <FilePlus2 size={16} className="mr-2" />
              新建转正申请
            </Button>
            <Button variant="outline" className="rounded-2xl" onClick={() => void handleSendReminders()}>
              <BellRing size={16} className="mr-2" />
              发送转正提醒
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-5 backdrop-blur-xl">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.1fr_1fr_auto]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-10"
              placeholder="先搜索员工姓名、工号、部门"
              value={employeeKeyword}
              onChange={event => setEmployeeKeyword(event.target.value)}
            />
          </div>
          <Select value={selectedEmployeeId || undefined} onValueChange={setSelectedEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="选择员工查看转正记录" />
            </SelectTrigger>
            <SelectContent>
              {filteredEmployees.map(item => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {buildEmployeeLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              setEmployeeKeyword('');
              setSelectedEmployeeId('');
              setDetail(null);
            }}
          >
            重置
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">员工范围</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{loading ? '--' : filteredEmployees.length}</div>
          <div className="mt-2 text-xs text-slate-400">当前关键词筛出的员工数量</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">申请记录</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{selectedEmployee ? applications.length : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">{selectedEmployee ? `${selectedEmployee.name} 的转正历史` : '先选择员工'}</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">待推进申请</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{selectedEmployee ? submittedCount : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">已提交或审批中的转正申请</div>
        </Card>
      </div>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-2 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>申请编号</TableHead>
              <TableHead>员工</TableHead>
              <TableHead>试用期</TableHead>
              <TableHead>预计转正</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map(item => (
              <TableRow key={item.id}>
                <TableCell className="font-semibold text-slate-900">{item.applicationNo}</TableCell>
                <TableCell>
                  <div>{item.employeeName || '-'}</div>
                  <div className="text-xs text-slate-400">{item.employeeNo || '-'}</div>
                </TableCell>
                <TableCell>{toDateInputValue(item.probationStartDate)} ~ {toDateInputValue(item.probationEndDate)}</TableCell>
                <TableCell>{toDateInputValue(item.expectedRegularDate)}</TableCell>
                <TableCell>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${probationStatusClass(item.status)}`}>
                    {item.statusDesc || item.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => void loadDetail(item.id)}>
                      查看详情
                    </Button>
                    <Button size="sm" disabled={!hasWorkflowStatus(item.status, 'DRAFT')} onClick={() => void handleSubmit(item.id)}>
                      提交
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!applications.length && !listLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-slate-400">
                  {selectedEmployee ? '该员工暂无转正申请' : '请选择员工后查看转正记录'}
                </TableCell>
              </TableRow>
            )}
            {listLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-slate-400">正在加载转正申请...</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">申请详情</h2>
            <p className="mt-1 text-sm text-slate-500">详情来自单条查询接口，便于核对评价内容和提交流程。</p>
          </div>
          {detail && (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={!canSubmitDetail} onClick={() => void handleSubmit(detail.id)}>提交当前申请</Button>
              <Button disabled={!canApproveDetail} onClick={() => void handleApprove(detail.id)}>审批通过</Button>
            </div>
          )}
        </div>

        {!detail && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
            从上方列表选择一条转正申请查看详细信息。
          </div>
        )}

        {detail && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">申请编号</div>
              <div className="mt-2 font-semibold text-slate-900">{detail.applicationNo}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">员工</div>
              <div className="mt-2 font-semibold text-slate-900">{detail.employeeName || '-'}</div>
              <div className="mt-1 text-sm text-slate-500">{detail.employeeNo || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">状态</div>
              <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${probationStatusClass(detail.status)}`}>
                {detail.statusDesc || detail.status}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">试用开始</div>
              <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.probationStartDate) || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">试用结束</div>
              <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.probationEndDate) || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">预计转正日期</div>
              <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.expectedRegularDate) || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
              <div className="text-xs text-slate-400">自我评价</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.selfEvaluation || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
              <div className="text-xs text-slate-400">主管评价</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.managerEvaluation || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">驳回原因</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.rejectReason || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">延长期限</div>
              <div className="mt-2 text-sm text-slate-700">{detail.extensionDays ? `${detail.extensionDays} 天` : '-'}</div>
            </div>
          </div>
        )}

        {detailLoading && <div className="mt-4 text-sm text-slate-400">正在加载申请详情...</div>}
      </Card>

      {detail && (
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">驳回处理</h2>
            <p className="mt-1 text-sm text-slate-500">真实联调时可以填写驳回原因，并可选设置延长试用天数。</p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
            <div>
              <Label>驳回原因</Label>
              <Textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} />
            </div>
            <div>
              <Label>延长天数</Label>
              <Input
                type="number"
                min={0}
                placeholder="留空则不延长"
                value={rejectExtensionDays}
                onChange={event => setRejectExtensionDays(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button className="w-full" disabled={!canRejectDetail} onClick={() => void handleReject(detail.id)}>驳回申请</Button>
            </div>
          </div>
        </Card>
      )}

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">新建转正申请</h2>
                <p className="mt-1 text-sm text-slate-500">直接按后端 DTO 字段提交试用期和评价信息。</p>
              </div>
              <Button variant="ghost" onClick={resetCreateDialog}>关闭</Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>员工</Label>
                <Select value={createForm.employeeId ? String(createForm.employeeId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, employeeId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择员工" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(item => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {buildEmployeeLabel(item)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>试用开始日期</Label>
                <Input type="date" value={createForm.probationStartDate} onChange={event => setCreateForm(prev => ({ ...prev, probationStartDate: event.target.value }))} />
              </div>
              <div>
                <Label>试用结束日期</Label>
                <Input type="date" value={createForm.probationEndDate} onChange={event => setCreateForm(prev => ({ ...prev, probationEndDate: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>预计转正日期</Label>
                <Input type="date" value={createForm.expectedRegularDate} onChange={event => setCreateForm(prev => ({ ...prev, expectedRegularDate: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>自我评价</Label>
                <Textarea value={createForm.selfEvaluation || ''} onChange={event => setCreateForm(prev => ({ ...prev, selfEvaluation: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>主管评价</Label>
                <Textarea value={createForm.managerEvaluation || ''} onChange={event => setCreateForm(prev => ({ ...prev, managerEvaluation: event.target.value }))} />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={resetCreateDialog}>取消</Button>
              <Button onClick={() => void handleCreate()}>创建申请</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HrProbationPage;
