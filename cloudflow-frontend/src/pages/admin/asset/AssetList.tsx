import React, { useEffect, useState } from 'react';
import {
  Ban,
  Edit,
  History,
  Package,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  borrowAsset,
  deleteAsset,
  getAssetCategories,
  getAssetList,
  getAssetLogs,
  getAssetQrCodeUrl,
  getAssetStatistics,
  repairAsset,
  returnAsset,
  scrapAsset,
  Asset,
  AssetLog,
  AssetQueryParams,
  AssetStatistics,
} from '@/services/api/admin';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { TableRowActions } from '@/components/ui/table-row-actions';
import AssetForm from './AssetForm';

interface InlineStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}

interface TableStateRowProps {
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}

interface AssetActionTarget {
  assetId: number;
  name: string;
}

interface ConfirmState {
  type: 'delete' | 'return';
  asset: AssetActionTarget;
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

const ALL_FILTER_VALUE = '__all__';

const STATUS_META: Record<string, { label: string; className: string }> = {
  '1': {
    label: '闲置',
    className: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
  },
  '2': {
    label: '在用',
    className: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
  },
  '3': {
    label: '维修',
    className: 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
  },
  '4': {
    label: '报废',
    className: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
  },
};

const InlineState: React.FC<InlineStateProps> = ({
  title,
  description,
  icon,
  className,
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Package className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow: React.FC<TableStateRowProps> = ({
  colSpan,
  title,
  description,
  icon,
  loading = false,
}) => (
  <TableRow className="hover:bg-transparent">
    <TableCell colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <RotateCcw className="h-4 w-4 animate-spin" /> : icon || <Package className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
        ) : null}
      </div>
    </TableCell>
  </TableRow>
);

const formatAmount = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '-';
  }

  return `¥${Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const AssetList: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useState<AssetQueryParams>({
    pageNum: 1,
    pageSize: 10,
    name: '',
    assetCode: '',
    category: '',
    status: '',
  });
  const [searchNameInput, setSearchNameInput] = useState('');
  const [searchCodeInput, setSearchCodeInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [stats, setStats] = useState<AssetStatistics | null>(null);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [logAsset, setLogAsset] = useState<Asset | null>(null);
  const [assetLogs, setAssetLogs] = useState<AssetLog[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [showBorrowDialog, setShowBorrowDialog] = useState(false);
  const [borrowTarget, setBorrowTarget] = useState<AssetActionTarget | null>(null);
  const [borrowUserId, setBorrowUserId] = useState('');
  const [showRemarkDialog, setShowRemarkDialog] = useState(false);
  const [remarkAction, setRemarkAction] = useState<'repair' | 'scrap'>('repair');
  const [remarkText, setRemarkText] = useState('');
  const [remarkAsset, setRemarkAsset] = useState<AssetActionTarget | null>(null);

  useEffect(() => {
    void loadData();
  }, [searchParams]);

  useEffect(() => {
    void loadStats();
    void loadCategories();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getAssetList(searchParams) as {
        records?: Asset[];
        total?: number;
      } | Asset[];

      if (Array.isArray(data)) {
        setAssets(data);
        setTotal(data.length);
      } else {
        setAssets(data.records || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '加载资产列表失败'));
      setAssets([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await getAssetStatistics() as AssetStatistics;
      setStats(result);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载资产统计失败'));
      setStats(null);
    }
  };

  const loadCategories = async () => {
    try {
      const result = await getAssetCategories() as string[];
      setCategories(result || []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载资产分类失败'));
      setCategories([]);
    }
  };

  const refreshPage = async () => {
    await Promise.all([loadData(), loadStats(), loadCategories()]);
  };

  const handleSearch = () => {
    setSearchParams({
      pageNum: 1,
      pageSize: 10,
      name: searchNameInput.trim(),
      assetCode: searchCodeInput.trim(),
      category: categoryInput,
      status: statusInput,
    });
  };

  const handleReset = () => {
    setSearchNameInput('');
    setSearchCodeInput('');
    setCategoryInput('');
    setStatusInput('');
    setSearchParams({
      pageNum: 1,
      pageSize: 10,
      name: '',
      assetCode: '',
      category: '',
      status: '',
    });
  };

  const handleFormSuccess = () => {
    setShowFormDialog(false);
    setEditingAsset(null);
    void refreshPage();
  };

  const handleAdd = () => {
    setEditingAsset(null);
    setShowFormDialog(true);
  };

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setShowFormDialog(true);
  };

  const openDeleteConfirm = (asset: Asset) => {
    if (!asset.assetId) {
      return;
    }
    setConfirmState({
      type: 'delete',
      asset: { assetId: asset.assetId, name: asset.name },
      title: '删除资产',
      message: `确定删除“${asset.name}”吗？`,
      confirmText: '删除',
      danger: true,
    });
  };

  const openReturnConfirm = (asset: Asset) => {
    if (!asset.assetId) {
      return;
    }
    setConfirmState({
      type: 'return',
      asset: { assetId: asset.assetId, name: asset.name },
      title: '归还资产',
      message: `确定归还“${asset.name}”吗？`,
      confirmText: '归还',
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmState) {
      return;
    }

    const currentState = confirmState;
    setConfirmState(null);

    try {
      if (currentState.type === 'delete') {
        await deleteAsset(currentState.asset.assetId);
        toast.success('删除成功');
      } else {
        await returnAsset(currentState.asset.assetId);
        toast.success('归还成功');
      }
      await refreshPage();
    } catch (error) {
      toast.error(getErrorMessage(error, currentState.type === 'delete' ? '删除失败' : '归还失败'));
    }
  };

  const openBorrowDialog = (asset: Asset) => {
    if (!asset.assetId) {
      return;
    }
    setBorrowTarget({ assetId: asset.assetId, name: asset.name });
    setBorrowUserId('');
    setShowBorrowDialog(true);
  };

  const handleBorrow = async () => {
    if (!borrowTarget) {
      return;
    }
    const parsedUserId = Number.parseInt(borrowUserId.trim(), 10);
    if (!Number.isFinite(parsedUserId) || parsedUserId <= 0) {
      toast.error('请输入有效的领用人 ID');
      return;
    }

    try {
      await borrowAsset(borrowTarget.assetId, parsedUserId);
      toast.success('领用成功');
      setShowBorrowDialog(false);
      setBorrowTarget(null);
      setBorrowUserId('');
      await refreshPage();
    } catch (error) {
      toast.error(getErrorMessage(error, '领用失败'));
    }
  };

  const openRemarkDialog = (action: 'repair' | 'scrap', asset: Asset) => {
    if (!asset.assetId) {
      return;
    }
    setRemarkAction(action);
    setRemarkAsset({ assetId: asset.assetId, name: asset.name });
    setRemarkText('');
    setShowRemarkDialog(true);
  };

  const handleRemarkConfirm = async () => {
    if (!remarkAsset) {
      return;
    }

    try {
      if (remarkAction === 'repair') {
        await repairAsset(remarkAsset.assetId, remarkText.trim());
        toast.success('送修成功');
      } else {
        await scrapAsset(remarkAsset.assetId, remarkText.trim());
        toast.success('报废成功');
      }
      setShowRemarkDialog(false);
      setRemarkAsset(null);
      setRemarkText('');
      await refreshPage();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleShowLogs = async (asset: Asset) => {
    if (!asset.assetId) {
      return;
    }
    setLogAsset(asset);
    setLogLoading(true);
    setAssetLogs([]);

    try {
      const result = await getAssetLogs(asset.assetId) as AssetLog[];
      setAssetLogs(result || []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载资产日志失败'));
    } finally {
      setLogLoading(false);
    }
  };

  const handlePrint = () => {
    if (!qrAsset?.assetId) {
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }

    printWindow.document.write(`
      <html>
        <head><title>打印资产标签</title></head>
        <body style="text-align:center;font-family:system-ui;padding:24px;">
          <h2>${qrAsset.name}</h2>
          <img src="${getAssetQrCodeUrl(qrAsset.assetId)}" width="200" />
          <p>${qrAsset.assetCode || ''}</p>
          <script>window.onload=function(){window.print();}<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusBadge = (status?: string) => {
    const meta = STATUS_META[status || '1'];
    return (
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
        {meta.label}
      </span>
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / (searchParams.pageSize || 10)));
  const hasActiveFilters = Boolean(
    searchParams.name || searchParams.assetCode || searchParams.category || searchParams.status,
  );
  const currentStatusLabel = searchParams.status
    ? STATUS_META[searchParams.status]?.label || searchParams.status
    : '全部状态';
  const currentCategoryLabel = searchParams.category || '全部分类';
  const currentNameLabel = searchParams.name || '全部名称';
  const currentCodeLabel = searchParams.assetCode || '全部编码';

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Package className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Fixed Assets
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          固定资产管理
        </h1>
      </div>

      <TablePageLayout
        className="gap-4"
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-slate-900 dark:text-slate-100">共 {stats?.total ?? total} 条</span>
              <span className="text-slate-500 dark:text-slate-400">闲置 {stats?.statusCount.idle ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">在用 {stats?.statusCount.inUse ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">维修 {stats?.statusCount.repair ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">报废 {stats?.statusCount.scrapped ?? 0}</span>
              <span className="text-slate-500 dark:text-slate-400">总价值 {formatAmount(stats?.totalValue ?? 0)}</span>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void refreshPage()} disabled={loading}>
                <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Plus size={14} className="mr-1.5" />
                新增资产
              </Button>
            </div>
          </div>
        )}
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={searchNameInput}
                  onChange={(event) => setSearchNameInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  placeholder="按资产名称搜索"
                  className="h-10 pl-10"
                />
              </div>

              <Input
                value={searchCodeInput}
                onChange={(event) => setSearchCodeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSearch();
                  }
                }}
                placeholder="按资产编码搜索"
                className="h-10"
              />

              <Select value={categoryInput || ALL_FILTER_VALUE} onValueChange={(value) => setCategoryInput(value === ALL_FILTER_VALUE ? '' : value)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="全部分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>全部分类</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusInput || ALL_FILTER_VALUE} onValueChange={(value) => setStatusInput(value === ALL_FILTER_VALUE ? '' : value)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>全部状态</SelectItem>
                  <SelectItem value="1">闲置</SelectItem>
                  <SelectItem value="2">在用</SelectItem>
                  <SelectItem value="3">维修</SelectItem>
                  <SelectItem value="4">报废</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {hasActiveFilters ? `${currentStatusLabel} / ${currentCategoryLabel} / ${currentNameLabel} / ${currentCodeLabel}` : '全部资产'}
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:justify-start">
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <Search size={14} className="mr-1.5" />
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw size={14} className="mr-1.5" />
                清空筛选
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">资产列表</div>
                  {hasActiveFilters ? (
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {currentStatusLabel} / {currentCategoryLabel}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  共 {total} 条
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className="min-w-[1040px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">资产编码</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">资产信息</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">价格 / 位置</TableHead>
                    <TableActionHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">当前操作</TableActionHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={5} title="正在加载资产数据..." loading />
                  ) : assets.length === 0 ? (
                    <TableStateRow
                      colSpan={5}
                      title="暂无资产数据"
                    />
                  ) : (
                    assets.map((asset) => (
                      <TableRow key={asset.assetId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <TableCell className="px-4 py-3 font-mono text-sm text-slate-500 dark:text-slate-400">
                          <div>{asset.assetCode || '-'}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {asset.purchaseDate || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{asset.name}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {[asset.category || '-', asset.model || '-'].join(' / ')}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3">
                          {getStatusBadge(asset.status)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{formatAmount(asset.price)}</div>
                          <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            {asset.location || '-'}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <TableRowActions
                            align="end"
                            wrap
                            className="gap-1"
                            iconOnly
                            actions={[
                              {
                                label: '编辑',
                                icon: <Edit size={14} />,
                                onClick: () => handleEdit(asset),
                                tone: 'primary',
                                className: 'rounded-lg',
                              },
                              {
                                label: '标签',
                                icon: <QrCode size={14} />,
                                onClick: () => setQrAsset(asset),
                                tone: 'neutral',
                                className: 'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950',
                              },
                              {
                                label: '领用',
                                icon: <UserCheck size={14} />,
                                onClick: () => openBorrowDialog(asset),
                                tone: 'info',
                                hidden: asset.status !== '1',
                                className: 'rounded-lg',
                              },
                              {
                                label: '归还',
                                icon: <RotateCcw size={14} />,
                                onClick: () => openReturnConfirm(asset),
                                tone: 'success',
                                hidden: asset.status !== '2',
                                className: 'rounded-lg',
                              },
                              {
                                label: '送修',
                                icon: <Wrench size={14} />,
                                onClick: () => openRemarkDialog('repair', asset),
                                tone: 'warning',
                                hidden: asset.status === '3' || asset.status === '4',
                                className: 'rounded-lg',
                              },
                              {
                                label: '报废',
                                icon: <Ban size={14} />,
                                onClick: () => openRemarkDialog('scrap', asset),
                                tone: 'danger',
                                hidden: asset.status === '4',
                                className: 'rounded-lg',
                              },
                              {
                                label: '删除',
                                icon: <Trash2 size={14} />,
                                onClick: () => openDeleteConfirm(asset),
                                tone: 'danger',
                                hidden: asset.status === '2',
                                className: 'rounded-lg',
                              },
                              {
                                label: '日志',
                                icon: <History size={14} />,
                                onClick: () => void handleShowLogs(asset),
                                tone: 'neutral',
                                className: 'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950',
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum || 1}
              pageSize={searchParams.pageSize || 10}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={(pageSize) => setSearchParams((prev) => ({ ...prev, pageSize, pageNum: 1 }))}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={showFormDialog}
        title={editingAsset ? '编辑资产' : '新增资产'}
        onClose={() => {
          setShowFormDialog(false);
          setEditingAsset(null);
        }}
        maxWidthClassName="max-w-3xl"
      >
        <AssetForm initialData={editingAsset} onSuccess={handleFormSuccess} />
      </BaseDialog>

      <BaseDialog
        open={Boolean(qrAsset)}
        title="资产标签"
        onClose={() => setQrAsset(null)}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <Button variant="outline" onClick={() => setQrAsset(null)}>
              关闭
            </Button>
            <Button onClick={handlePrint}>
              <Printer size={14} className="mr-1.5" />
              打印标签
            </Button>
          </>
        )}
      >
        {qrAsset?.assetId ? (
          <div className="flex flex-col items-center justify-center gap-4 py-2">
            <img
              src={getAssetQrCodeUrl(qrAsset.assetId)}
              alt="资产二维码"
              className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-3"
            />
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {qrAsset.assetCode || '-'}
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={Boolean(logAsset)}
        title="资产变动记录"
        onClose={() => {
          setLogAsset(null);
          setAssetLogs([]);
        }}
        maxWidthClassName="max-w-2xl"
        bodyClassName="max-h-[60vh] overflow-y-auto"
      >
        {logLoading ? (
          <InlineState title="正在加载资产日志..." className="py-12" icon={<History className="h-4 w-4 animate-pulse" />} />
        ) : assetLogs.length === 0 ? (
          <InlineState title="暂无变动记录" className="py-8" icon={<History className="h-4 w-4" />} />
        ) : (
          <div className="space-y-3">
            {assetLogs.map((log, index) => (
              <div
                key={log.logId || `${log.type || 'log'}-${index}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  <History className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  <span>{log.type || '资产变动'}</span>
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    {log.createTime || '-'}
                  </span>
                </div>
                {log.remark ? (
                  <div className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {log.remark}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </BaseDialog>

      <BaseDialog
        open={showBorrowDialog}
        title="领用资产"
        onClose={() => {
          setShowBorrowDialog(false);
          setBorrowTarget(null);
          setBorrowUserId('');
        }}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowBorrowDialog(false);
                setBorrowTarget(null);
                setBorrowUserId('');
              }}
            >
              取消
            </Button>
            <Button onClick={() => void handleBorrow()}>
              确认领用
            </Button>
          </>
        )}
      >
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">领用人 ID</Label>
          <Input
            value={borrowUserId}
            onChange={(event) => setBorrowUserId(event.target.value)}
            placeholder="请输入领用人 ID"
            className="h-11"
          />
        </div>
      </BaseDialog>

      <BaseDialog
        open={showRemarkDialog}
        title={remarkAction === 'repair' ? '资产送修' : '资产报废'}
        onClose={() => {
          setShowRemarkDialog(false);
          setRemarkAsset(null);
          setRemarkText('');
        }}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowRemarkDialog(false);
                setRemarkAsset(null);
                setRemarkText('');
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => void handleRemarkConfirm()}
              className={remarkAction === 'scrap' ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500' : undefined}
            >
              {remarkAction === 'repair' ? '确认送修' : '确认报废'}
            </Button>
          </>
        )}
      >
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">备注</Label>
          <Textarea
            value={remarkText}
            onChange={(event) => setRemarkText(event.target.value)}
            placeholder={remarkAction === 'repair' ? '填写送修原因' : '填写报废原因'}
            className="min-h-[120px]"
          />
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || '确认操作'}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || '确定'}
        danger={confirmState?.danger}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default AssetList;
