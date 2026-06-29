import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { Anchor, Gavel, HandCoins, RefreshCcw, Waves, History, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  LoadingSpinner,
  Textarea,
  UserSelector,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Pagination } from '@/components/common/Pagination';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { CrmCustomer, CrmCustomerPoolLog, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';

export default function CrmCustomerPoolPage() {
  const actionDict = useDict('crm_pool_action');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CrmCustomer[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [industry, setIndustry] = useState('');
  const [levelCode, setLevelCode] = useState('');
  const [assignDialog, setAssignDialog] = useState<CrmCustomer | null>(null);
  const [assignForm, setAssignForm] = useState<{ ownerId: string; ownerName: string; reason: string }>({ ownerId: '', ownerName: '', reason: '' });
  const [logDialog, setLogDialog] = useState<CrmCustomer | null>(null);
  const [logs, setLogs] = useState<CrmCustomerPoolLog[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const stats = useMemo(
    () => [
      { label: '公海客户', value: String(total), meta: `当前第 ${pageNum} 页`, icon: <Anchor size={18} />, tone: 'blue' },
      { label: '可领取', value: String(rows.filter((row) => row.customerId).length), meta: '当前页统计', icon: <HandCoins size={18} />, tone: 'green' },
      { label: '有原负责人', value: String(rows.filter((row) => row.originalOwnerName).length), meta: '当前页统计', icon: <Gavel size={18} />, tone: 'amber' },
      { label: '回收规则', value: '自动', meta: '手动触发可用', icon: <Waves size={18} />, tone: 'violet' },
    ],
    [pageNum, rows, total],
  );

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listCustomerPool({
        pageNum,
        pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
        customerName: customerName || undefined,
        industry: industry || undefined,
        levelCode: levelCode || undefined,
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载公海客户失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, customerName, industry, levelCode]);

  const handleClaim = async (customer: CrmCustomer) => {
    if (!customer.customerId) return;
    try {
      await crmApi.submitCustomerClaim({
        customerId: customer.customerId,
        action: 'CLAIM',
        remark: '公海抢单',
      });
      toast.success('已提交客户领取审批');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '提交客户领取审批失败'));
    }
  };

  const handleAssign = async () => {
    if (!assignDialog?.customerId) return;
    const ownerId = Number(assignForm.ownerId || 0);
    if (!ownerId) {
      toast.error('请填写新负责人ID');
      return;
    }
    if (!assignForm.ownerName.trim()) {
      toast.error('请填写新负责人姓名');
      return;
    }
    try {
      await crmApi.assignCustomer({
        customerId: assignDialog.customerId,
        ownerId,
        ownerName: assignForm.ownerName.trim(),
        reason: assignForm.reason.trim() || undefined,
      });
      toast.success('指派成功');
      setAssignDialog(null);
      setAssignForm({ ownerId: '', ownerName: '', reason: '' });
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '指派失败'));
    }
  };

  const handleAutoRelease = async () => {
    try {
      const released = await crmApi.triggerAutoRelease();
      toast.success(`已触发自动回收，新增回池 ${released || 0} 条`);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '触发自动回收失败'));
    }
  };

  const openLogs = async (customer: CrmCustomer) => {
    if (!customer.customerId) return;
    setLogDialog(customer);
    setLogLoading(true);
    try {
      const result = await crmApi.listCustomerPoolLogs({ pageNum: 1, pageSize: 50, customerId: customer.customerId });
      setLogs(result.rows || []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载日志失败'));
    } finally {
      setLogLoading(false);
    }
  };

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">CUSTOMER POOL</p>
            <h2>公海客户</h2>
            <span>统一承接待领取、待指派和自动回收后的客户资源</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw size={16} className={loading ? 'animate-spin' : undefined} />
              刷新
            </Button>
            <Button size="sm" onClick={() => void handleAutoRelease()}>
              <Waves size={16} />
              触发自动回收
            </Button>
          </div>
        </header>

        <section className="admin-source-stat-grid admin-crm-stat-grid">
          {stats.map((stat) => (
            <article key={stat.label} className={`card admin-source-stat admin-source-tone-${stat.tone}`}>
              <div className="admin-source-stat-icon">{stat.icon}</div>
              <div>
                <p>{stat.label}</p>
                <strong>{stat.value}</strong>
                <span>{stat.meta}</span>
              </div>
            </article>
          ))}
        </section>
    </>
  );

  const pageFilters = (
        <section className="card admin-users-toolbar admin-crm-toolbar">
          <div className="admin-users-filter-grid">
            <label className="admin-source-search">
              <span className="input-label">搜索客户</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input className="h-[42px]" value={customerName} onChange={(e) => { setPageNum(1); setCustomerName(e.target.value); }} placeholder="客户名称" type="search" />
              </div>
            </label>
            <label>
              <span className="input-label">行业</span>
              <Input value={industry} onChange={(e) => { setPageNum(1); setIndustry(e.target.value); }} placeholder="行业" />
            </label>
            <label>
              <span className="input-label">客户等级</span>
              <Input value={levelCode} onChange={(e) => { setPageNum(1); setLevelCode(e.target.value); }} placeholder="客户等级" />
            </label>
            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">第 {pageNum} / {totalPages} 页</span>
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface className="admin-crm-table-panel">
            <table className="unity-data-table admin-source-table admin-crm-table min-w-[1120px]">
              <thead>
                <tr>
                  <th>客户</th>
                  <th>行业 / 等级</th>
                  <th>原负责人</th>
                  <th>入池时间</th>
                  <th>最近跟进</th>
                  <th>标签</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center"><LoadingSpinner size="lg" className="mx-auto mb-3" /><span className="text-sm text-slate-500">正在加载公海客户...</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500"><Anchor className="mx-auto mb-3 h-4 w-4" />公海暂无客户</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.customerId}>
                      <td><strong>{row.customerName}</strong><small>{row.customerCode || '-'}</small></td>
                      <td><strong>{row.industry || '-'}</strong><small>{row.levelCode || '-'}</small></td>
                      <td>{row.originalOwnerName || '-'}</td>
                      <td>{formatDateTimeDisplay(row.pooledTime) || '-'}</td>
                      <td>{formatDateTimeDisplay(row.lastFollowUpTime) || '-'}</td>
                      <td>{row.customerTags || '-'}</td>
                      <td>
                        <div className="admin-users-row-actions">
                          <button type="button" title="申请领取" onClick={() => void handleClaim(row)}><HandCoins size={15} /></button>
                          <button type="button" title="指派负责人" onClick={() => { setAssignDialog(row); setAssignForm({ ownerId: '', ownerName: '', reason: '' }); }}><Gavel size={15} /></button>
                          <button type="button" title="查看日志" onClick={() => void openLogs(row)}><History size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
        </InnerTableSurface>
  );

  const pagePagination = total > 0
    ? <Pagination total={total} page={pageNum} pageSize={10} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} />
    : null;

  return (
    <>
      <section className="admin-source-page admin-crm-page admin-crm-pool-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={!!assignDialog}
        title={`指派客户 ${assignDialog?.customerName || ''}`}
        onClose={() => setAssignDialog(null)}
        width="normal"
        footer={<><Button variant="outline" onClick={() => setAssignDialog(null)}>取消</Button><Button onClick={() => void handleAssign()}>确认指派</Button></>}
      >
        <div className="grid gap-4">
          <div>
            <Label>新负责人</Label>
            <UserSelector
              single
              value={assignForm.ownerId || null}
              onChange={(id, picked) => setAssignForm((prev) => ({ ...prev, ownerId: id || '', ownerName: picked?.name || '' }))}
              placeholder="选择新负责人"
            />
          </div>
          <div>
            <Label>指派原因</Label>
            <Textarea rows={3} value={assignForm.reason} onChange={(e) => setAssignForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="可选：填写调整说明、服务阶段等" />
          </div>
        </div>
      </BaseDialog>

      <BaseDialog
        open={!!logDialog}
        title={`公海操作日志 - ${logDialog?.customerName || ''}`}
        onClose={() => setLogDialog(null)}
        width="wide"
        footer={<Button variant="outline" onClick={() => setLogDialog(null)}>关闭</Button>}
      >
        <InnerTableSurface className="max-h-[420px]">
          <table className="unity-data-table admin-source-table min-w-[760px]">
            <thead>
              <tr>
                <th className="px-2 py-2">时间</th>
                <th className="px-2 py-2">动作</th>
                <th className="px-2 py-2">原负责人</th>
                <th className="px-2 py-2">新负责人</th>
                <th className="px-2 py-2">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {!logLoading && logs.length === 0 ? (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-xs text-slate-500 dark:text-slate-400">暂无日志</td></tr>
              ) : null}
              {logs.map((log) => (
                <tr key={log.logId}>
                  <td className="px-2 py-2">{formatDateTimeDisplay(log.createTime) || '-'}</td>
                  <td className="px-2 py-2">{actionDict.getLabel(log.actionType || '') || log.actionType || '-'}</td>
                  <td className="px-2 py-2">{log.fromOwnerName || '-'}</td>
                  <td className="px-2 py-2">{log.toOwnerName || '-'}</td>
                  <td className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">{log.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </InnerTableSurface>
      </BaseDialog>
    </>
  );
}
