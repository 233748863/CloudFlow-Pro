import React from 'react';
import { FilePlus2, Landmark, ShieldCheck } from 'lucide-react';
import {
  Button,
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
import { cn } from '@/utils/cn';
import { toDateInputValue } from '../hrShared';

type SectionComponents = {
  WorkspaceSectionCard: React.ComponentType<any>;
  WorkspaceMetricStrip: React.ComponentType<any>;
  WorkspaceDiagnosticSummary: React.ComponentType<any>;
  WorkspaceTableStateRow: React.ComponentType<any>;
  WorkspaceInlineState: React.ComponentType<any>;
  DetailRow: React.ComponentType<any>;
};

type SalaryItemsSectionProps = {
  components: SectionComponents;
  enabledSalaryItems: any[];
  salaryItems: any[];
  linkedSalaryItems: any[];
  orphanSalaryItems: any[];
  formulaSalaryItems: any[];
  salaryItemUsageMap: Map<number, any>;
  itemTypeLabel: (value: string) => string;
  itemCategoryLabel: (value: string) => string;
  openItemDialog: () => void;
  openItemEditDialog: (item: any) => void;
  handleDeleteItem: (item: any) => Promise<void> | void;
  actionLoading: boolean;
  foundationLoading: boolean;
};

export const SalaryItemsSection: React.FC<SalaryItemsSectionProps> = ({
  components,
  enabledSalaryItems,
  salaryItems,
  linkedSalaryItems,
  orphanSalaryItems,
  formulaSalaryItems,
  salaryItemUsageMap,
  itemTypeLabel,
  itemCategoryLabel,
  openItemDialog,
  openItemEditDialog,
  handleDeleteItem,
  actionLoading,
  foundationLoading,
}) => {
  const { WorkspaceSectionCard, WorkspaceTableStateRow } = components;

  return (
    <WorkspaceSectionCard
      title="薪资项目"
      headerAside={(
        <Button variant="outline" onClick={openItemDialog}>
          <FilePlus2 size={14} className="mr-2" />
          新建项目
        </Button>
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-300">
          <span className="font-medium">已启用项目</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">{enabledSalaryItems.length}</span>
          <span className="text-slate-400 dark:text-slate-500">/ 总数 {salaryItems.length}</span>
        </div>
        <span>命中现薪联动 {linkedSalaryItems.length}</span>
        <span>孤立项目 {orphanSalaryItems.length}</span>
        <span>带公式项目 {formulaSalaryItems.length}</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[160px]">项目名称</TableHead>
              <TableHead className="min-w-[180px]">编码</TableHead>
              <TableHead className="min-w-[140px]">类型 / 分类</TableHead>
              <TableHead className="min-w-[180px]">联动体检</TableHead>
              <TableHead className="min-w-[120px]">计税 / 联动</TableHead>
              <TableHead className="w-[132px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salaryItems.map((item) => {
              const usage = salaryItemUsageMap.get(item.id);
              return (
                <TableRow key={item.id}>
                  <TableCell className="min-w-[160px]">
                    <div className="font-medium text-slate-900">{item.itemName}</div>
                    {item.formula && String(item.formula).trim() && (
                      <div className="mt-2">
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                          带公式
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[180px]">{item.itemCode}</TableCell>
                  <TableCell className="min-w-[140px]">
                    <div className="font-medium text-slate-900">{item.itemTypeDesc || itemTypeLabel(item.itemType)}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.categoryDesc || itemCategoryLabel(item.category)}</div>
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="font-medium text-slate-900">
                      {usage?.structureIds.size || 0} 套结构 / {usage?.activeEmployeeIds.size || 0} 名员工
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {usage?.structureIds.size
                        ? [
                          usage?.activeArchiveCount ? `ACTIVE ${usage.activeArchiveCount}` : '',
                          usage?.futureArchiveCount ? `未来 ${usage.futureArchiveCount}` : '',
                        ].filter(Boolean).join(' / ') || '-'
                        : '-'}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[120px]">
                    <div className="font-medium text-slate-900">{item.isTaxable ? '参与计税' : '不参与计税'}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {Number(item.status ?? 1) === 0 && usage?.structureIds.size
                        ? '禁用引用'
                        : usage?.structureIds.size
                          ? '已联动'
                          : '-'}
                    </div>
                  </TableCell>
                  <TableCell className="w-[132px]">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-[56px] whitespace-nowrap"
                        onClick={() => openItemEditDialog(item)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-w-[56px] whitespace-nowrap"
                        disabled={actionLoading}
                        onClick={() => void handleDeleteItem(item)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!salaryItems.length && !foundationLoading && <WorkspaceTableStateRow colSpan={6} title="无薪资项目" />}
          </TableBody>
        </Table>
      </div>
    </WorkspaceSectionCard>
  );
};

type SalaryStructuresSectionProps = {
  components: SectionComponents;
  salaryStructures: any[];
  selectedStructureId: string;
  setSelectedStructureId: (value: string) => void;
  structureStatusClass: (status?: number | null) => string;
  structureDetail: any;
  structureDetailLoading: boolean;
  openStructureDialog: () => void;
  openStructureEditDialog: (id: number) => Promise<void> | void;
  handleDeleteStructure: (item: any) => Promise<void> | void;
  actionLoading: boolean;
  structureLinkedEmployeeIds: number[];
  structureLinkedSalaryStats: any;
  structureItemStats: any;
  selectedStructureDeleteDiagnostics: any;
  structureLinkedEmployeeRecords: any[];
  focusStructureEmployees: (id: number) => Promise<void> | void;
  structureLinkedEmployeeRows: any[];
  employeeMap: Map<number, any>;
  formatCurrency: (value: number) => string;
  isFutureDate: (value?: string | null) => boolean;
  focusEmployeeWorkspace: (employeeId: number) => void;
  itemCategoryLabel: (value: string) => string;
  itemTypeLabel: (value: string) => string;
};

export const SalaryStructuresSection: React.FC<SalaryStructuresSectionProps> = ({
  components,
  salaryStructures,
  selectedStructureId,
  setSelectedStructureId,
  structureStatusClass,
  structureDetail,
  structureDetailLoading,
  openStructureDialog,
  openStructureEditDialog,
  handleDeleteStructure,
  actionLoading,
  structureLinkedEmployeeIds,
  structureLinkedSalaryStats,
  structureItemStats,
  selectedStructureDeleteDiagnostics,
  structureLinkedEmployeeRecords,
  focusStructureEmployees,
  structureLinkedEmployeeRows,
  employeeMap,
  formatCurrency,
  isFutureDate,
  focusEmployeeWorkspace,
  itemCategoryLabel,
  itemTypeLabel,
}) => {
  const {
    WorkspaceSectionCard,
    WorkspaceMetricStrip,
    WorkspaceTableStateRow,
    WorkspaceInlineState,
    DetailRow,
  } = components;

  return (
    <WorkspaceSectionCard
      title="薪资结构"
      headerAside={(
        <Button variant="outline" onClick={openStructureDialog}>
          <FilePlus2 size={14} className="mr-2" />
          新建结构
        </Button>
      )}
    >
      <div className="grid grid-cols-1 gap-4 xl:items-start xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
          {salaryStructures.map((item) => {
            const isActive = String(item.id) === selectedStructureId;
            return (
              <button
                key={item.id}
                type="button"
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  isActive
                    ? 'border-slate-300 bg-slate-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => setSelectedStructureId(String(item.id))}
              >
                <div className="font-semibold text-slate-900">{item.structureName}</div>
                <div className="mt-1 text-xs text-slate-400">{item.structureCode}</div>
                <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${structureStatusClass(item.status)}`}>
                  {item.statusDesc || (item.status === 1 ? '启用' : '禁用')}
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!structureDetail && !structureDetailLoading && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
              从左侧选择一个薪资结构查看详情。
            </div>
          )}

          {structureDetail && (
            <div className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs text-slate-400">结构名称</div>
                  <div className="mt-2 text-xl font-semibold text-slate-900">{structureDetail.structureName}</div>
                  <div className="mt-1 text-sm text-slate-500">{structureDetail.structureCode}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void openStructureEditDialog(structureDetail.id)}>
                    编辑结构
                  </Button>
                  <Button
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => void handleDeleteStructure(structureDetail)}
                  >
                    删除结构
                  </Button>
                </div>
              </div>

              <WorkspaceMetricStrip
                items={[
                  {
                    key: 'structure-status',
                    label: '结构状态',
                    value: structureDetail.statusDesc || (structureDetail.status === 1 ? '启用' : '禁用'),
                    tone: structureDetail.status === 1 ? 'emerald' : 'amber',
                  },
                  {
                    key: 'linked-employees',
                    label: '在岗关联员工',
                    value: structureLinkedEmployeeIds.length,
                  },
                  {
                    key: 'salary-samples',
                    label: '现薪样本',
                    value: structureLinkedSalaryStats.count,
                    tone: structureLinkedSalaryStats.count ? 'sky' : 'default',
                  },
                  {
                    key: 'item-stats',
                    label: '项目',
                    value: structureItemStats.total,
                    tone: structureItemStats.disabled ? 'amber' : 'default',
                  },
                ]}
              />

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
                <DetailRow
                  label="结构说明"
                  value={structureDetail.description || '-'}
                  valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
                />
                <DetailRow
                  label="在岗员工"
                  value={structureLinkedEmployeeIds.length ? `${structureLinkedEmployeeIds.length} 名` : '-'}
                  valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
                />
                <DetailRow
                  label="删除限制"
                  value={selectedStructureDeleteDiagnostics
                    ? selectedStructureDeleteDiagnostics.riskItems.length
                      ? selectedStructureDeleteDiagnostics.riskItems[0].title
                      : '-'
                    : '-'}
                  valueClassName={cn(
                    'max-w-[72%] text-left',
                    selectedStructureDeleteDiagnostics?.riskItems.length
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-slate-600 dark:text-slate-300',
                  )}
                />
              </div>

              {structureLinkedEmployeeRecords.length > 0 && (
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => void focusStructureEmployees(structureDetail.id)}>
                    查看关联员工
                  </Button>
                </div>
              )}

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="font-semibold text-slate-900">关联现薪样本</div>
                  <div className="text-xs text-slate-400">
                    共 {structureLinkedEmployeeRows.length} 条 / {structureLinkedEmployeeIds.length} 名员工
                    {structureLinkedSalaryStats.count ? ` / 最高 ${formatCurrency(structureLinkedSalaryStats.max)}` : ''}
                  </div>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">员工</TableHead>
                        <TableHead className="min-w-[120px]">部门</TableHead>
                        <TableHead className="w-[120px] whitespace-nowrap">总薪资</TableHead>
                        <TableHead className="min-w-[140px]">生效日期</TableHead>
                        <TableHead className="w-[112px] text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {structureLinkedEmployeeRows.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="min-w-[160px]">
                            <div className="font-medium text-slate-900">{item.employeeName || `员工 #${item.employeeId}`}</div>
                            <div className="mt-1 text-xs text-slate-400">{item.employeeNo || '-'}</div>
                          </TableCell>
                          <TableCell className="min-w-[120px]">{employeeMap.get(item.employeeId)?.deptName || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(item.totalSalary)}</TableCell>
                          <TableCell className="min-w-[140px]">
                            <div className="whitespace-nowrap">{toDateInputValue(item.effectiveDate) || '-'}</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {isFutureDate(item.effectiveDate) ? (
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                                  未来生效
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300">
                                  已生效
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="w-[112px]">
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="min-w-[88px] whitespace-nowrap"
                                onClick={() => focusEmployeeWorkspace(item.employeeId)}
                              >
                                查看现薪
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!structureLinkedEmployeeRows.length && <WorkspaceTableStateRow colSpan={5} title="无现薪样本" />}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="font-semibold text-slate-900">关联项目</div>
                  <div className="text-xs text-slate-400">{structureDetail.items?.length || 0} 个</div>
                </div>
                <div className="max-h-[320px] overflow-y-auto">
                  <Table className="min-w-[680px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">项目</TableHead>
                        <TableHead className="min-w-[120px]">分类</TableHead>
                        <TableHead className="min-w-[140px]">类型</TableHead>
                        <TableHead className="w-[96px]">计税</TableHead>
                        <TableHead className="w-[96px]">状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {structureDetail.items?.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="min-w-[180px]">
                            <div className="font-medium text-slate-900">{item.itemName}</div>
                            <div className="mt-1 text-xs text-slate-400">{item.itemCode}</div>
                          </TableCell>
                          <TableCell className="min-w-[120px]">{item.categoryDesc || itemCategoryLabel(item.category)}</TableCell>
                          <TableCell className="min-w-[140px]">
                            <div>{item.itemTypeDesc || itemTypeLabel(item.itemType)}</div>
                            <div className="mt-1 text-xs text-slate-400">
                              {item.formula && String(item.formula).trim() ? '已配公式' : '手工录入'}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className={cn(
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              item.isTaxable
                                ? 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300'
                                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
                            )}>
                              {item.isTaxable ? '计税' : '不计税'}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className={cn(
                              'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                              Number(item.status ?? 1) === 1
                                ? 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300'
                                : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300',
                            )}>
                              {Number(item.status ?? 1) === 1 ? '启用' : '禁用'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!structureDetail.items?.length && <WorkspaceTableStateRow colSpan={5} title="无关联项目" />}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {structureDetailLoading && (
            <WorkspaceInlineState type="loading" title="正在加载薪资结构详情..." className="py-4" />
          )}
        </div>
      </div>
    </WorkspaceSectionCard>
  );
};

type SalaryGradesSectionProps = {
  components: SectionComponents;
  activeJobLevels: any[];
  sortedSalaryGrades: any[];
  pendingGradeLevels: any[];
  highestSalaryGrade: any;
  salaryGradeRiskSummary: any;
  salaryGradeRiskItems: any[];
  gradeSeriesCoverage: any[];
  openGradeDialog: (levelId?: number) => void;
  salaryGradeDiagnostics: any;
  jobLevelMap: Map<number, any>;
  formatCurrency: (value: number) => string;
  openGradeEditDialog: (item: any) => void;
  handleDeleteGrade: (item: any) => Promise<void> | void;
  actionLoading: boolean;
  foundationLoading: boolean;
};

export const SalaryGradesSection: React.FC<SalaryGradesSectionProps> = ({
  components,
  activeJobLevels,
  sortedSalaryGrades,
  pendingGradeLevels,
  highestSalaryGrade,
  salaryGradeRiskSummary,
  salaryGradeRiskItems,
  gradeSeriesCoverage,
  openGradeDialog,
  salaryGradeDiagnostics,
  jobLevelMap,
  formatCurrency,
  openGradeEditDialog,
  handleDeleteGrade,
  actionLoading,
  foundationLoading,
}) => {
  const {
    WorkspaceSectionCard,
    WorkspaceMetricStrip,
    WorkspaceDiagnosticSummary,
    WorkspaceTableStateRow,
  } = components;

  return (
    <WorkspaceSectionCard
      title="薪资等级"
      headerAside={(
        <Button variant="outline" onClick={() => openGradeDialog()}>
          <Landmark size={14} className="mr-2" />
          设置薪级
        </Button>
      )}
    >
      <WorkspaceMetricStrip
        items={[
          {
            key: 'job-levels',
            label: '启用职级',
            value: activeJobLevels.length,
          },
          {
            key: 'configured-grades',
            label: '已配置薪级',
            value: sortedSalaryGrades.length,
            tone: 'emerald',
          },
          {
            key: 'pending-levels',
            label: '待配置职级',
            value: pendingGradeLevels.length,
            tone: pendingGradeLevels.length ? 'amber' : 'default',
          },
          {
            key: 'highest-grade',
            label: '最高上限',
            value: formatCurrency(highestSalaryGrade?.maxSalary || 0),
            tone: highestSalaryGrade ? 'sky' : 'default',
          },
        ]}
      />

      <WorkspaceDiagnosticSummary
        summary={salaryGradeRiskSummary}
        items={salaryGradeRiskItems}
        emptyText="已对齐"
        className="mt-4"
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">序列覆盖</div>
          </div>
          {pendingGradeLevels.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => openGradeDialog(pendingGradeLevels[0].id)}>
              优先补一条
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {gradeSeriesCoverage.length > 0 ? gradeSeriesCoverage.map((item) => (
              <div key={item.series} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.series} 序列</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {item.configured}/{item.total} 个职级已配薪级
                    </div>
                  </div>
                  <div className={cn('text-sm font-semibold', item.textClassName)}>
                    {item.coverage}%
                  </div>
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {item.missing
                    ? item.configured === 0
                      ? '未配置'
                      : `待配 ${item.missing} 个`
                    : '已覆盖'}
                </div>
              </div>
            )) : (
              <div className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                无职级序列
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800 lg:border-l lg:border-t-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">待配置职级</div>
            {pendingGradeLevels.length > 0 ? (
              <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                {pendingGradeLevels.length} 个
              </div>
            ) : null}
            {pendingGradeLevels.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingGradeLevels.slice(0, 10).map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-900"
                    onClick={() => openGradeDialog(level.id)}
                  >
                    {[level.levelCode, level.levelName].filter(Boolean).join(' / ')}
                  </button>
                ))}
                {pendingGradeLevels.length > 10 ? (
                  <div className="rounded-full border border-transparent px-1 py-1.5 text-xs text-slate-500 dark:text-slate-400">
                    +{pendingGradeLevels.length - 10}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>职级</TableHead>
              <TableHead>最低薪资</TableHead>
              <TableHead>中位薪资</TableHead>
              <TableHead>最高薪资</TableHead>
              <TableHead>币种</TableHead>
              <TableHead>异常</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSalaryGrades.map((item) => {
              const rowIssues = salaryGradeDiagnostics.rowIssueMap.get(item.id) || [];
              const rowClassName = rowIssues.length
                ? 'bg-slate-50/70 dark:bg-slate-900/40'
                : '';

              return (
                <TableRow key={item.id} className={rowClassName}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{item.levelName || '-'}</div>
                    <div className="text-xs text-slate-400">
                      {[item.levelCode, jobLevelMap.get(item.levelId)?.levelSeries ? `${jobLevelMap.get(item.levelId)?.levelSeries} 序列` : ''].filter(Boolean).join(' / ') || '-'}
                    </div>
                  </TableCell>
                  <TableCell>{formatCurrency(item.minSalary)}</TableCell>
                  <TableCell>{formatCurrency(item.midSalary)}</TableCell>
                  <TableCell>{formatCurrency(item.maxSalary)}</TableCell>
                  <TableCell>{item.currencyDesc || item.currency || '-'}</TableCell>
                  <TableCell>
                    {rowIssues.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {rowIssues.map((issue: any) => (
                          <span
                            key={issue.key}
                            className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300"
                          >
                            {issue.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openGradeEditDialog(item)}>
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading}
                        onClick={() => void handleDeleteGrade(item)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!sortedSalaryGrades.length && !foundationLoading && (
              <WorkspaceTableStateRow colSpan={7} title="无薪级数据" />
            )}
          </TableBody>
        </Table>
      </div>
    </WorkspaceSectionCard>
  );
};

type SalaryInsuranceSectionProps = {
  components: SectionComponents;
  openInsuranceSchemeDialog: () => void;
  insuranceSchemeStats: any;
  insuranceSchemeRiskSummary: any;
  insuranceSchemeRiskItems: any[];
  insuranceSchemeCityFilter: string;
  setInsuranceSchemeCityFilter: (value: string) => void;
  insuranceSchemeStatusFilter: string;
  setInsuranceSchemeStatusFilter: (value: string) => void;
  insuranceSchemeCityOptions: any[];
  ALL_VALUE: string;
  currentEmployeeRecord: any;
  currentSelectedEmployeeLabel: string;
  activeLinkedInsuranceSchemes: any[];
  unusedInsuranceSchemes: any[];
  expiredOnlyInsuranceSchemes: any[];
  filteredInsuranceSchemes: any[];
  insuranceSchemeUsageMap: Map<number, any>;
  structureStatusClass: (status?: number | null) => string;
  formatCurrency: (value: number) => string;
  formatPercent: (value: number) => string;
  openInsuranceSchemeEditDialog: (item: any) => void;
  openInsuranceAssignDialogWithScheme: (item: any) => void;
  actionLoading: boolean;
  foundationLoading: boolean;
};

export const SalaryInsuranceSection: React.FC<SalaryInsuranceSectionProps> = ({
  components,
  openInsuranceSchemeDialog,
  insuranceSchemeStats,
  insuranceSchemeRiskSummary,
  insuranceSchemeRiskItems,
  insuranceSchemeCityFilter,
  setInsuranceSchemeCityFilter,
  insuranceSchemeStatusFilter,
  setInsuranceSchemeStatusFilter,
  insuranceSchemeCityOptions,
  ALL_VALUE,
  currentEmployeeRecord,
  currentSelectedEmployeeLabel,
  activeLinkedInsuranceSchemes,
  unusedInsuranceSchemes,
  expiredOnlyInsuranceSchemes,
  filteredInsuranceSchemes,
  insuranceSchemeUsageMap,
  structureStatusClass,
  formatCurrency,
  formatPercent,
  openInsuranceSchemeEditDialog,
  openInsuranceAssignDialogWithScheme,
  actionLoading,
  foundationLoading,
}) => {
  const {
    WorkspaceSectionCard,
    WorkspaceMetricStrip,
    WorkspaceDiagnosticSummary,
    WorkspaceTableStateRow,
    DetailRow,
  } = components;

  return (
    <WorkspaceSectionCard
      title="社保方案"
      headerAside={(
        <Button variant="outline" onClick={openInsuranceSchemeDialog}>
          <ShieldCheck size={14} className="mr-2" />
          新建方案
        </Button>
      )}
    >
      <WorkspaceMetricStrip
        items={[
          {
            key: 'schemes-total',
            label: '全量方案',
            value: insuranceSchemeStats.total,
          },
          {
            key: 'schemes-enabled',
            label: '启用中',
            value: insuranceSchemeStats.enabled,
            tone: 'emerald',
          },
          {
            key: 'schemes-disabled',
            label: '禁用中',
            value: insuranceSchemeStats.disabled,
            tone: insuranceSchemeStats.disabled ? 'amber' : 'default',
          },
          {
            key: 'schemes-filtered',
            label: '当前命中',
            value: insuranceSchemeStats.matched,
            hint: insuranceSchemeCityFilter === ALL_VALUE ? undefined : insuranceSchemeCityFilter,
            tone: 'sky',
          },
        ]}
      />

      <WorkspaceDiagnosticSummary
        summary={insuranceSchemeRiskSummary}
        items={insuranceSchemeRiskItems}
        className="mt-4"
      />

      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/40 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          <Select value={insuranceSchemeCityFilter} onValueChange={setInsuranceSchemeCityFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部城市</SelectItem>
              {insuranceSchemeCityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={insuranceSchemeStatusFilter} onValueChange={setInsuranceSchemeStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
              <SelectItem value="1">仅看启用</SelectItem>
              <SelectItem value="0">仅看禁用</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setInsuranceSchemeCityFilter(ALL_VALUE);
              setInsuranceSchemeStatusFilter(ALL_VALUE);
            }}
          >
            清空筛选
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/72">
        <DetailRow
          label="联调对象"
          value={currentEmployeeRecord
            ? currentSelectedEmployeeLabel || '当前员工'
            : '-'}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
        <DetailRow
          label="样本状态"
          value={`ACTIVE ${activeLinkedInsuranceSchemes.length} / 待补 ${unusedInsuranceSchemes.length} / 历史 ${expiredOnlyInsuranceSchemes.length}`}
          valueClassName="max-w-[72%] text-left text-slate-600 dark:text-slate-300"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>方案</TableHead>
              <TableHead>基数范围</TableHead>
              <TableHead>公司比例</TableHead>
              <TableHead>个人比例</TableHead>
              <TableHead>联调命中</TableHead>
              <TableHead>生效 / 状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInsuranceSchemes.map((item) => {
              const companyRate = Number(item.pensionCompanyRate || 0)
                + Number(item.medicalCompanyRate || 0)
                + Number(item.unemploymentCompanyRate || 0)
                + Number(item.injuryCompanyRate || 0)
                + Number(item.maternityCompanyRate || 0)
                + Number(item.housingFundCompanyRate || 0);
              const personalRate = Number(item.pensionPersonalRate || 0)
                + Number(item.medicalPersonalRate || 0)
                + Number(item.unemploymentPersonalRate || 0)
                + Number(item.housingFundPersonalRate || 0);
              const usage = insuranceSchemeUsageMap.get(item.id);
              const rowIssues: Array<{ label: string; severity: 'warning' | 'danger' }> = [];
              if (Number(item.baseMin ?? 0) > Number(item.baseMax ?? 0)) {
                rowIssues.push({ label: '区间异常', severity: 'danger' });
              }
              if (Number(item.status ?? 1) === 0 && usage?.recordCount) {
                rowIssues.push({ label: '禁用仍有台账', severity: 'danger' });
              }
              if (!usage?.recordCount) {
                rowIssues.push({ label: '未命中员工', severity: 'warning' });
              } else if (!usage.activeRecordCount) {
                rowIssues.push({ label: '仅历史台账', severity: 'warning' });
              }
              const quickAssignDisabled = !currentEmployeeRecord || Number(item.status ?? 1) === 0 || actionLoading;
              const rowClassName = rowIssues.length
                ? 'bg-slate-50/70 dark:bg-slate-900/40'
                : '';

              return (
                <TableRow key={item.id} className={rowClassName}>
                  <TableCell>
                    <div className="font-medium text-slate-900">{item.schemeName}</div>
                    <div className="text-xs text-slate-400">{item.city || '-'}</div>
                    {rowIssues.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {rowIssues.map((issue) => (
                          <span
                            key={`${item.id}-${issue.label}`}
                            className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950/72 dark:text-slate-300"
                          >
                            {issue.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{formatCurrency(item.baseMin)} - {formatCurrency(item.baseMax)}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.baseRule || '-'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{formatPercent(companyRate)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{formatPercent(personalRate)}</div>
                  </TableCell>
                  <TableCell>
                    {usage?.recordCount ? (
                      <div>
                        <div className="font-medium text-slate-900">
                          {usage.activeRecordCount
                            ? `${usage.activeRecordCount} 条 ACTIVE 台账 / ${usage.activeEmployeeIds.size} 名员工`
                            : '-'}
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          {[
                            usage.futureRecordCount ? `未来 ${usage.futureRecordCount}` : '',
                            usage.expiredRecordCount ? `历史 ${usage.expiredRecordCount}` : '',
                          ].filter(Boolean).join(' / ') || '-'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{toDateInputValue(item.effectiveDate) || '-'}</div>
                    <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${structureStatusClass(item.status)}`}>
                      {item.status === 1 ? '启用' : '禁用'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openInsuranceSchemeEditDialog(item)}>
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={quickAssignDisabled}
                        onClick={() => openInsuranceAssignDialogWithScheme(item)}
                      >
                        分配
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filteredInsuranceSchemes.length && !foundationLoading && (
              <WorkspaceTableStateRow colSpan={7} title="无社保方案" />
            )}
          </TableBody>
        </Table>
      </div>
    </WorkspaceSectionCard>
  );
};
