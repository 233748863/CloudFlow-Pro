import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, FilePlus2, Search } from 'lucide-react';
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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import {
  approveTransfer,
  effectiveTransfer,
  HrEmployee,
  PostOption,
  PositionOption,
  TransferApplication,
  TransferApplicationPayload,
  createTransferApplication,
  getDeptTreeOptions,
  getPostOptions,
  getPositionOptions,
  getTransferApplication,
  listEmployees,
  listTransferByEmployee,
  submitTransferApplication,
} from '@/services/api/hr';
import { buildEmployeeLabel, flattenDeptTree, hasWorkflowStatus, matchEmployeeKeyword, normalizeRows, toDateInputValue } from './hrShared';

const EMPTY_VALUE = '__empty__';

const defaultForm: TransferApplicationPayload = {
  employeeId: 0,
  toDeptId: 0,
  toPostId: 0,
  toPositionId: undefined,
  transferType: 'DEPT',
  reason: '',
  effectiveDate: '',
  salaryChange: false,
};

const transferStatusClass = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-700';
  if (/(APPROV|EFFECT|COMPLETE|SUCCESS)/i.test(status)) return 'bg-emerald-50 text-emerald-700';
  if (/(DRAFT|PENDING|SUBMIT)/i.test(status)) return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-700';
};

export const HrTransferPage: React.FC = () => {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [postOptions, setPostOptions] = useState<PostOption[]>([]);
  const [positionOptions, setPositionOptions] = useState<PositionOption[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [applications, setApplications] = useState<TransferApplication[]>([]);
  const [detail, setDetail] = useState<TransferApplication | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TransferApplicationPayload>(defaultForm);

  const loadBootstrapData = async () => {
    setLoading(true);
    try {
      const [employeeRes, deptRes, postRes, positionRes] = await Promise.all([
        listEmployees({ pageNum: 1, pageSize: 200 }),
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions(),
      ]);

      const employeeList = normalizeRows<HrEmployee>(employeeRes);
      const postList = normalizeRows<PostOption>(postRes);
      const positionList = Array.isArray(positionRes) ? positionRes : [];

      setEmployees(employeeList);
      setDeptOptions(flattenDeptTree(Array.isArray(deptRes) ? deptRes : []));
      setPostOptions(postList);
      setPositionOptions(positionList);

      setCreateForm(prev => ({
        ...prev,
        employeeId: prev.employeeId || employeeList[0]?.id || 0,
        toDeptId: prev.toDeptId || (Array.isArray(deptRes) ? flattenDeptTree(deptRes)[0]?.value : 0) || 0,
        toPostId: prev.toPostId || postList[0]?.postId || 0,
        toPositionId: prev.toPositionId || positionList[0]?.id,
      }));
    } catch (error) {
      console.error(error);
      toast.error('调岗基础数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async (employeeId: number) => {
    setListLoading(true);
    try {
      const applicationRes = await listTransferByEmployee(employeeId);
      setApplications(Array.isArray(applicationRes) ? applicationRes : []);
    } catch (error) {
      console.error(error);
      setApplications([]);
      toast.error('调岗申请列表加载失败');
    } finally {
      setListLoading(false);
    }
  };

  const loadDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const detailRes = await getTransferApplication(id);
      setDetail(detailRes);
    } catch (error) {
      console.error(error);
      toast.error('调岗申请详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadBootstrapData();
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

  const salaryChangeCount = useMemo(
    () => applications.filter(item => Boolean(item.salaryChange)).length,
    [applications],
  );
  const canSubmitDetail = hasWorkflowStatus(detail?.status, 'DRAFT');
  const canApproveDetail = hasWorkflowStatus(detail?.status, 'APPROVING');
  const canEffectiveDetail = hasWorkflowStatus(detail?.status, 'APPROVED');

  const resetCreateDialog = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployee?.id || employees[0]?.id || 0,
      toDeptId: deptOptions[0]?.value || 0,
      toPostId: postOptions[0]?.postId || 0,
      toPositionId: positionOptions[0]?.id,
    });
    setCreateDialogOpen(false);
  };

  const handleOpenCreate = () => {
    setCreateForm({
      ...defaultForm,
      employeeId: selectedEmployee?.id || employees[0]?.id || 0,
      toDeptId: deptOptions[0]?.value || 0,
      toPostId: postOptions[0]?.postId || 0,
      toPositionId: positionOptions[0]?.id,
    });
    setCreateDialogOpen(true);
  };

  const handleCreate = async () => {
    try {
      const id = await createTransferApplication({
        ...createForm,
        toPositionId: createForm.toPositionId || undefined,
      });
      toast.success(`调岗申请已创建，申请 ID：${id}`);
      resetCreateDialog();

      if (createForm.employeeId) {
        setSelectedEmployeeId(String(createForm.employeeId));
        await loadApplications(createForm.employeeId);
      }

      await loadDetail(id);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '创建调岗申请失败');
    }
  };

  const handleSubmit = async (id: number) => {
    try {
      await submitTransferApplication(id);
      toast.success('调岗申请已提交');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '提交调岗申请失败');
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await approveTransfer(id);
      toast.success('调岗申请已审批通过');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '审批调岗申请失败');
    }
  };

  const handleEffective = async (id: number) => {
    try {
      await effectiveTransfer(id);
      toast.success('调岗已生效');

      if (selectedEmployeeId) {
        await loadApplications(Number(selectedEmployeeId));
      }

      if (detail?.id === id) {
        await loadDetail(id);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '调岗生效失败');
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 shadow-[0_12px_40px_rgba(15,23,42,0.06)] backdrop-blur-xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
              <ArrowRightLeft size={14} />
              Transfer Flow
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">调岗申请中心</h1>
            <p className="mt-2 text-sm text-slate-500">围绕员工查询调岗记录，直接联调目标部门、岗位和生效日期等真实字段。</p>
          </div>
          <Button className="rounded-2xl" onClick={handleOpenCreate}>
            <FilePlus2 size={16} className="mr-2" />
            新建调岗申请
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
              <SelectValue placeholder="选择员工查看调岗记录" />
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
          <div className="mt-2 text-xs text-slate-400">当前搜索条件命中的员工数</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">调岗申请</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{selectedEmployee ? applications.length : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">{selectedEmployee ? `${selectedEmployee.name} 的调岗记录` : '先选择员工'}</div>
        </Card>
        <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
          <div className="text-sm font-medium text-slate-500">涉及薪资变更</div>
          <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{selectedEmployee ? salaryChangeCount : '--'}</div>
          <div className="mt-2 text-xs text-slate-400">便于快速核对调岗影响范围</div>
        </Card>
      </div>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-2 backdrop-blur-xl">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>申请编号</TableHead>
              <TableHead>员工</TableHead>
              <TableHead>目标组织</TableHead>
              <TableHead>调岗类型</TableHead>
              <TableHead>生效日期</TableHead>
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
                <TableCell>
                  <div>{item.toDeptName || '-'}</div>
                  <div className="text-xs text-slate-400">{item.toPostName || '-'} / {item.toPositionName || '-'}</div>
                </TableCell>
                <TableCell>{item.transferTypeDesc || item.transferType}</TableCell>
                <TableCell>{toDateInputValue(item.effectiveDate)}</TableCell>
                <TableCell>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${transferStatusClass(item.status)}`}>
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
                  {selectedEmployee ? '该员工暂无调岗申请' : '请选择员工后查看调岗记录'}
                </TableCell>
              </TableRow>
            )}
            {listLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-slate-400">正在加载调岗申请...</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="rounded-3xl border-white/80 bg-white/70 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">申请详情</h2>
            <p className="mt-1 text-sm text-slate-500">单条详情可以核对原部门、目标部门和调岗原因。</p>
          </div>
          {detail && (
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" disabled={!canSubmitDetail} onClick={() => void handleSubmit(detail.id)}>提交当前申请</Button>
              <Button variant="outline" disabled={!canApproveDetail} onClick={() => void handleApprove(detail.id)}>审批通过</Button>
              <Button disabled={!canEffectiveDetail} onClick={() => void handleEffective(detail.id)}>调岗生效</Button>
            </div>
          )}
        </div>

        {!detail && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
            从上方列表选择一条调岗申请查看详细信息。
          </div>
        )}

        {detail && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">申请编号</div>
              <div className="mt-2 font-semibold text-slate-900">{detail.applicationNo}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">状态</div>
              <div className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${transferStatusClass(detail.status)}`}>
                {detail.statusDesc || detail.status}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">生效日期</div>
              <div className="mt-2 font-semibold text-slate-900">{toDateInputValue(detail.effectiveDate) || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">原组织</div>
              <div className="mt-2 font-semibold text-slate-900">{detail.fromDeptName || '-'}</div>
              <div className="mt-1 text-sm text-slate-500">{detail.fromPostName || '-'} / {detail.fromPositionName || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">目标组织</div>
              <div className="mt-2 font-semibold text-slate-900">{detail.toDeptName || '-'}</div>
              <div className="mt-1 text-sm text-slate-500">{detail.toPostName || '-'} / {detail.toPositionName || '-'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-xs text-slate-400">调岗类型 / 薪资变更</div>
              <div className="mt-2 font-semibold text-slate-900">{detail.transferTypeDesc || detail.transferType}</div>
              <div className="mt-1 text-sm text-slate-500">{detail.salaryChange ? '涉及薪资变更' : '不涉及薪资变更'}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 md:col-span-2 xl:col-span-3">
              <div className="text-xs text-slate-400">调岗原因</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detail.reason || '-'}</div>
            </div>
          </div>
        )}

        {detailLoading && <div className="mt-4 text-sm text-slate-400">正在加载调岗详情...</div>}
      </Card>

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/80 bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">新建调岗申请</h2>
                <p className="mt-1 text-sm text-slate-500">保持和后端创建 DTO 一致，直接联调目标部门、岗位与生效日。</p>
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
                <Label>目标部门</Label>
                <Select value={createForm.toDeptId ? String(createForm.toDeptId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, toDeptId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择目标部门" />
                  </SelectTrigger>
                  <SelectContent>
                    {deptOptions.map(option => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>目标岗位</Label>
                <Select value={createForm.toPostId ? String(createForm.toPostId) : undefined} onValueChange={value => setCreateForm(prev => ({ ...prev, toPostId: Number(value) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="请选择目标岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {postOptions.map(option => (
                      <SelectItem key={option.postId} value={String(option.postId)}>
                        {option.postName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>目标职位</Label>
                <Select
                  value={createForm.toPositionId ? String(createForm.toPositionId) : EMPTY_VALUE}
                  onValueChange={value => setCreateForm(prev => ({
                    ...prev,
                    toPositionId: value === EMPTY_VALUE ? undefined : Number(value),
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="可选：请选择职位" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_VALUE}>暂不指定职位</SelectItem>
                    {positionOptions.map(option => (
                      <SelectItem key={option.id} value={String(option.id)}>
                        {option.positionName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>调岗类型</Label>
                <Select value={createForm.transferType} onValueChange={value => setCreateForm(prev => ({ ...prev, transferType: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEPT">部门调动</SelectItem>
                    <SelectItem value="POST">岗位调整</SelectItem>
                    <SelectItem value="PROMOTION">晋升</SelectItem>
                    <SelectItem value="DEMOTION">降级</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>生效日期</Label>
                <Input type="date" value={createForm.effectiveDate} onChange={event => setCreateForm(prev => ({ ...prev, effectiveDate: event.target.value }))} />
              </div>
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">是否涉及薪资变更</div>
                    <div className="mt-1 text-sm text-slate-500">打开后会把 `salaryChange` 按真实布尔字段提交。</div>
                  </div>
                  <Switch checked={Boolean(createForm.salaryChange)} onCheckedChange={checked => setCreateForm(prev => ({ ...prev, salaryChange: checked }))} />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label>调岗原因</Label>
                <Textarea value={createForm.reason || ''} onChange={event => setCreateForm(prev => ({ ...prev, reason: event.target.value }))} />
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

export default HrTransferPage;
