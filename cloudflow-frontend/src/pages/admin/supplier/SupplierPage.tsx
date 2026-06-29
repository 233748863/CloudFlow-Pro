import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../../../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../../../constants/sysConfig';
import { Edit, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supplierApi, Supplier } from '@/services/api/purchase';
import { getErrorMessage } from '@/utils/errorMessage';
import { useAuth } from '@/context/AuthContext';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

const createDefaultForm = (): Supplier => ({
  supplierName: '',
  contactName: '',
  contactPhone: '',
  bankName: '',
  bankAccount: '',
  status: 'ACTIVE',
});

const statusBadge = (status?: string) => (
  <DictBadge dictType="oa_supplier_status" value={String(status || 'ACTIVE')} fallback="启用" />
);

const SupplierPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const statusDict = useDict('oa_supplier_status');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchName, setSearchName] = useState('');
  const [searchParams, setSearchParams] = useState({
    supplierName: '',
    status: '',
    pageNum: 1,
    pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
  });
  const [showDialog, setShowDialog] = useState(false);
  const [currentSupplier, setCurrentSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState<Supplier>(createDefaultForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => {
    void fetchSuppliers();
  }, [searchParams]);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const result = await supplierApi.list(searchParams);
      setSuppliers(result.records || result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取供应商列表失败'));
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / searchParams.pageSize));
  const activeCount = useMemo(() => suppliers.filter((item) => item.status !== 'DISABLED').length, [suppliers]);
  const disabledCount = useMemo(() => suppliers.filter((item) => item.status === 'DISABLED').length, [suppliers]);
  const hasActiveFilters = Boolean(searchParams.supplierName || searchParams.status);
  const currentStatusLabel = searchParams.status ? statusDict.getLabel(searchParams.status) || searchParams.status : '全部状态';
  const metrics = [
    { label: '供应商', value: String(total), meta: `当前页 ${suppliers.length}`, icon: <Plus size={18} />, tone: 'blue' },
    { label: '启用', value: String(activeCount), meta: '当前页可用', icon: <Edit size={18} />, tone: 'green' },
    { label: '停用', value: String(disabledCount), meta: '当前页不可选', icon: <Trash2 size={18} />, tone: 'amber' },
    { label: '页码', value: `${searchParams.pageNum}/${totalPages}`, meta: '分页位置', icon: <Search size={18} />, tone: 'violet' },
  ];

  const handleSearch = () => {
    setSearchParams((prev) => ({ ...prev, supplierName: searchName.trim(), pageNum: 1 }));
  };

  const handleReset = () => {
    setSearchName('');
    setSearchParams({ supplierName: '', status: '', pageNum: 1, pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10) });
  };

  const openAdd = () => {
    setCurrentSupplier(null);
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const openEdit = (supplier: Supplier) => {
    setCurrentSupplier(supplier);
    setFormData({ ...createDefaultForm(), ...supplier });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.supplierName.trim()) {
      toast.error('请输入供应商名称');
      return;
    }
    try {
      if (currentSupplier?.supplierId) {
        await supplierApi.edit(formData);
        toast.success('更新成功');
      } else {
        await supplierApi.add(formData);
        toast.success('创建成功');
      }
      setShowDialog(false);
      await fetchSuppliers();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await supplierApi.remove([deleteId]);
      toast.success('删除成功');
      setDeleteId(null);
      await fetchSuppliers();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">SUPPLIERS</p>
            <h2>供应商管理</h2>
            <span>维护采购供应商、联系人、开户信息和可用状态</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void fetchSuppliers()} disabled={loading}>
              <RotateCcw size={16} className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
            <Button size="sm" onClick={openAdd} disabled={!hasPermission('oa:supplier:add')}>
              <Plus size={16} />
              新增供应商
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
              <span className="input-label">供应商名称</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  value={searchName}
                  onChange={(event) => setSearchName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSearch();
                  }}
                  placeholder="搜索供应商名称"
                  className="h-[42px]"
                />
              </div>
            </label>
            <label>
              <span className="input-label">状态</span>
                <Select
                  value={searchParams.status || 'ALL'}
                  onValueChange={(value) => setSearchParams((prev) => ({
                    ...prev,
                    status: value === 'ALL' ? '' : value,
                    pageNum: 1,
                  }))}
                >
                  <SelectTrigger className="h-[42px]">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  </SelectContent>
                </Select>
            </label>
            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">{hasActiveFilters ? `${currentStatusLabel} / ${searchParams.supplierName || '全部名称'}` : '全部供应商'}</span>
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <Search size={14} />
                搜索
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
                  <th>供应商</th>
                  <th>联系人</th>
                  <th>开户信息</th>
                  <th>状态</th>
                  <th className="text-right">当前操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">正在加载供应商...</td></tr>
                ) : suppliers.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">暂无供应商</td></tr>
                ) : suppliers.map((item) => (
                  <tr key={item.supplierId}>
                    <td>
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.supplierName}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.createTime || '-'}</div>
                    </td>
                    <td>
                      <div>{item.contactName || '-'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.contactPhone || '-'}</div>
                    </td>
                    <td>
                      <div>{item.bankName || '-'}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.bankAccount || '-'}</div>
                    </td>
                    <td>{statusBadge(item.status)}</td>
                    <td>
                      <div className="admin-users-row-actions">
                        {hasPermission('oa:supplier:edit') ? <button type="button" title="编辑" aria-label="编辑" onClick={() => openEdit(item)}><Edit size={15} /></button> : null}
                        {hasPermission('oa:supplier:remove') ? <button type="button" title="删除" aria-label="删除" onClick={() => setDeleteId(item.supplierId!)}><Trash2 size={15} /></button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </InnerTableSurface>
  );

  const pagePagination = total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={() => {}}
            />
  ) : null;

  return (
    <>
      <section className="admin-source-page supplier-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={showDialog}
        title={currentSupplier ? '编辑供应商' : '新增供应商'}
        onClose={() => setShowDialog(false)}
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={currentSupplier ? !hasPermission('oa:supplier:edit') : !hasPermission('oa:supplier:add')}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="admin-dialog-field">
            <Label>供应商名称</Label>
            <Input value={formData.supplierName} onChange={(event) => setFormData((prev) => ({ ...prev, supplierName: event.target.value }))} />
          </div>
          <div className="admin-dialog-field">
            <Label>状态</Label>
            <Select value={formData.status || 'ACTIVE'} onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {statusDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="admin-dialog-field">
            <Label>联系人</Label>
            <Input value={formData.contactName || ''} onChange={(event) => setFormData((prev) => ({ ...prev, contactName: event.target.value }))} />
          </div>
          <div className="admin-dialog-field">
            <Label>联系电话</Label>
            <Input value={formData.contactPhone || ''} onChange={(event) => setFormData((prev) => ({ ...prev, contactPhone: event.target.value }))} />
          </div>
          <div className="admin-dialog-field">
            <Label>开户行</Label>
            <Input value={formData.bankName || ''} onChange={(event) => setFormData((prev) => ({ ...prev, bankName: event.target.value }))} />
          </div>
          <div className="admin-dialog-field">
            <Label>银行账号</Label>
            <Input value={formData.bankAccount || ''} onChange={(event) => setFormData((prev) => ({ ...prev, bankAccount: event.target.value }))} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="删除供应商"
        message="删除后该供应商不再出现在采购申请选择列表。"
        confirmText="删除"
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
};

export default SupplierPage;
