import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
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
import { enumLabel, flattenDeptTree, formatDateValue, idFallbackLabel, normalizeRows, optionOrIdLabel } from './hrShared';
import { HrCrudPanel, HrFormField, HrPageHeader, renderStatus } from './HrDomainWorkspace';

const levelSeriesLabels: Record<string, string> = {
  P: '专业序列',
  M: '管理序列',
  S: '支持序列',
};

const targetTypeLabels: Record<string, string> = {
  DEPT: '部门',
  POST: '岗位',
};

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

const compactActions = (onDelete: () => void) => (
  <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={onDelete}>
    <Trash2 size={14} className="mr-1.5" />
    删除
  </Button>
);

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
    const prefix = targetTypeLabels[targetType] || '对象';
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
    { key: 'levelSeries', label: '序列', type: 'select', options: [{ label: '专业序列', value: 'P' }, { label: '管理序列', value: 'M' }, { label: '支持序列', value: 'S' }] },
    { key: 'levelRank', label: '等级', type: 'number' },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
    { key: 'description', label: '说明', type: 'textarea', className: 'md:col-span-2' },
  ];

  const positionFields: HrFormField[] = [
    { key: 'positionName', label: '职位名称' },
    { key: 'familyId', label: '职位族', type: 'select', valueType: 'number', options: familyOptions },
    { key: 'levelId', label: '职级', type: 'select', valueType: 'number', options: levelOptions },
    { key: 'postId', label: '岗位', type: 'select', valueType: 'number', options: postOptions },
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

  return (
    <div className="space-y-4">
      <HrPageHeader
        eyebrow="Organization"
        title="组织编制"
        stats={[
          { label: '职位族', value: families.length },
          { label: '职级', value: levels.length },
          { label: '职位', value: positions.length },
          { label: '编制', value: headcounts.length, tone: 'active' },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
          <TabsTrigger value="families" className="flex-1 lg:flex-none">职位族</TabsTrigger>
          <TabsTrigger value="levels" className="flex-1 lg:flex-none">职级</TabsTrigger>
          <TabsTrigger value="positions" className="flex-1 lg:flex-none">职位</TabsTrigger>
          <TabsTrigger value="headcounts" className="flex-1 lg:flex-none">编制</TabsTrigger>
        </TabsList>

        <TabsContent value="families">
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
            actions={(row) => compactActions(() => void submitAndReload(() => deletePositionFamily(Number(row.id)), '职位族已删除'))}
          />
        </TabsContent>

        <TabsContent value="levels">
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
              { key: 'levelSeries', label: '序列', render: (row) => enumLabel(levelSeriesLabels, row.levelSeries) },
              { key: 'levelRank', label: '等级' },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
            actions={(row) => compactActions(() => void submitAndReload(() => deleteOrganizationLevel(Number(row.id)), '职级已删除'))}
          />
        </TabsContent>

        <TabsContent value="positions">
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
            actions={(row) => compactActions(() => void submitAndReload(() => deletePosition(Number(row.id)), '职位已删除'))}
          />
        </TabsContent>

        <TabsContent value="headcounts">
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
              { key: 'targetType', label: '对象', render: (row) => enumLabel(targetTypeLabels, row.targetType) },
              { key: 'targetName', label: '名称', render: headcountTargetLabel },
              { key: 'approvedCount', label: '核定' },
              { key: 'actualCount', label: '在岗' },
              { key: 'vacancyCount', label: '空缺' },
              { key: 'effectiveDate', label: '生效日期', render: (row) => formatDateValue(row.effectiveDate) },
              { key: 'expiryDate', label: '失效日期', render: (row) => formatDateValue(row.expiryDate) },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HrOrganizationPage;
