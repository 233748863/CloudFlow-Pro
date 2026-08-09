import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import {
  Ban,
  Edit,
  Eye,
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
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import BusinessTimeline from '@/components/common/BusinessTimeline';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  borrowAsset,
  deleteAsset,
  getAssetCategories,
  getAssetList,
  getAssetLogs,
  getAssetQrCodeBlob,
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
  Textarea,
} from '@/components/common';
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

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
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
    <div className="admin-source-stat-icon mb-3">
      {icon || <Package className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-cf-title">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div>
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
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-10">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="admin-source-stat-icon mb-3">
          {loading ? <RotateCcw className="h-4 w-4 animate-spin" /> : icon || <Package className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-cf-title">{title}</div>
        {description ? (
          <div className="mt-2 text-xs leading-6 text-cf-subtle">{description}</div>
        ) : null}
      </div>
    </td>
  </tr>
);

const DialogPanel: React.FC<{
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}> = ({ title, description, actions, children, className, bodyClassName }) => (
  <section className={['table-scroll-container admin-inner-table-surface', className].filter(Boolean).join(' ')}>
    {title || description || actions ? (
      <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          {title ? <strong>{title}</strong> : null}
          {description ? <span>{description}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    ) : null}
    <div className={['p-4', bodyClassName].filter(Boolean).join(' ')}>{children}</div>
  </section>
);

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div className="admin-asset-detail-item">
    <div className="text-[11px] font-medium text-cf-faint">{label}</div>
    <div className="mt-1.5 text-sm leading-6 text-cf-title">{value || '-'}</div>
  </div>
);

const DetailSection: React.FC<{
  title: string;
  children: React.ReactNode;
  description?: string;
  bodyClassName?: string;
}> = ({ title, children, description, bodyClassName }) => (
  <DialogPanel title={title} description={description} bodyClassName={bodyClassName}>
    {children}
  </DialogPanel>
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

const escapeHtml = (value?: string | number | null) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char] || char));

const AssetList: React.FC = () => {
  const { hasPermission } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useState<AssetQueryParams>({
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
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
  const [assetFormSubmitting, setAssetFormSubmitting] = useState(false);
  const [detailAsset, setDetailAsset] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [qrCodeError, setQrCodeError] = useState('');
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

  useEffect(() => {
    if (!qrAsset?.assetId) {
      setQrCodeUrl('');
      setQrCodeError('');
      setQrCodeLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl = '';

    const loadQrCode = async () => {
      setQrCodeUrl('');
      setQrCodeError('');
      setQrCodeLoading(true);

      try {
        const blob = await getAssetQrCodeBlob(qrAsset.assetId);
        const contentType = blob.type.toLowerCase();

        if (blob.size === 0) {
          throw new Error('二维码图片为空');
        }
        if (contentType && !contentType.startsWith('image/')) {
          throw new Error('二维码接口未返回图片');
        }

        if (cancelled) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setQrCodeUrl(objectUrl);
      } catch (error) {
        if (!cancelled) {
          setQrCodeError(getErrorMessage(error, '二维码加载失败'));
        }
      } finally {
        if (!cancelled) {
          setQrCodeLoading(false);
        }
      }
    };

    void loadQrCode();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [qrAsset?.assetId]);

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
      pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
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
      pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
      name: '',
      assetCode: '',
      category: '',
      status: '',
    });
  };

  const handleFormSuccess = () => {
    setShowFormDialog(false);
    setEditingAsset(null);
    setAssetFormSubmitting(false);
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

  const handleShowDetail = (asset: Asset) => {
    setDetailAsset(asset);
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
      setDetailAsset(null);
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
      setDetailAsset(null);
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
      setDetailAsset(null);
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
    if (!qrCodeUrl) {
      toast.error(qrCodeError || '二维码尚未加载完成');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      return;
    }
    const escapedName = escapeHtml(qrAsset.name);
    const escapedCode = escapeHtml(qrAsset.assetCode || '');
    const escapedQrCodeUrl = escapeHtml(qrCodeUrl);

    printWindow.document.write(`
      <html>
        <head><title>打印资产标签</title></head>
        <body style="text-align:center;font-family:system-ui;padding:24px;">
          <h2>${escapedName}</h2>
          <img src="${escapedQrCodeUrl}" width="200" />
          <p>${escapedCode}</p>
          <script>window.onload=function(){window.print();}<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusBadge = (status?: string) => {
    const meta = STATUS_META[status || '1'];
    return (
      <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${meta.className}`}>
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
  const metrics = [
    { label: '资产总数', value: String(stats?.total ?? total), meta: `当前页 ${assets.length}`, icon: <Package size={18} />, tone: 'blue' },
    { label: '闲置', value: String(stats?.statusCount?.idle ?? assets.filter((item) => item.status === '1').length), meta: '可领用', icon: <UserCheck size={18} />, tone: 'green' },
    { label: '在用', value: String(stats?.statusCount?.inUse ?? assets.filter((item) => item.status === '2').length), meta: '待归还', icon: <History size={18} />, tone: 'violet' },
    { label: '总价值', value: formatAmount(stats?.totalValue ?? 0), meta: '资产账面', icon: <QrCode size={18} />, tone: 'amber' },
  ];
  const renderDetailValue = (value?: string | number | null) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    return String(value);
  };

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">ASSET LEDGER</p>
            <h2>资产管理</h2>
            <span>维护资产编码、分类、状态、位置、领用归还和标签日志</span>
          </div>
          <div className="admin-source-controls">
              <Button variant="outline" size="sm" onClick={() => void refreshPage()} disabled={loading}>
                <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
                刷新
              </Button>
              <Button size="sm" onClick={handleAdd} disabled={!hasPermission('oa:asset:add')}>
                <Plus size={16} />
                新增资产
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
  );

  const pageFilters = (
        <section className="card admin-users-toolbar">
          <div className="admin-oa-filter-grid">
            <label>
              <span className="input-label">资产名称</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  value={searchNameInput}
                  onChange={(event) => setSearchNameInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                  placeholder="按资产名称搜索"
                  className="h-[42px]"
                />
              </div>
            </label>

            <label>
              <span className="input-label">资产编码</span>
              <Input
                value={searchCodeInput}
                onChange={(event) => setSearchCodeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSearch();
                  }
                }}
                placeholder="按资产编码搜索"
                className="h-[42px]"
              />
            </label>

            <label>
              <span className="input-label">分类</span>
              <Select value={categoryInput || ALL_FILTER_VALUE} onValueChange={(value) => setCategoryInput(value === ALL_FILTER_VALUE ? '' : value)}>
                <SelectTrigger className="h-[42px]">
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
            </label>

            <label>
              <span className="input-label">状态</span>
              <Select value={statusInput || ALL_FILTER_VALUE} onValueChange={(value) => setStatusInput(value === ALL_FILTER_VALUE ? '' : value)}>
                <SelectTrigger className="h-[42px]">
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
            </label>

            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">{hasActiveFilters ? `${currentStatusLabel} / ${currentCategoryLabel} / ${currentNameLabel} / ${currentCodeLabel}` : '全部资产'}</span>
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <Search size={14} />
                应用
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasActiveFilters}>
                <RotateCcw size={14} />
                重置
              </Button>
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface>
              <table className="unity-data-table admin-source-table min-w-[980px]">
                <thead>
                  <tr>
                    <th>资产编码</th>
                    <th>资产信息</th>
                    <th>状态</th>
                    <th>价格 / 位置</th>
                    <th className="text-right">当前操作</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <TableStateRow colSpan={5} title="正在加载资产数据..." loading />
                  ) : assets.length === 0 ? (
                    <TableStateRow
                      colSpan={5}
                      title="暂无资产数据"
                    />
                  ) : (
                    assets.map((asset) => (
                      <tr key={asset.assetId}>
                        <td>
                          <div>{asset.assetCode || '-'}</div>
 <div className="mt-1 text-xs text-cf-faint">
                            {asset.purchaseDate || '-'}
                          </div>
                        </td>
                        <td>
 <div className="font-medium text-cf-title">{asset.name}</div>
 <div className="mt-1 text-xs text-cf-faint">
                            {[asset.category || '-', asset.model || '-'].join(' / ')}
                          </div>
                        </td>
                        <td>
                          {getStatusBadge(asset.status)}
                        </td>
                        <td>
 <div className="font-medium text-cf-title">{formatAmount(asset.price)}</div>
 <div className="mt-1 text-xs text-cf-faint">
                            {asset.location || '-'}
                          </div>
                        </td>
                        <td>
                          <div className="admin-users-row-actions">
                            <button type="button" data-tooltip="详情" aria-label="详情" onClick={() => handleShowDetail(asset)}><Eye size={15} /></button>
                            {hasPermission('oa:asset:edit') ? <button type="button" data-tooltip="编辑" aria-label="编辑" onClick={() => handleEdit(asset)}><Edit size={15} /></button> : null}
                            {asset.status === '1' && hasPermission('oa:asset:borrow') ? <button type="button" data-tooltip="领用" aria-label="领用" onClick={() => openBorrowDialog(asset)}><UserCheck size={15} /></button> : null}
                            {asset.status === '2' && hasPermission('oa:asset:return') ? <button type="button" data-tooltip="归还" aria-label="归还" onClick={() => openReturnConfirm(asset)}><RotateCcw size={15} /></button> : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
        </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum || 1}
              pageSize={searchParams.pageSize || 10}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={(pageSize) => setSearchParams((prev) => ({ ...prev, pageSize, pageNum: 1 }))}
            />
  ) : null;

  return (
    <>
      <section className="admin-source-page asset-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showFormDialog}
        title={editingAsset ? '编辑资产' : '新增资产'}
        onClose={() => {
          setShowFormDialog(false);
          setEditingAsset(null);
          setAssetFormSubmitting(false);
        }}
        maxWidthClassName="max-w-2xl"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowFormDialog(false);
                setEditingAsset(null);
                setAssetFormSubmitting(false);
              }}
            >
              取消
            </Button>
            <Button
              type="submit"
              form="asset-form"
              disabled={assetFormSubmitting}
            >
              {assetFormSubmitting ? '提交中...' : editingAsset ? '保存修改' : '确认新增'}
            </Button>
          </>
        )}
      >
        <AssetForm
          formId="asset-form"
          initialData={editingAsset}
          onSuccess={handleFormSuccess}
          onSubmittingChange={setAssetFormSubmitting}
        />
      </BaseDialog>

      <BaseDialog
        open={Boolean(detailAsset)}
        title={detailAsset?.name || '资产详情'}
        onClose={() => setDetailAsset(null)}
        maxWidthClassName="max-w-xl"
        headerAside={detailAsset ? getStatusBadge(detailAsset.status) : null}
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => setDetailAsset(null)}>
              关闭
            </Button>
            {detailAsset ? (
              <Button
                variant="outline"
                onClick={() => {
                  setDetailAsset(null);
                  handleEdit(detailAsset);
                }}
              >
                编辑
              </Button>
            ) : null}
            {detailAsset?.status === '1' ? (
              <Button
                onClick={() => {
                  setDetailAsset(null);
                  openBorrowDialog(detailAsset);
                }}
              >
                领用
              </Button>
            ) : null}
            {detailAsset?.status === '2' ? (
              <Button
                onClick={() => {
                  setDetailAsset(null);
                  openReturnConfirm(detailAsset);
                }}
              >
                归还
              </Button>
            ) : null}
          </>
        )}
      >
        {detailAsset ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQrAsset(detailAsset)}
              >
                <QrCode size={14} className="mr-1.5" />
                标签
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleShowLogs(detailAsset)}
              >
                <History size={14} className="mr-1.5" />
                日志
              </Button>
              {detailAsset.status !== '3' && detailAsset.status !== '4' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDetailAsset(null);
                    openRemarkDialog('repair', detailAsset);
                  }}
                >
                  <Wrench size={14} className="mr-1.5" />
                  送修
                </Button>
              ) : null}
              {detailAsset.status !== '4' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDetailAsset(null);
                    openRemarkDialog('scrap', detailAsset);
                  }}
                >
                  <Ban size={14} className="mr-1.5" />
                  报废
                </Button>
              ) : null}
              {detailAsset.status !== '2' ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-200"
                  onClick={() => {
                    setDetailAsset(null);
                    openDeleteConfirm(detailAsset);
                  }}
                >
                  <Trash2 size={14} className="mr-1.5" />
                  删除
                </Button>
              ) : null}
            </div>

            <DetailSection title="基础信息" bodyClassName="admin-asset-detail-grid">
              <DetailField label="资产编码" value={renderDetailValue(detailAsset.assetCode)} />
              <DetailField label="分类" value={renderDetailValue(detailAsset.category)} />
              <DetailField label="规格型号" value={renderDetailValue(detailAsset.model)} />
            </DetailSection>

            <DetailSection title="台账信息" bodyClassName="admin-asset-detail-grid">
              <DetailField label="价格" value={formatAmount(detailAsset.price)} />
              <DetailField label="存放位置" value={renderDetailValue(detailAsset.location)} />
              <DetailField label="购入日期" value={renderDetailValue(detailAsset.purchaseDate)} />
            </DetailSection>

            {detailAsset.remark ? (
              <DetailSection title="备注">
                <div className="admin-dialog-value-note">
                  {detailAsset.remark}
                </div>
              </DetailSection>
            ) : null}

            <BusinessTimeline businessType="ASSET" businessId={detailAsset.assetId} />
          </>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={Boolean(qrAsset)}
        title={qrAsset?.assetCode || '资产标签'}
        onClose={() => setQrAsset(null)}
        maxWidthClassName="max-w-md"
        footer={(
          <>
            <Button variant="outline" onClick={() => setQrAsset(null)}>
              关闭
            </Button>
            <Button onClick={handlePrint} disabled={qrCodeLoading || !qrCodeUrl}>
              <Printer size={14} className="mr-1.5" />
              打印标签
            </Button>
          </>
        )}
      >
        {qrAsset?.assetId ? (
          <div className="admin-dialog-stack py-1">
            <DialogPanel title="资产信息">
 <div className="font-medium text-cf-title">{qrAsset.name}</div>
 <div className="mt-1 text-xs text-cf-subtle">{qrAsset.assetCode || '-'}</div>
            </DialogPanel>
            <DialogPanel title="二维码标签" bodyClassName="flex flex-col items-center justify-center gap-4">
              {qrCodeLoading ? (
 <div className="flex h-52 w-52 items-center justify-center rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-3 dark:border-slate-800 dark:bg-slate-950">
 <RotateCcw className="h-5 w-5 animate-spin text-cf-faint" />
                </div>
              ) : qrCodeError ? (
                <InlineState
                  title="二维码加载失败"
                  description={qrCodeError}
                  icon={<QrCode className="h-4 w-4" />}
 className="h-52 w-52 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] px-4 py-4 dark:border-slate-800 dark:bg-slate-950"
                />
              ) : qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="资产二维码"
 className="h-52 w-52 rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] p-3 dark:border-slate-800 dark:bg-slate-950"
                />
              ) : null}
 <div className="text-sm text-cf-subtle">
                {qrAsset.assetCode || '-'}
              </div>
            </DialogPanel>
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
          <InlineState title="正在加载资产日志..." className="py-12" icon={<History className="h-4 w-4" />} />
        ) : assetLogs.length === 0 ? (
          <InlineState title="暂无变动记录" className="py-6" icon={<History className="h-4 w-4" />} />
        ) : (
          <DialogPanel title="变动明细" bodyClassName="admin-asset-log-list">
            {assetLogs.map((log, index) => (
              <div
                key={log.logId || `${log.type || 'log'}-${index}`}
                className="admin-asset-log-item"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2 text-sm font-medium text-cf-title">
 <History className="h-4 w-4 text-cf-faint" />
                    <span>{log.type || '资产变动'}</span>
                  </div>
 <div className="text-xs text-cf-subtle">
                    {log.createTime || '-'}
                  </div>
                </div>
                {log.remark ? (
 <div className="mt-2 pl-6 text-sm leading-6 text-cf-muted">
                    {log.remark}
                  </div>
                ) : null}
              </div>
            ))}
          </DialogPanel>
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
        <div className="admin-dialog-stack">
          {borrowTarget ? (
            <DialogPanel title="当前资产">
              {borrowTarget.name}
            </DialogPanel>
          ) : null}
          <div className="admin-dialog-field">
            <Label>领用人 ID</Label>
            <Input
              value={borrowUserId}
              onChange={(event) => setBorrowUserId(event.target.value)}
              className="h-11"
            />
          </div>
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
        <div className="admin-dialog-stack">
          {remarkAsset ? (
            <DialogPanel title="当前资产">
              {remarkAsset.name}
            </DialogPanel>
          ) : null}
          <div className="admin-dialog-field">
            <Label>备注</Label>
            <Textarea
              value={remarkText}
              onChange={(event) => setRemarkText(event.target.value)}
              className="min-h-[120px]"
            />
          </div>
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
    </>
  );
};

export default AssetList;

