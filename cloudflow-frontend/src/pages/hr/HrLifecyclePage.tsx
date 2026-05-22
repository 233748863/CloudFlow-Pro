import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import {
  Candidate,
  DeptTreeNode,
  HrEmployee,
  HrRecord,
  LifecycleApplication,
  PositionOption,
  PostOption,
  changeLifecycleApplicationStatus,
  createLifecycleApplication,
  getDeptTreeOptions,
  getPositionOptions,
  getPostOptions,
  listCandidates,
  listEmployees,
  listLifecycleApplications,
} from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import { buildEmployeeLabel, flattenDeptTree, formatDateValue, normalizeRows, optionOrIdLabel } from './hrShared';
import { HrCrudPanel, HrFormField, HrPageHeader, renderStatus } from './HrDomainWorkspace';

type LifecycleType = 'ONBOARDING' | 'PROBATION' | 'TRANSFER' | 'RESIGNATION';

const lifecycleTabs: Array<{ value: LifecycleType; label: string }> = [
  { value: 'ONBOARDING', label: '入职' },
  { value: 'PROBATION', label: '转正' },
  { value: 'TRANSFER', label: '调岗' },
  { value: 'RESIGNATION', label: '离职' },
];

const formDefaults: Record<LifecycleType, () => HrRecord> = {
  ONBOARDING: () => ({
    applicationNo: `HRLC${Date.now()}`,
    name: '',
    candidateId: '',
    deptId: '',
    postId: '',
    positionId: '',
    expectedDate: '',
    status: 'DRAFT',
  }),
  PROBATION: () => ({
    applicationNo: `HRLC${Date.now()}`,
    employeeId: '',
    expectedDate: '',
    status: 'DRAFT',
  }),
  TRANSFER: () => ({
    applicationNo: `HRLC${Date.now()}`,
    employeeId: '',
    deptId: '',
    postId: '',
    positionId: '',
    effectiveDate: '',
    status: 'DRAFT',
  }),
  RESIGNATION: () => ({
    applicationNo: `HRLC${Date.now()}`,
    employeeId: '',
    effectiveDate: '',
    reason: '',
    status: 'DRAFT',
  }),
};

const typeLabels: Record<LifecycleType, string> = {
  ONBOARDING: '入职',
  PROBATION: '转正',
  TRANSFER: '调岗',
  RESIGNATION: '离职',
};

const HrLifecyclePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LifecycleType>('ONBOARDING');
  const [applications, setApplications] = useState<LifecycleApplication[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [deptTree, setDeptTree] = useState<DeptTreeNode[]>([]);
  const [posts, setPosts] = useState<PostOption[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState<Record<LifecycleType, HrRecord>>({
    ONBOARDING: formDefaults.ONBOARDING(),
    PROBATION: formDefaults.PROBATION(),
    TRANSFER: formDefaults.TRANSFER(),
    RESIGNATION: formDefaults.RESIGNATION(),
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [applicationRes, employeeRes, candidateRes, deptRes, postRes, positionRes] = await Promise.all([
        listLifecycleApplications(),
        listEmployees({ pageNum: 1, pageSize: 500 }),
        listCandidates({ pageNum: 1, pageSize: 200 }),
        getDeptTreeOptions(),
        getPostOptions(),
        getPositionOptions({ pageNum: 1, pageSize: 500 }),
      ]);
      setApplications(normalizeRows<LifecycleApplication>(applicationRes));
      setEmployees(normalizeRows<HrEmployee>(employeeRes));
      setCandidates(normalizeRows<Candidate>(candidateRes));
      setDeptTree(normalizeRows<DeptTreeNode>(deptRes));
      setPosts(normalizeRows<PostOption>(postRes));
      setPositions(normalizeRows<PositionOption>(positionRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '员工异动数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const employeeOptions = useMemo(
    () => employees.map((item) => ({ label: buildEmployeeLabel(item) || `${item.employeeNo} / ${item.name}`, value: item.id })),
    [employees],
  );

  const candidateOptions = useMemo(
    () => candidates.map((item) => ({ label: `${item.name} / ${item.positionName || '-'}`, value: item.id })),
    [candidates],
  );

  const deptOptions = useMemo(() => flattenDeptTree(deptTree), [deptTree]);

  const postOptions = useMemo(
    () => posts.map((item) => ({ label: item.postName || item.postCode || String(item.postId), value: item.postId })),
    [posts],
  );

  const positionOptions = useMemo(
    () => positions.map((item) => ({ label: item.positionName || item.positionCode || String(item.id), value: item.id })),
    [positions],
  );

  const displayPerson = (row: LifecycleApplication) => {
    if (row.name || row.employeeName || row.candidateName) {
      return row.name || row.employeeName || row.candidateName;
    }
    if (row.employeeId) return optionOrIdLabel('员工', employeeOptions, row.employeeId);
    if (row.candidateId) return optionOrIdLabel('候选人', candidateOptions, row.candidateId);
    return '-';
  };

  const rowsByType = useMemo(
    () => lifecycleTabs.reduce((acc, item) => {
      acc[item.value] = applications.filter((application) => application.type === item.value);
      return acc;
    }, {} as Record<LifecycleType, LifecycleApplication[]>),
    [applications],
  );

  const updateForm = (type: LifecycleType): React.Dispatch<React.SetStateAction<HrRecord>> =>
    (updater) => {
      setForms((prev) => ({
        ...prev,
        [type]: typeof updater === 'function' ? updater(prev[type]) : updater,
      }));
    };

  const fieldsByType = (type: LifecycleType): HrFormField[] => {
    if (type === 'ONBOARDING') {
      return [
        {
          key: 'candidateId',
          label: '候选人',
          type: 'select',
          valueType: 'number',
          options: candidateOptions,
          onValueChange: (value) => {
            const candidate = candidates.find((item) => String(item.id) === String(value));
            return {
              name: candidate?.name || '',
              deptId: candidate?.deptId || '',
              postId: candidate?.postId || '',
              positionId: candidate?.positionId || '',
            };
          },
        },
        { key: 'name', label: '姓名' },
        { key: 'deptId', label: '部门', type: 'dept' },
        { key: 'postId', label: '岗位', type: 'post' },
        { key: 'positionId', label: '职位', type: 'position', deptFieldKey: 'deptId' },
        { key: 'expectedDate', label: '预计日期', type: 'date' },
        { key: 'remark', label: '备注', type: 'textarea', className: 'md:col-span-2' },
      ];
    }

    if (type === 'RESIGNATION') {
      return [
        { key: 'employeeId', label: '员工', type: 'employee' },
        { key: 'effectiveDate', label: '离职日期', type: 'date' },
        { key: 'reason', label: '离职原因', type: 'textarea', className: 'md:col-span-2' },
      ];
    }

    if (type === 'PROBATION') {
      return [
        { key: 'employeeId', label: '员工', type: 'employee' },
        { key: 'expectedDate', label: '转正日期', type: 'date' },
        { key: 'remark', label: '备注', type: 'textarea', className: 'md:col-span-2' },
      ];
    }

    return [
      { key: 'employeeId', label: '员工', type: 'employee' },
      { key: 'deptId', label: '部门', type: 'dept' },
      { key: 'postId', label: '岗位', type: 'post' },
      { key: 'positionId', label: '职位', type: 'position', deptFieldKey: 'deptId' },
      { key: 'effectiveDate', label: '生效日期', type: 'date' },
      { key: 'remark', label: '备注', type: 'textarea', className: 'md:col-span-2' },
    ];
  };

  const submitAndReload = async (runner: () => Promise<unknown>, success: string) => {
    try {
      await runner();
      toast.success(success);
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, success.replace('已', '') + '失败'));
    }
  };

  const actionButtons = (row: LifecycleApplication) => {
    const status = String(row.status || '').toUpperCase();
    const buttons = [
      { label: '提交', action: 'submit', enabled: status === 'DRAFT' },
      { label: '通过', action: 'approve', enabled: status === 'APPROVING' },
      { label: '驳回', action: 'reject', enabled: status === 'APPROVING' },
      { label: row.type === 'TRANSFER' ? '生效' : '完成', action: row.type === 'TRANSFER' ? 'effective' : 'complete', enabled: ['APPROVED', 'ACCEPTED'].includes(status) },
    ];
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {buttons.map((button) => (
          <Button
            key={button.action}
            variant="outline"
            size="sm"
            disabled={!button.enabled}
            onClick={() => void submitAndReload(
              () => changeLifecycleApplicationStatus(row.id, button.action),
              `申请已${button.label}`,
            )}
          >
            {button.label}
          </Button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <HrPageHeader
        eyebrow="Lifecycle"
        title="员工异动"
        stats={lifecycleTabs.map((item) => ({
          label: item.label,
          value: rowsByType[item.value]?.length || 0,
          tone: activeTab === item.value ? 'active' : 'default',
        }))}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as LifecycleType)} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
          {lifecycleTabs.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="flex-1 lg:flex-none">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {lifecycleTabs.map((item) => (
          <TabsContent key={item.value} value={item.value}>
            <HrCrudPanel
              title={item.label}
              rows={rowsByType[item.value] || []}
              loading={loading}
              onRefresh={() => void loadData()}
              createLabel={`新增${item.label}`}
              dialogTitle={`新增${item.label}申请`}
              form={forms[item.value]}
              setForm={updateForm(item.value)}
              resetForm={formDefaults[item.value]}
              formFields={fieldsByType(item.value)}
              onCreate={(form) => submitAndReload(
                () => createLifecycleApplication(item.value, form),
                `${item.label}申请已保存`,
              )}
              columns={[
                { key: 'applicationNo', label: '编号' },
                { key: 'name', label: '员工/候选人', render: displayPerson },
                { key: 'type', label: '类型', render: () => typeLabels[item.value] },
                { key: 'expectedDate', label: '预计日期', render: (row) => formatDateValue(row.expectedDate || row.effectiveDate || row.onboardDate || row.actualDate) },
                { key: 'status', label: '状态', render: (row) => renderStatus(row.status, row.statusDesc) },
              ]}
              actions={actionButtons}
              minWidthClassName="min-w-[960px]"
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default HrLifecyclePage;
