import React from 'react';
import { Edit, Eye, FilePlus2, Landmark, Link2, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { cn } from '@/utils/cn';
import { toDateInputValue } from '../hrShared';
import { InnerTableSurface } from '@/components/layout/TablePageLayout';
import { DictLabel } from '@/components/common/DictLabel';

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
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 pb-3 text-xs text-cf-subtle dark:border-slate-800">
        <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-1.5 text-xs text-cf-muted dark:border-slate-800 dark:bg-slate-950">
          <span className="font-medium">已启用项目</span>
          <span className="font-semibold text-cf-title">{enabledSalaryItems.length}</span>
          <span className="text-cf-faint">/ 总数 {salaryItems.length}</span>
        </div>
        <span>命中现薪联动 {linkedSalaryItems.length}</span>
        <span>孤立项目 {orphanSalaryItems.length}</span>
        <span>带公式项目 {formulaSalaryItems.length}</span>
      </div>

      <InnerTableSurface>
        <table className="unity-data-table admin-source-table min-w-[920px]">
          <thead>
            <tr>
              <th className="min-w-[160px]">项目名称</th>
              <th className="min-w-[180px]">编码</th>
              <th className="min-w-[140px]">类型 / 分类</th>
              <th className="min-w-[180px]">联动体检</th>
              <th className="min-w-[120px]">计税 / 联动</th>
              <th className="w-[132px] text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {salaryItems.map((item) => {
              const usage = salaryItemUsageMap.get(item.id);
              return (
                <tr key={item.id}>
                  <td className="min-w-[160px]">
                    <div className="font-medium text-cf-title">{item.itemName}</div>
                    {item.formula && String(item.formula).trim() && (
                      <div className="mt-2">
                        <span className="inline-flex rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2 py-0.5 text-xs font-medium text-cf-muted dark:border-slate-800 dark:bg-slate-950/72">
                          带公式
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="min-w-[180px]">{item.itemCode}</td>
                  <td className="min-w-[140px]">
                    <div className="font-medium text-cf-title">{itemTypeLabel(item.itemType) || '-'}</div>
                    <div className="mt-1 text-xs text-cf-faint">{itemCategoryLabel(item.category) || '-'}</div>
                  </td>
                  <td className="min-w-[180px]">
                    <div className="font-medium text-cf-title">
                      {usage?.structureIds.size || 0} 套结构 / {usage?.activeEmployeeIds.size || 0} 名员工
                    </div>
                    <div className="mt-1 text-xs text-cf-faint">
                      {usage?.structureIds.size
                        ? [
                          usage?.activeArchiveCount ? `ACTIVE ${usage.activeArchiveCount}` : '',
                          usage?.futureArchiveCount ? `未来 ${usage.futureArchiveCount}` : '',
                        ].filter(Boolean).join(' / ') || '-'
                        : '-'}
                    </div>
                  </td>
                  <td className="min-w-[120px]">
                    <div className="font-medium text-cf-title">{item.isTaxable ? '参与计税' : '不参与计税'}</div>
                    <div className="mt-1 text-xs text-cf-faint">
                      {Number(item.status ?? 1) === 0 && usage?.structureIds.size
                        ? '禁用引用'
                        : usage?.structureIds.size
                          ? '已联动'
                          : '-'}
                    </div>
                  </td>
                  <td className="w-[132px]">
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => openItemEditDialog(item)}>
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        data-tooltip="删除" aria-label="删除"
                        disabled={actionLoading}
                        onClick={() => void handleDeleteItem(item)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!salaryItems.length && !foundationLoading && <WorkspaceTableStateRow colSpan={6} title="无薪资项目" />}
          </tbody>
        </table>
      </InnerTableSurface>
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
      <div className="admin-source-content-grid">
        <div className="admin-dialog-subsection">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-cf-title">结构选择</div>
              <div className="mt-1 text-xs text-cf-subtle">先选择薪资结构，再查看关联员工与项目。</div>
            </div>
            <span className="badge badge-gray">共 {salaryStructures.length} 个结构</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {salaryStructures.map((item) => {
              const isActive = String(item.id) === selectedStructureId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'min-w-[220px] rounded-md border px-4 py-3 text-left transition',
                    isActive
                      ? 'border-[#0d95b5]/40 bg-[#effbfe] dark:border-cyan-800 dark:bg-cyan-950/30'
                      : 'border-slate-200 bg-[var(--cf-surface-strong)] hover:border-slate-300 hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-slate-700 dark:hover:bg-slate-900',
                  )}
                  onClick={() => setSelectedStructureId(String(item.id))}
                >
                  <div className="truncate font-semibold text-cf-title">{item.structureName}</div>
                  <div className="mt-1 truncate text-xs text-cf-faint">{item.structureCode}</div>
                  <div className={`mt-3 inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${structureStatusClass(item.status)}`}>
                    {item.statusDesc || (item.status === 1 ? '启用' : '禁用')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0">
          {!structureDetail && !structureDetailLoading && (
            <div className="border border-dashed border-slate-200 bg-[var(--cf-surface-muted)] px-4 py-12 text-center text-sm text-cf-subtle dark:border-slate-800 dark:bg-slate-950/40">
              选择一个薪资结构查看详情。
            </div>
          )}

          {structureDetail && (
            <div className="admin-source-content-grid">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs text-cf-faint">结构名称</div>
                  <div className="mt-2 text-xl font-semibold text-cf-title">{structureDetail.structureName}</div>
                  <div className="mt-1 text-sm text-cf-subtle">{structureDetail.structureCode}</div>
                </div>
                <div className="admin-users-row-actions">
                  <button type="button" data-tooltip="编辑结构" aria-label="编辑结构" onClick={() => void openStructureEditDialog(structureDetail.id)}>
                    <Edit size={15} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    data-tooltip="删除结构" aria-label="删除结构"
                    disabled={actionLoading}
                    onClick={() => void handleDeleteStructure(structureDetail)}
                  >
                    <Trash2 size={15} />
                  </button>
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

              <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
                <DetailRow
                  label="结构说明"
                  value={structureDetail.description || '-'}
                  valueClassName="max-w-[72%] text-left text-cf-muted"
                />
                <DetailRow
                  label="在岗员工"
                  value={structureLinkedEmployeeIds.length ? `${structureLinkedEmployeeIds.length} 名` : '-'}
                  valueClassName="max-w-[72%] text-left text-cf-muted"
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
                      ? 'text-cf-muted'
                      : 'text-cf-muted',
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

              <div className="table-scroll-container admin-inner-table-surface max-h-[360px]">
                <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                  <div className="font-semibold text-cf-title">关联现薪样本</div>
                  <div className="text-xs text-cf-faint">
                    共 {structureLinkedEmployeeRows.length} 条 / {structureLinkedEmployeeIds.length} 名员工
                    {structureLinkedSalaryStats.count ? ` / 最高 ${formatCurrency(structureLinkedSalaryStats.max)}` : ''}
                  </div>
                </div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th className="min-w-[160px]">员工</th>
                        <th className="min-w-[120px]">部门</th>
                        <th className="w-[120px] whitespace-nowrap">总薪资</th>
                        <th className="min-w-[140px]">生效日期</th>
                        <th className="w-[112px] text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {structureLinkedEmployeeRows.map((item) => (
                        <tr key={item.id}>
                          <td className="min-w-[160px]">
                            <div className="font-medium text-cf-title">{item.employeeName || `员工 #${item.employeeId}`}</div>
                            <div className="mt-1 text-xs text-cf-faint">{item.employeeNo || '-'}</div>
                          </td>
                          <td className="min-w-[120px]">{employeeMap.get(item.employeeId)?.deptName || '-'}</td>
                          <td className="whitespace-nowrap">{formatCurrency(item.totalSalary)}</td>
                          <td className="min-w-[140px]">
                            <div className="whitespace-nowrap">{toDateInputValue(item.effectiveDate) || '-'}</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {isFutureDate(item.effectiveDate) ? (
                                <span className="inline-flex rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2 py-0.5 text-xs font-medium text-cf-muted dark:border-slate-800 dark:bg-slate-950/72">
                                  未来生效
                                </span>
                              ) : (
                                <span className="inline-flex rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2 py-0.5 text-xs font-medium text-cf-muted dark:border-slate-800 dark:bg-slate-950/72">
                                  已生效
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="w-[112px]">
                            <div className="flex justify-end">
                              <div className="admin-users-row-actions">
                                <button type="button" data-tooltip="查看现薪" aria-label="查看现薪" onClick={() => focusEmployeeWorkspace(item.employeeId)}>
                                  <Eye size={15} />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!structureLinkedEmployeeRows.length && <WorkspaceTableStateRow colSpan={5} title="无现薪样本" />}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="table-scroll-container admin-inner-table-surface max-h-[320px]">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div className="font-semibold text-cf-title">关联项目</div>
                  <div className="text-xs text-cf-faint">{structureDetail.items?.length || 0} 个</div>
                </div>
                <div className="admin-horizontal-scroll">
                  <table className="unity-data-table admin-source-table min-w-[680px]">
                    <thead>
                      <tr>
                        <th className="min-w-[180px]">项目</th>
                        <th className="min-w-[120px]">分类</th>
                        <th className="min-w-[140px]">类型</th>
                        <th className="w-[96px]">计税</th>
                        <th className="w-[96px]">状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {structureDetail.items?.map((item: any) => (
                        <tr key={item.id}>
                          <td className="min-w-[180px]">
                            <div className="font-medium text-cf-title">{item.itemName}</div>
                            <div className="mt-1 text-xs text-cf-faint">{item.itemCode}</div>
                          </td>
                          <td className="min-w-[120px]">{itemCategoryLabel(item.category) || '-'}</td>
                          <td className="min-w-[140px]">
                            <div>{itemTypeLabel(item.itemType) || '-'}</div>
                            <div className="mt-1 text-xs text-cf-faint">
                              {item.formula && String(item.formula).trim() ? '已配公式' : '手工录入'}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className={cn(
                              'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium',
                              item.isTaxable
                                ? 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted dark:border-slate-800 dark:bg-slate-950/72'
                                : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted dark:border-slate-800 dark:bg-slate-950/72',
                            )}>
                              {item.isTaxable ? '计税' : '不计税'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">
                            <span className={cn(
                              'inline-flex rounded-md border px-2 py-0.5 text-xs font-medium',
                              Number(item.status ?? 1) === 1
                                ? 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted dark:border-slate-800 dark:bg-slate-950/72'
                                : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted dark:border-slate-800 dark:bg-slate-950/72',
                            )}>
                              {Number(item.status ?? 1) === 1 ? '启用' : '禁用'}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!structureDetail.items?.length && <WorkspaceTableStateRow colSpan={5} title="无关联项目" />}
                    </tbody>
                  </table>
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

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-medium text-cf-title">序列覆盖</div>
          </div>
          {pendingGradeLevels.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => openGradeDialog(pendingGradeLevels[0].id)}>
              优先补一条
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-1">
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {gradeSeriesCoverage.length > 0 ? gradeSeriesCoverage.map((item) => (
              <div key={item.series} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-cf-title">{item.series} 序列</div>
                    <div className="mt-1 text-xs text-cf-subtle">
                      {item.configured}/{item.total} 个职级已配薪级
                    </div>
                  </div>
                  <div className={cn('text-sm font-semibold', item.textClassName)}>
                    {item.coverage}%
                  </div>
                </div>
                <div className="mt-2 text-xs leading-5 text-cf-muted">
                  {item.missing
                    ? item.configured === 0
                      ? '未配置'
                      : `待配 ${item.missing} 个`
                    : '已覆盖'}
                </div>
              </div>
            )) : (
              <div className="px-4 py-10 text-center text-sm text-cf-subtle">
                无职级序列
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="text-sm font-medium text-cf-title">待配置职级</div>
            {pendingGradeLevels.length > 0 ? (
              <div className="mt-1 text-xs leading-6 text-cf-subtle">
                {pendingGradeLevels.length} 个
              </div>
            ) : null}
            {pendingGradeLevels.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingGradeLevels.slice(0, 10).map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    className="rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-3 py-1.5 text-xs text-cf-body transition hover:border-slate-300 hover:bg-[var(--cf-surface-muted)] dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700 dark:hover:bg-slate-900"
                    onClick={() => openGradeDialog(level.id)}
                  >
                    {[level.levelCode, level.levelName].filter(Boolean).join(' / ')}
                  </button>
                ))}
                {pendingGradeLevels.length > 10 ? (
                  <div className="rounded-md border border-transparent px-1 py-1.5 text-xs text-cf-subtle">
                    +{pendingGradeLevels.length - 10}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <InnerTableSurface className="mt-4">
        <table className="unity-data-table admin-source-table min-w-[920px]">
          <thead>
            <tr>
              <th>职级</th>
              <th>最低薪资</th>
              <th>中位薪资</th>
              <th>最高薪资</th>
              <th>币种</th>
              <th>异常</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedSalaryGrades.map((item) => {
              const rowIssues = salaryGradeDiagnostics.rowIssueMap.get(item.id) || [];
              const rowClassName = rowIssues.length
                ? 'bg-[var(--cf-surface-muted)] dark:bg-slate-900/40'
                : '';

              return (
                <tr key={item.id} className={rowClassName}>
                  <td>
                    <div className="font-medium text-cf-title">{item.levelName || '-'}</div>
                    <div className="text-xs text-cf-faint">
                      {[item.levelCode, jobLevelMap.get(item.levelId)?.levelSeries ? `${jobLevelMap.get(item.levelId)?.levelSeries} 序列` : ''].filter(Boolean).join(' / ') || '-'}
                    </div>
                  </td>
                  <td>{formatCurrency(item.minSalary)}</td>
                  <td>{formatCurrency(item.midSalary)}</td>
                  <td>{formatCurrency(item.maxSalary)}</td>
                  <td><DictLabel dictType="sys_currency" value={String(item.currency ?? '')} fallback="-" /></td>
                  <td>
                    {rowIssues.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {rowIssues.map((issue: any) => (
                          <span
                            key={issue.key}
                            className="inline-flex rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2.5 py-1 text-xs font-medium text-cf-muted dark:border-slate-800 dark:bg-slate-950/72"
                          >
                            {issue.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-cf-faint">-</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => openGradeEditDialog(item)}>
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        className="danger"
                        data-tooltip="删除" aria-label="删除"
                        disabled={actionLoading}
                        onClick={() => void handleDeleteGrade(item)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sortedSalaryGrades.length && !foundationLoading && (
              <WorkspaceTableStateRow colSpan={7} title="无薪级数据" />
            )}
          </tbody>
        </table>
      </InnerTableSurface>
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

      <div className="mt-4 flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
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

      <div className="mt-4 overflow-hidden border border-slate-200 dark:border-slate-800">
        <DetailRow
          label="联调对象"
          value={currentEmployeeRecord
            ? currentSelectedEmployeeLabel || '当前员工'
            : '-'}
          valueClassName="max-w-[72%] text-left text-cf-muted"
        />
        <DetailRow
          label="样本状态"
          value={`ACTIVE ${activeLinkedInsuranceSchemes.length} / 待补 ${unusedInsuranceSchemes.length} / 历史 ${expiredOnlyInsuranceSchemes.length}`}
          valueClassName="max-w-[72%] text-left text-cf-muted"
        />
      </div>

      <InnerTableSurface className="mt-4">
        <table className="unity-data-table admin-source-table min-w-[920px]">
          <thead>
            <tr>
              <th>方案</th>
              <th>基数范围</th>
              <th>公司比例</th>
              <th>个人比例</th>
              <th>联调命中</th>
              <th>生效 / 状态</th>
              <th className="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
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
                ? 'bg-[var(--cf-surface-muted)] dark:bg-slate-900/40'
                : '';

              return (
                <tr key={item.id} className={rowClassName}>
                  <td>
                    <div className="font-medium text-cf-title">{item.schemeName}</div>
                    <div className="text-xs text-cf-faint">{item.city || '-'}</div>
                    {rowIssues.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {rowIssues.map((issue) => (
                          <span
                            key={`${item.id}-${issue.label}`}
                            className="inline-flex rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-2 py-0.5 text-xs font-medium text-cf-muted dark:border-slate-800 dark:bg-slate-950/72"
                          >
                            {issue.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <div>{formatCurrency(item.baseMin)} - {formatCurrency(item.baseMax)}</div>
                    <div className="mt-1 text-xs text-cf-faint">{item.baseRule || '-'}</div>
                  </td>
                  <td>
                    <div className="font-medium text-cf-title">{formatPercent(companyRate)}</div>
                  </td>
                  <td>
                    <div className="font-medium text-cf-title">{formatPercent(personalRate)}</div>
                  </td>
                  <td>
                    {usage?.recordCount ? (
                      <div>
                        <div className="font-medium text-cf-title">
                          {usage.activeRecordCount
                            ? `${usage.activeRecordCount} 条 ACTIVE 台账 / ${usage.activeEmployeeIds.size} 名员工`
                            : '-'}
                        </div>
                        <div className="mt-1 text-xs text-cf-faint">
                          {[
                            usage.futureRecordCount ? `未来 ${usage.futureRecordCount}` : '',
                            usage.expiredRecordCount ? `历史 ${usage.expiredRecordCount}` : '',
                          ].filter(Boolean).join(' / ') || '-'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-cf-faint">-</span>
                    )}
                  </td>
                  <td>
                    <div>{toDateInputValue(item.effectiveDate) || '-'}</div>
                    <div className={`mt-2 inline-flex rounded-md border px-2.5 py-1 text-xs font-medium ${structureStatusClass(item.status)}`}>
                      {item.status === 1 ? '启用' : '禁用'}
                    </div>
                  </td>
                  <td>
                    <div className="admin-users-row-actions">
                      <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => openInsuranceSchemeEditDialog(item)}>
                        <Edit size={15} />
                      </button>
                      <button
                        type="button"
                        data-tooltip="分配" aria-label="分配"
                        disabled={quickAssignDisabled}
                        onClick={() => openInsuranceAssignDialogWithScheme(item)}
                      >
                        <Link2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredInsuranceSchemes.length && !foundationLoading && (
              <WorkspaceTableStateRow colSpan={7} title="无社保方案" />
            )}
          </tbody>
        </table>
      </InnerTableSurface>
    </WorkspaceSectionCard>
  );
};
