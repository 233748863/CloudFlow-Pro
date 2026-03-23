import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, LogOut, Search } from 'lucide-react';
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
  approveResignation,
  HrEmployee,
  ResignationApplication,
  ResignationApplicationPayload,
  ResignationHandover,
  completeResignationHandover,
  conductExitInterview,
  confirmResignation,
  createResignationApplication,
  getResignationApplication,
  listEmployees,
  listResignationByEmployee,
  listResignationHandovers,
  submitResignationApplication,
} from '@/services/api/hr';
import { buildEmployeeLabel, hasWorkflowStatus, matchEmployeeKeyword, normalizeRows, toDateInputValue } from './hrShared';

const defaultForm: ResignationApplicationPayload = {
  employeeId: 0,
  resignationType: 'VOLUNTARY',
  resignationReason: '',
  expectedDate: '',
};

const resignationStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(CONFIRM|COMPLETE|SUCCESS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(DRAFT|PENDING|SUBMIT|HANDOVER)/i.test(status)) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

const handoverStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(COMPLETE|DONE|FINISH)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  return 'bg-blue-50 text-blue-700';
};

const isHandoverCompleted = (status?: string) => /(COMPLETE|DONE|FINISH)/i.test(status || '');

export const HrResignationPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<ResignationApplicationPayload>(defaultForm);
  const [applications, setApplications] = useState<ResignationApplication[]>([]);
  const [detail, setDetail] = useState<ResignationApplication | null>(null);
  const [handovers, setHandovers] = useState<ResignationHandover[]>([]);
  const [handoverRemarks, setHandoverRemarks] = useState<Record<number, string>>({});
  const [interviewContent, setInterviewContent] = useState('');
  const [confirmDate, setConfirmDate] = useState('');

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
      const applicationRes = await listResignationByEmployee(employeeId);
      setApplications(Array.isArray(applicationRes) ? applicationRes : []);
    } catch (error) {
      console.error(error);
      setApplications([]);
      toast.error('离职申请列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const [detailRes, handoverRes] = await Promise.all([
        getResignationApplication(id),
        listResignationHandovers(id),
      ]);
      setDetail(detailRes);
      setHandovers(Array.isArray(handoverRes) ? handoverRes : []);
      setInterviewContent(detailRes.interviewContent || '');
      setConfirmDate(toDateInputValue(detailRes.actualDate) || toDateInputValue(detailRes.expectedDate));
    } catch (error) {
      console.error(error);
      toast.error('离职详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) {
      setApplications([]);
      setDetail(null);
      setHandovers([]);
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

  const pendingHandoverCount = useMemo(
    () => handovers.filter(item => !isHandoverCompleted(item.status)).length,
    [handovers],
  );
  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canConfirmDetail = hasWorkflowStatus(detail?.status, 'APPROVED') && pendingHandoverCount === 0;
  const canSaveInterview = detail ? !hasWorkflowStatus(detail.status, 'COMPLETED') : false;

  const resetCreateDialog = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployee?.id || employees[0]?.id || 0,
    });
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployee?.id || employees[0]?.id || 0,
    });
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    try {
      const id = await createResignationApplication(createForm);
      toast.success(`离职申请已创建，申请 ID：${id}`);
      resetCreateDialog();

      if (createForm.employeeId) {
        setSelectedEmployeeId(String(createForm.employeeId));
        await loadApplications(createForm.employeeId);
      }

      await loadDetail(id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建离职申请失败');
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      await submitResignationApplication(id);
      toast.success('离职申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交离职申请失败');
    }
  };

  const handleSaveInterview = async () => {
    if (!detail) return;

    try {
      await conductExitInterview(detail.id, interviewContent);
      toast.success('离职面谈已记录');
      await loadDetail(detail.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '保存离职面谈失败');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveResignation(id);
      toast.success('离职申请已审批通过');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批离职申请失败');
    }
  };

  const handleCompleteHandover = async (handoverId: number) => {
    if (!detail) return;

    try {
      await completeResignationHandover(handoverId, handoverRemarks[handoverId]);
      toast.success('交接事项已完成');
      setHandoverRemarks(prev => ({ ...prev, [handoverId]: '' }));
      await loadDetail(detail.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '完成交接失败');
    }
  };

  const handleConfirm = async () => {
    if (!detail) return;
    if (!confirmDate) {
      toast.error('请选择实际离职日期');
      return;
    }

    try {
      await confirmResignation(detail.id, confirmDate);
      toast.success('已确认离职');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      await loadDetail(detail.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '确认离职失败');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              <LogOut size={14} />
              Resignation Flow
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">离职办理中心</h1>
            <p className="mt-2 text-sm text-slate-500">支持离职申请、离职面谈、交接清单和最终确认离职的桌面端闭环。</p>
          </div>
          <Button className="rounded-2xl" onClick={handleOpenCreate}>
            <FilePlus2 size={16} className="mr-2" />
            新建离职申请
          </Button>
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
              <SelectValue placeholder="选择员工查看离职记录" />
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
              setHandovers([]);
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
          <div className="mt-2 text-xs text-slate-400">当前搜索条件命中的员工数</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">离职申请</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{selectedEmployee ? applications.length : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">{selectedEmployee ? `${selectedEmployee.name} 的离职记录` : '先选择员工'}</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">待完成交接</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{detail ? pendingHandoverCount : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">当前打开申请的交接事项数</div>
        </Card>
      </div>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-2 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>申请编号</TableHead>
              <TableHead>员工</TableHead>
              <TableHead>离职类型</TableHead>
              <TableHead>预计离职</TableHead>
              <TableHead>实际离职</TableHead>
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
                <TableCell>{item.resignationTypeDesc || item.resignationType}</TableCell>
                <TableCell>{toDateInputValue(item.expectedDate)}</TableCell>
                <TableCell>{toDateInputValue(item.actualDate) || '-'}</TableCell>
                <TableCell>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${resignationStatusClass(item.status)}`}>
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
                <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                  {selectedEmployee ? '该员工暂无离职申请' : '请选择员工后查看离职记录'}
                </TableCell>
              </TableRow>
            )}
            {listLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-slate-400">正在加载离职申请...</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
        <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">申请详情与面谈</h2>
            <p className="mt-1 text-sm text-slate-500">在详情面板里完成提交、离职面谈和确认离职动作。</p>
          </div>
          {detail && (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={!canSubmitDetail} onClick={() => void handleSubmit(detail.id)}>提交当前申请</Button>
              <Button variant="outline" disabled={!canApproveDetail} onClick={() => void handleApprove(detail.id)}>审批通过</Button>
              <div className="flex gap-2">
                <Input type="date" value={confirmDate} onChange={event => setConfirmDate(event.target.value)} />
                <Button disabled={!canConfirmDetail} onClick={() => void handleConfirm()}>确认离职</Button>
              </div>
            </div>
          )}
        </div>

        {!detail && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
            从上方列表选择一条离职申请查看详细信息。
          </div>
        )}

        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">申请编号</div>
                <div className="mt-2 font-semibold text-slate-900">{detail.applicationNo}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">状态</div>
                <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${resignationStatusClass(detail.status)}`}>
                  {detail.statusDesc || detail.status}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">离职类型</div>
                <div className="mt-2 font-semibold text-slate-900">{detail.resignationTypeDesc || detail.resignationType}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">预计离职日期</div>
                <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.expectedDate) || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">实际离职日期</div>
                <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.actualDate) || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="text-xs text-slate-400">员工</div>
                <div className="mt-2 font-semibold text-slate-900">{detail.employeeName || '-'}</div>
                <div className="mt-1 text-sm text-slate-500">{detail.employeeNo || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
                <div className="text-xs text-slate-400">离职原因</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.resignationReason || '-'}</div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white/80 p-5">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">离职面谈</h3>
                <p className="mt-1 text-sm text-slate-500">这里直接调用后端 `interview` 接口保存面谈内容。</p>
              </div>
              <Textarea value={interviewContent} onChange={event => setInterviewContent(event.target.value)} rows={5} disabled={!canSaveInterview} />
              <div className="mt-4 flex justify-end">
                <Button disabled={!canSaveInterview} onClick={() => void handleSaveInterview()}>保存面谈记录</Button>
              </div>
            </div>
          </div>
        )}

        {detailLoading && <div className="mt-4 text-sm text-slate-400">正在加载离职详情...</div>}
        {detail && hasWorkflowStatus(detail.status, 'APPROVED') && pendingHandoverCount > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            当前申请还有 {pendingHandoverCount} 项交接未完成，暂不能确认离职。
          </div>
        )}
      </Card>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">交接清单</h2>
            <p className="mt-1 text-sm text-slate-500">交接事项完成后会实时刷新，方便核对离职闭环是否完成。</p>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {detail ? `${handovers.length} 项交接` : '等待加载申请'}
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>交接事项</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>接收人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>完成时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {handovers.map(item => {
              const completed = isHandoverCompleted(item.status);

              return (
                <TableRow key={item.id}>
                  <TableCell className="font-semibold text-slate-900">{item.handoverItem}</TableCell>
                  <TableCell>{item.handoverTypeDesc || item.handoverType}</TableCell>
                  <TableCell>{item.handoverToName || '-'}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${handoverStatusClass(item.status)}`}>
                      {item.statusDesc || item.status}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    <Input
                      placeholder="可选填写交接备注"
                      disabled={completed}
                      value={handoverRemarks[item.id] ?? item.remark ?? ''}
                      onChange={event => setHandoverRemarks(prev => ({ ...prev, [item.id]: event.target.value }))}
                    />
                  </TableCell>
                  <TableCell>{item.completedTime || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant={completed ? 'outline' : 'default'} disabled={completed} onClick={() => void handleCompleteHandover(item.id)}>
                      {completed ? '已完成' : '完成交接'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!handovers.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-slate-400">
                  {detail ? '当前申请暂无交接事项' : '先加载离职申请，再查看交接清单'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">新建离职申请</h2>
                <p className="mt-1 text-sm text-slate-500">直接按后端 DTO 提交离职类型、原因和预计离职日期。</p>
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
                <Label>离职类型</Label>
                <Select value={createForm.resignationType} onValueChange={value => setCreateForm(prev => ({ ...prev, resignationType: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VOLUNTARY">主动离职</SelectItem>
                    <SelectItem value="INVOLUNTARY">被动离职</SelectItem>
                    <SelectItem value="CONTRACT_EXPIRY">合同到期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>预计离职日期</Label>
                <Input type="date" value={createForm.expectedDate} onChange={event => setCreateForm(prev => ({ ...prev, expectedDate: event.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Label>离职原因</Label>
                <Textarea value={createForm.resignationReason || ''} onChange={event => setCreateForm(prev => ({ ...prev, resignationReason: event.target.value }))} />
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

export default HrResignationPage;
