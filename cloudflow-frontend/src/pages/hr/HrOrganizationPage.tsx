import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, ConfirmDialog, Tabs, TabsContent, TabsList, TabsTrigger, type TableRowActionItem } from '@/components/common';
import { Briefcase, Layers, RefreshCw, Users } from 'lucide-react';
import {
  DeptTreeNode,
  HrRecord,
  PostOption,
  createOrganizationLevel,
  createPosition,
  createPositionFamily,
  deleteOrganizationLevel,
  deletePosition,
  deletePositionFamily,
  getDeptTreeOptions,
  getPostOptions,
  getPositionOptions,
  listHeadcounts,
  listOrganizationLevels,
  listPositionFamilies,
  setHeadcount,
} from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import { flattenDeptTree, formatDateValue, idFallbackLabel, normalizeRows, optionOrIdLabel } from './hrShared';
import { HrCrudPanel, HrFormField, renderStatus } from './HrDomainWorkspace';
import { useDict } from '@/hooks/useDict';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import './admin-hr.css';

const familyDefault = (): HrRecord => ({
  familyCode: `FAM${Date.now()}`,
  familyName: '',
  sortOrder: 0,
  status: 1,
});

const levelDefault = (): HrRecord => ({
  levelCode: `LV${Date.now()}`,
  levelName: '',
  levelSeries: 'P',
  levelRank: 1,
  status: 1,
});

const positionDefault = (): HrRecord => ({
  positionCode: `POS${Date.now()}`,
  positionName: '',
  familyId: '',
  levelId: '',
  postId: '',
  status: 1,
});

const headcountDefault = (): HrRecord => ({
  targetType: 'DEPT',
  targetId: '',
  targetName: '',
  approvedCount: 1,
  actualCount: 0,
  effectiveDate: '',
  expiryDate: '',
});

const deleteAction = (onDelete: () => void): TableRowActionItem[] => [
  { key: 'delete', semantic: 'delete', label: '删除', onClick: onDelete },
];

const HrOrganizationPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('families');
  const [families, setFamilies] = useState<HrRecord[]>([]);
  const [levels, setLevels] = useState<HrRecord[]>([]);
  const [positions, setPositions] = useState<HrRecord[]>([]);
  const [headcounts, setHeadcounts] = useState<HrRecord[]>([]);
  const [posts, setPosts] = useState<PostOption[]>([]);
  const [deptTree, setDeptTree] = useState<DeptTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [familyForm, setFamilyForm] = useState<HrRecord>(familyDefault);
  const [levelForm, setLevelForm] = useState<HrRecord>(levelDefault);
  const [positionForm, setPositionForm] = useState<HrRecord>(positionDefault);
  const [headcountForm, setHeadcountForm] = useState<HrRecord>(headcountDefault);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; runner: () => Promise<unknown>; success: string } | null>(null);
  const levelSeriesDict = useDict('hr_level_series');
  const targetTypeDict = useDict('hr_target_type');

  const loadData = async () => {
    setLoading(true);
    try {
      const [familyRes, levelRes, positionRes, headcountRes, postRes, deptRes] = await Promise.all([
        listPositionFamilies(),
        listOrganizationLevels(),
        getPositionOptions(),
        listHeadcounts(),
        getPostOptions(),
        getDeptTreeOptions(),
      ]);
      setFamilies(normalizeRows<HrRecord>(familyRes));
      setLevels(normalizeRows<HrRecord>(levelRes));
      setPositions(normalizeRows<HrRecord>(positionRes));
      setHeadcounts(normalizeRows<HrRecord>(headcountRes));
      setPosts(normalizeRows<PostOption>(postRes));
      setDeptTree(normalizeRows<DeptTreeNode>(deptRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '组织编制数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const familyOptions = useMemo(
    () => families.map((item) => ({ label: item.familyName || item.familyCode, value: item.id })),
    [families],
  );
  const levelOptions = useMemo(
    () => levels.map((item) => ({ label: item.levelName || item.levelCode, value: item.id })),
    [levels],
  );
  const postOptions = useMemo(
    () => posts.map((item) => ({ label: item.postName || item.postCode || String(item.postId), value: item.postId })),
    [posts],
  );
  const deptOptions = useMemo(() => flattenDeptTree(deptTree), [deptTree]);
  const headcountTargetOptions = useMemo(
    () => headcountForm.targetType === 'POST' ? postOptions : deptOptions,
    [deptOptions, headcountForm.targetType, postOptions],
  );

  const getOptionLabel = (value: string | number, options: Array<{ label: React.ReactNode; value: string | number }>) => {
    const option = options.find((item) => String(item.value) === String(value));
    return typeof option?.label === 'string' || typeof option?.label === 'number' ? String(option.label) : '';
  };

  const headcountTargetLabel = (row: HrRecord) => {
    const targetType = String(row.targetType || '').toUpperCase();
    const options = targetType === 'POST' ? postOptions : deptOptions;
    const prefix = targetTypeDict.getLabel(targetType) || '对象';
    return row.targetName || getOptionLabel(row.targetId, options) || idFallbackLabel(prefix, row.targetId);
  };

  const familyFields: HrFormField[] = [
    { key: 'familyName', label: '职位族名称' },
    { key: 'sortOrder', label: '排序', type: 'number' },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
    { key: 'description', label: '说明', type: 'textarea', className: 'md:col-span-2' },
  ];

  const levelFields: HrFormField[] = [
    { key: 'levelName', label: '职级名称' },
    { key: 'levelSeries', label: '序列', type: 'select', options: levelSeriesDict.getOptions() },
    { key: 'levelRank', label: '等级', type: 'number' },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
    { key: 'description', label: '说明', type: 'textarea', className: 'md:col-span-2' },
  ];

  const positionFields: HrFormField[] = [
    { key: 'positionName', label: '职位名称' },
    { key: 'familyId', label: '职位族', type: 'select', valueType: 'number', options: familyOptions },
    { key: 'levelId', label: '职级', type: 'select', valueType: 'number', options: levelOptions },
    { key: 'postId', label: '岗位', type: 'post' },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
    { key: 'jobDescription', label: '职责', type: 'textarea', className: 'md:col-span-2' },
    { key: 'requirements', label: '任职要求', type: 'textarea', className: 'md:col-span-2' },
  ];

  const headcountFields: HrFormField[] = [
    {
      key: 'targetType',
      label: '对象类型',
      type: 'select',
      options: [{ label: '部门', value: 'DEPT' }, { label: '岗位', value: 'POST' }],
      onValueChange: () => ({ targetId: '', targetName: '' }),
    },
    {
      key: 'targetId',
      label: headcountForm.targetType === 'POST' ? '岗位' : '部门',
      type: 'select',
      valueType: 'number',
      options: headcountTargetOptions,
      onValueChange: (value) => ({ targetName: getOptionLabel(value as string | number, headcountTargetOptions) }),
    },
    { key: 'approvedCount', label: '核定人数', type: 'number' },
    { key: 'actualCount', label: '在岗人数', type: 'number' },
    { key: 'effectiveDate', label: '生效日期', type: 'date' },
    { key: 'expiryDate', label: '失效日期', type: 'date' },
  ];

  const submitAndReload = async (runner: () => Promise<unknown>, success: string) => {
    try {
      await runner();
      toast.success(success);
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, success.replace('已', '') + '失败'));
    }
  };

  const metrics = [
    { label: '职位族', value: String(families.length), meta: '职位分类', icon: <Layers size={18} />, tone: 'blue' },
    { label: '职级', value: String(levels.length), meta: '级别序列', icon: <Layers size={18} />, tone: 'green' },
    { label: '职位', value: String(positions.length), meta: '职位库', icon: <Briefcase size={18} />, tone: 'amber' },
    { label: '编制', value: String(headcounts.length), meta: '组织/岗位编制', icon: <Users size={18} />, tone: 'violet' },
  ];

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="contents">
        <section className="admin-source-page admin-hr-organization-page">
          <TablePageLayout
            actions={
              <>
                <header className="admin-source-header">
                  <div>
                    <p className="admin-source-kicker">HR ORGANIZATION</p>
                    <h2>组织编制</h2>
                    <span>维护职位族、职级、职位和组织编制</span>
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
                  <TabsTrigger value="families" className="flex-1 lg:flex-none">职位族</TabsTrigger>
                  <TabsTrigger value="levels" className="flex-1 lg:flex-none">职级</TabsTrigger>
                  <TabsTrigger value="positions" className="flex-1 lg:flex-none">职位</TabsTrigger>
                  <TabsTrigger value="headcounts" className="flex-1 lg:flex-none">编制</TabsTrigger>
                </TabsList>
              </section>
            }
            table={
              <>
                <TabsContent value="families" className="mt-0">
            <HrCrudPanel
              title="职位族"
              rows={families}
              loading={loading}
              onRefresh={() => void loadData()}
              createLabel="新增职位族"
              dialogTitle="新增职位族"
              form={familyForm}
              setForm={setFamilyForm}
              resetForm={familyDefault}
              formFields={familyFields}
              onCreate={(form) => submitAndReload(() => createPositionFamily(form), '职位族已保存')}
              columns={[
                { key: 'familyCode', label: '编码' },
                { key: 'familyName', label: '名称' },
                { key: 'sortOrder', label: '排序' },
                { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
              ]}
              actions={(row) => deleteAction(() => setDeleteTarget({ name: String(row.familyName || row.familyCode || row.id), runner: () => deletePositionFamily(Number(row.id)), success: '职位族已删除' }))}
            />
                </TabsContent>
          
                <TabsContent value="levels" className="mt-0">
            <HrCrudPanel
              title="职级"
              rows={levels}
              loading={loading}
              onRefresh={() => void loadData()}
              createLabel="新增职级"
              dialogTitle="新增职级"
              form={levelForm}
              setForm={setLevelForm}
              resetForm={levelDefault}
              formFields={levelFields}
              onCreate={(form) => submitAndReload(() => createOrganizationLevel(form), '职级已保存')}
              columns={[
                { key: 'levelCode', label: '编码' },
                { key: 'levelName', label: '名称' },
                { key: 'levelSeries', label: '序列', render: (row) => levelSeriesDict.getLabel(String(row.levelSeries ?? '')) },
                { key: 'levelRank', label: '等级' },
                { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
              ]}
              actions={(row) => deleteAction(() => setDeleteTarget({ name: String(row.levelName || row.levelCode || row.id), runner: () => deleteOrganizationLevel(Number(row.id)), success: '职级已删除' }))}
            />
                </TabsContent>
          
                <TabsContent value="positions" className="mt-0">
            <HrCrudPanel
              title="职位"
              rows={positions}
              loading={loading}
              onRefresh={() => void loadData()}
              createLabel="新增职位"
              dialogTitle="新增职位"
              form={positionForm}
              setForm={setPositionForm}
              resetForm={positionDefault}
              formFields={positionFields}
              onCreate={(form) => submitAndReload(() => createPosition(form), '职位已保存')}
              columns={[
                { key: 'positionCode', label: '编码' },
                { key: 'positionName', label: '职位' },
                { key: 'familyId', label: '职位族', render: (row) => row.familyName || optionOrIdLabel('职位族', familyOptions, row.familyId) },
                { key: 'levelId', label: '职级', render: (row) => row.levelName || optionOrIdLabel('职级', levelOptions, row.levelId) },
                { key: 'postId', label: '岗位', render: (row) => row.postName || optionOrIdLabel('岗位', postOptions, row.postId) },
                { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
              ]}
              actions={(row) => deleteAction(() => setDeleteTarget({ name: String(row.positionName || row.positionCode || row.id), runner: () => deletePosition(Number(row.id)), success: '职位已删除' }))}
            />
                </TabsContent>
          
                <TabsContent value="headcounts" className="mt-0">
            <HrCrudPanel
              title="编制"
              rows={headcounts}
              loading={loading}
              onRefresh={() => void loadData()}
              createLabel="新增编制"
              dialogTitle="新增编制"
              form={headcountForm}
              setForm={setHeadcountForm}
              resetForm={headcountDefault}
              formFields={headcountFields}
              onCreate={(form) => submitAndReload(() => setHeadcount(form as Parameters<typeof setHeadcount>[0]), '编制已保存')}
              columns={[
                { key: 'targetType', label: '对象', render: (row) => targetTypeDict.getLabel(String(row.targetType ?? '')) },
                { key: 'targetName', label: '名称', render: headcountTargetLabel },
                { key: 'approvedCount', label: '核定' },
                { key: 'actualCount', label: '在岗' },
                { key: 'vacancyCount', label: '空缺' },
                { key: 'effectiveDate', label: '生效日期', render: (row) => formatDateValue(row.effectiveDate) },
                { key: 'expiryDate', label: '失效日期', render: (row) => formatDateValue(row.expiryDate) },
              ]}
            />
                </TabsContent>
              </>
            }
          />
        </section>
      </Tabs>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="确认删除"
        message={deleteTarget ? `确认删除「${deleteTarget.name}」?此操作不可撤销。` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          setDeleteTarget(null);
          void submitAndReload(target.runner, target.success);
        }}
      />
    </>
  );
};

export default HrOrganizationPage;
