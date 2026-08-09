import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger, type TableRowActionItem } from '@/components/common';
import { CheckCircle2, LogOut, RefreshCw, Repeat, UserPlus } from 'lucide-react';
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
import { HrCrudPanel, HrFormField, renderStatus } from './HrDomainWorkspace';
import { useDict } from '@/hooks/useDict';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import './admin-hr.css';

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

const HrLifecyclePage: React.FC = () => {
  const lifecycleTypeDict = useDict('hr_lifecycle_type');
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

  const actionButtons = (row: LifecycleApplication): TableRowActionItem[] => {
    const status = String(row.status || '').toUpperCase();
    const items: Array<{ label: string; action: string; semantic: TableRowActionItem['semantic']; enabled: boolean }> = [
      { label: '提交', action: 'submit', semantic: 'submit', enabled: status === 'DRAFT' },
      { label: '通过', action: 'approve', semantic: 'confirm', enabled: status === 'APPROVING' },
      { label: '驳回', action: 'reject', semantic: 'void', enabled: status === 'APPROVING' },
      { label: row.type === 'TRANSFER' ? '生效' : '完成', action: row.type === 'TRANSFER' ? 'effective' : 'complete', semantic: 'confirm', enabled: ['APPROVED', 'ACCEPTED'].includes(status) },
    ];
    return items
      .filter((item) => item.enabled)
      .map((item) => ({
        key: item.action,
        label: item.label,
        semantic: item.semantic,
        onClick: () => void submitAndReload(
          () => changeLifecycleApplicationStatus(row.id, item.action),
          `申请已${item.label}`,
        ),
      }));
  };

  const metrics = [
    { label: '入职', value: String(rowsByType.ONBOARDING?.length || 0), meta: '候选人转员工', icon: <UserPlus size={18} />, tone: 'blue' },
    { label: '转正', value: String(rowsByType.PROBATION?.length || 0), meta: '试用期流程', icon: <CheckCircle2 size={18} />, tone: 'green' },
    { label: '调岗', value: String(rowsByType.TRANSFER?.length || 0), meta: '组织变更', icon: <Repeat size={18} />, tone: 'amber' },
    { label: '离职', value: String(rowsByType.RESIGNATION?.length || 0), meta: '离职交接', icon: <LogOut size={18} />, tone: 'violet' },
  ];

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as LifecycleType)} className="contents">
      <section className="admin-source-page admin-hr-lifecycle-page">
        <TablePageLayout
          actions={
            <>
              <header className="admin-source-header">
                <div>
                  <p className="admin-source-kicker">HR LIFECYCLE</p>
                  <h2>员工生命周期</h2>
                  <span>处理入职、转正、调岗和离职申请</span>
                </div>
                <div className="admin-source-controls">
                  <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    刷新
                  </Button>
                </div>
              </header>
        
              <section className="admin-source-stat-grid">
                {metrics.map((metric) => (
                  <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
                    <div className="admin-source-stat-icon">{metric.icon}</div>
                    <div>
                      <p>{metric.label}</p>
                      <strong>{metric.value}</strong>
                      <span>{metric.meta}</span>
                    </div>
                  </article>
                ))}
              </section>
            </>
          }
          filters={
            <section className="card admin-users-toolbar">
              <TabsList className="admin-source-tabs w-full justify-start lg:w-auto">
                {lifecycleTabs.map((item) => (
                  <TabsTrigger key={item.value} value={item.value} className="flex-1 lg:flex-none">
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </section>
          }
          table={
            <>
              {lifecycleTabs.map((item) => (
                <TabsContent key={item.value} value={item.value} className="mt-0">
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
                  { key: 'type', label: '类型', render: () => lifecycleTypeDict.getLabel(item.value) },
                  { key: 'expectedDate', label: '预计日期', render: (row) => formatDateValue(row.expectedDate || row.effectiveDate || row.onboardDate || row.actualDate) },
                  { key: 'status', label: '状态', render: (row) => renderStatus(row.status, row.statusDesc) },
                ]}
                actions={actionButtons}
                minWidthClassName="min-w-[960px]"
              />
                </TabsContent>
              ))}
            </>
          }
        />
      </section>
    </Tabs>
  );
};

export default HrLifecyclePage;
