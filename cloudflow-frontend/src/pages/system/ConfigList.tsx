import React, { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Lock,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Waypoints,
} from 'lucide-react';
import { toast } from 'sonner';
import { addConfig, deleteConfig, getConfigList, updateConfig, type SysConfig } from '../../services/api/system';
import { clearConfigCache } from '../../hooks/useSystemConfig';
import {
  Button,
  Card,
  Input,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import { WorkspaceBackdrop, WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspacePaginationBar,
  WorkspaceResultCard,
  WorkspaceWorkbenchCard,
} from '@/components/workspace/WorkspacePanels';

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

export const ConfigList = () => {
  const [configs, setConfigs] = useState<SysConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SysConfig | null>(null);
  const [formData, setFormData] = useState<SysConfig>({
    configName: '',
    configKey: '',
    configValue: '',
    configType: 'N',
    configScope: '1',
    remark: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);

  const totalPages = Math.ceil(total / pageSize) || 1;

  React.useEffect(() => {
    void fetchConfigs();
  }, [currentPage]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response: any = await getConfigList({
        configName: searchTerm || undefined,
        pageNum: currentPage,
        pageSize,
      });

      if (response?.records) {
        setConfigs(response.records);
        setTotal(response.total || 0);
      } else if (response?.rows) {
        setConfigs(response.rows);
        setTotal(response.total || 0);
      } else if (Array.isArray(response)) {
        setConfigs(response);
        setTotal(response.length);
      } else {
        setConfigs([]);
        setTotal(0);
      }
    } catch (error) {
      console.error(error);
      toast.error('加载参数配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setCurrentPage(1);
    await fetchConfigs();
  };

  const handleOpenModal = (config?: SysConfig) => {
    if (config) {
      setEditingConfig(config);
      setFormData({ ...config });
    } else {
      setEditingConfig(null);
      setFormData({
        configName: '',
        configKey: '',
        configValue: '',
        configType: 'N',
        configScope: '1',
        remark: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.configName.trim()) {
      toast.error('请输入参数名称');
      return;
    }
    if (!formData.configKey.trim()) {
      toast.error('请输入参数键名');
      return;
    }
    if (!formData.configValue.trim()) {
      toast.error('请输入参数键值');
      return;
    }

    try {
      if (editingConfig) {
        await updateConfig({ ...formData, configId: editingConfig.configId });
        toast.success('参数更新成功');
      } else {
        await addConfig(formData);
        toast.success('参数创建成功');
      }
      clearConfigCache();
      setIsModalOpen(false);
      await fetchConfigs();
    } catch (error) {
      console.error(error);
      toast.error('保存参数失败');
    }
  };

  const handleDelete = async (config: SysConfig) => {
    if (config.configType === 'Y') {
      toast.error('系统内置参数不允许删除');
      return;
    }
    if (!window.confirm('确认删除该参数配置吗？')) {
      return;
    }

    try {
      await deleteConfig([config.configId!]);
      clearConfigCache();
      toast.success('参数删除成功');
      await fetchConfigs();
    } catch (error) {
      console.error(error);
      toast.error('删除参数失败');
    }
  };

  const builtInCount = useMemo(() => configs.filter((config) => config.configType === 'Y').length, [configs]);
  const tenantScopedCount = useMemo(() => configs.filter((config) => config.configScope === '1').length, [configs]);
  const globalCount = configs.length - tenantScopedCount;
  const hasActiveFilters = Boolean(searchTerm.trim());
  const isEdit = Boolean(editingConfig);
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const overviewItems = [
    { label: '当前结果', value: `${configs.length} 条` },
    { label: '内置参数', value: `${builtInCount} 条` },
    { label: '全局作用域', value: `${globalCount} 条` },
    { label: '租户作用域', value: `${tenantScopedCount} 条` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <div className="relative z-10 space-y-3">
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <Settings2 size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">{timeLabel}</span>
            </div>
          )}
          title="参数配置"
          description="参数页需要同时承载搜索、分页、作用域和内置状态，所以这次重点统一它的信息节奏和编辑入口。"
          actions={(
            <Button onClick={() => handleOpenModal()}>
              <Plus size={15} />
              新增参数
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="参数总数"
              value={total}
              hint="按分页接口返回的总记录数"
              aside={<Settings2 size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前页结果"
              value={configs.length}
              hint="当前分页下实际加载数量"
              aside={<Waypoints size={18} className="text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="内置参数"
              value={builtInCount}
              hint="内置参数不可直接删除"
              aside={<Lock size={18} className="text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="租户范围"
              value={tenantScopedCount}
              hint="仅在租户作用域内生效"
              aside={<ShieldCheck size={18} className="text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className="rounded-[28px] border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(248,250,252,0.72))] p-3.5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="参数列表"
              total={total}
              hasActiveFilters={hasActiveFilters}
              overviewItems={overviewItems}
              quickFilterAside={hasActiveFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                    void fetchConfigs();
                  }}
                >
                  清空筛选
                </Button>
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前显示分页默认视图
                </span>
              )}
              filterBar={(
                <form onSubmit={handleSearch} className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input
                      type="text"
                      placeholder="按参数名称搜索"
                      className="pl-10"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <Button type="submit">
                    <Search size={15} />
                    搜索参数
                  </Button>
                </form>
              )}
            />

            <WorkspaceResultCard
              total={total}
              description="分页、作用域、内置状态和键值展示全部统一到同一套工作台样式中。"
              footer={(
                <WorkspacePaginationBar
                  total={total}
                  pageNum={currentPage}
                  totalPages={totalPages}
                  onPrev={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  prevDisabled={currentPage <= 1}
                  nextDisabled={currentPage >= totalPages}
                />
              )}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1160px]">
                  <TableHeader>
                    <tr>
                      <TableHead>ID</TableHead>
                      <TableHead>参数名称</TableHead>
                      <TableHead>参数键名</TableHead>
                      <TableHead>参数键值</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>作用域</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableActionHead className="w-48">操作</TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody className="divide-y divide-white/60">
                    {loading ? (
                      <WorkspaceTableStateRow colSpan={8} type="loading" title="正在加载参数配置..." />
                    ) : configs.length === 0 ? (
                      <WorkspaceTableStateRow colSpan={8} title="暂无参数配置" description="可以先创建一条配置，随后逐步收口系统常量。" />
                    ) : (
                      configs.map((config) => (
                        <tr key={config.configId} className="border-b border-white/60 transition-colors hover:bg-white/60">
                          <td className="px-4 py-3 text-sm text-slate-500">{config.configId}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">{config.configName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">{config.configKey}</td>
                          <td className="max-w-xs truncate px-4 py-3 text-sm text-slate-700" title={config.configValue}>
                            {config.configValue}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              config.configType === 'Y'
                                ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                                : 'bg-white/82 text-slate-600 ring-1 ring-slate-200/80'
                            }`}>
                              {config.configType === 'Y' ? '内置' : '自定义'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              config.configScope === '0'
                                ? 'bg-pink-50 text-pink-600 ring-1 ring-pink-100'
                                : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                            }`}>
                              {config.configScope === '0' ? '全局' : '租户'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">{config.createTime || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <TableRowActions
                              align="end"
                              actions={[
                                {
                                  label: '编辑',
                                  icon: <Edit size={14} />,
                                  onClick: () => handleOpenModal(config),
                                  tone: 'primary',
                                },
                                {
                                  label: '内置',
                                  icon: <Lock size={14} />,
                                  disabled: true,
                                  tone: 'neutral',
                                  hidden: config.configType !== 'Y',
                                },
                                {
                                  label: '删除',
                                  icon: <Trash2 size={14} />,
                                  onClick: () => handleDelete(config),
                                  tone: 'danger',
                                  hidden: config.configType === 'Y',
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceResultCard>
          </div>
        </Card>

        {isModalOpen ? (
          <WorkspaceDialogShell
            title={isEdit ? '编辑参数' : '新增参数'}
            description="统一维护参数键名、键值、内置状态和作用域，保存后会自动清空前端配置缓存。"
            onClose={() => setIsModalOpen(false)}
            maxWidthClassName="max-w-4xl"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <section className="rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] p-5 shadow-[0_14px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">基础信息</div>
                  <div className="mt-1 text-sm text-slate-500">参数名称和键名决定了配置的可识别性，建议保持语义清晰、命名统一。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      参数名称 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.configName}
                      onChange={(event) => setFormData({ ...formData, configName: event.target.value })}
                      placeholder="如：用户初始密码"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      参数键名 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      className="font-mono"
                      value={formData.configKey}
                      onChange={(event) => setFormData({ ...formData, configKey: event.target.value })}
                      placeholder="如：sys.user.initPassword"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] p-5 shadow-[0_14px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">配置值与范围</div>
                  <div className="mt-1 text-sm text-slate-500">内置参数通常由系统或运维维护，作用域则决定配置是否只在租户级别生效。</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">系统内置</label>
                    <div className="flex gap-4 rounded-[22px] border border-white/75 bg-white/72 px-4 py-3 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                      {[
                        ['Y', '是'],
                        ['N', '否'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            checked={formData.configType === value}
                            onChange={() => setFormData({ ...formData, configType: value })}
                            className="accent-pink-500"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">作用域</label>
                    <div className="flex gap-4 rounded-[22px] border border-white/75 bg-white/72 px-4 py-3 shadow-[0_10px_20px_rgba(15,23,42,0.04)]">
                      {[
                        ['0', '全局'],
                        ['1', '租户'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            checked={formData.configScope === value}
                            onChange={() => setFormData({ ...formData, configScope: value })}
                            className="accent-pink-500"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      参数键值 <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      className="font-mono"
                      rows={4}
                      value={formData.configValue}
                      onChange={(event) => setFormData({ ...formData, configValue: event.target.value })}
                      placeholder="参数值"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-[26px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.74))] p-5 shadow-[0_14px_28px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">备注</div>
                  <div className="mt-1 text-sm text-slate-500">记录参数适用场景、默认含义或上线注意事项，避免后续维护误用。</div>
                </div>
                <Textarea
                  rows={3}
                  className="resize-none"
                  value={formData.remark || ''}
                  onChange={(event) => setFormData({ ...formData, remark: event.target.value })}
                  placeholder="备注信息"
                />
              </section>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
                  取消
                </Button>
                <Button type="submit">{isEdit ? '保存修改' : '立即创建'}</Button>
              </div>
            </form>
          </WorkspaceDialogShell>
        ) : null}
      </div>
    </div>
  );
};

export default ConfigList;
