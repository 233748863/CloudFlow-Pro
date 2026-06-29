import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { Eye, Plus, RefreshCcw, Search, Target, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';
import { CrmLead, crmApi } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useNavigate } from 'react-router-dom';

import { useDict } from '@/hooks/useDict';
import { DictBadge } from '@/components/common/DictBadge';

const statusOptions = ['NEW', 'FOLLOWING', 'QUALIFIED', 'CONVERTED', 'CLOSED'];

const emptyLead: CrmLead = {
  leadName: '',
  status: 'NEW',
};

export default function CrmLeadPage() {
  const navigate = useNavigate();
  const leadStatusDict = useDict('crm_lead_status');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CrmLead[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [leadName, setLeadName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [status, setStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CrmLead>(emptyLead);
  const [editing, setEditing] = useState<CrmLead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CrmLead | null>(null);
  const [confirmConvert, setConfirmConvert] = useState<CrmLead | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / 10));
  const stats = useMemo(
    () => [
      { label: '线索总数', value: String(total), meta: `当前第 ${pageNum} 页`, icon: <Target size={18} />, tone: 'blue' },
      { label: '已转客户', value: String(rows.filter((row) => row.convertedCustomerId || row.status === 'CONVERTED').length), meta: '当前页统计', icon: <Eye size={18} />, tone: 'green' },
      { label: '待跟进', value: String(rows.filter((row) => !row.convertedCustomerId && row.status !== 'CONVERTED').length), meta: '当前页统计', icon: <UserRound size={18} />, tone: 'amber' },
      { label: '分页', value: `${pageNum}/${totalPages}`, meta: `每页 ${getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10)} 条`, icon: <RefreshCcw size={18} />, tone: 'violet' },
    ],
    [pageNum, rows, total, totalPages],
  );

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listLeads({
        pageNum,
        pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
        leadName: leadName || undefined,
        companyName: companyName || undefined,
        status: status === 'ALL' ? undefined : status,
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载线索失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, leadName, companyName, status]);

  const saveLead = async () => {
    try {
      if (editing?.leadId) {
        await crmApi.editLead({ ...form, leadId: editing.leadId });
        toast.success('线索已更新');
      } else {
        await crmApi.addLead(form);
        toast.success('线索已创建');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyLead);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存线索失败'));
    }
  };

  const convertLead = async (lead: CrmLead) => {
    if (!lead.leadId) return;
    try {
      const customerId = await crmApi.convertLead({
        leadId: lead.leadId,
        customerName: lead.companyName || lead.leadName,
        industry: lead.industry,
        source: lead.source,
        ownerId: lead.ownerId,
        ownerName: lead.ownerName,
        phone: lead.mobile || lead.phone,
        email: lead.email,
        remark: lead.remark,
      });
      toast.success(`已转客户 #${customerId}`);
      setConfirmConvert(null);
      await load();
      navigate(`/office/crm/customer/${customerId}`);
    } catch (error) {
      toast.error(getErrorMessage(error, '线索转客户失败'));
    }
  };

  const removeLead = async (lead: CrmLead) => {
    if (!lead.leadId) return;
    try {
      await crmApi.removeLead([lead.leadId]);
      toast.success('线索已删除');
      setConfirmDelete(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除线索失败'));
    }
  };

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">CRM LEADS</p>
            <h2>线索管理</h2>
            <span>管理销售线索、转化状态、负责人和下一次跟进时间</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw size={16} className={loading ? 'animate-spin' : undefined} />
              刷新
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setForm(emptyLead); setDialogOpen(true); }}>
              <Plus size={16} />
              新增线索
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
              <span className="input-label">搜索线索</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input className="h-[42px]" value={leadName} onChange={(e) => { setPageNum(1); setLeadName(e.target.value); }} placeholder="线索名称" type="search" />
              </div>
            </label>
            <label>
              <span className="input-label">公司名称</span>
              <Input value={companyName} onChange={(e) => { setPageNum(1); setCompanyName(e.target.value); }} placeholder="公司名称" />
            </label>
            <label>
              <span className="input-label">状态</span>
              <Select value={status} onValueChange={(value) => { setPageNum(1); setStatus(value); }}>
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  {statusOptions.map((item) => <SelectItem key={item} value={item}>{leadStatusDict.getLabel(item) || item}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <div className="admin-users-toolbar-actions">
              <span className="admin-users-filter-count">当前 {total} 项</span>
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface className="admin-crm-table-panel">
            <table className="unity-data-table admin-source-table admin-crm-table min-w-[1100px]">
              <thead>
                <tr>
                  <th>线索编号</th>
                  <th>线索 / 公司</th>
                  <th>联系人</th>
                  <th>负责人 / 部门</th>
                  <th>来源 / 行业</th>
                  <th>状态</th>
                  <th>下次跟进</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center"><LoadingSpinner size="lg" className="mx-auto mb-3" /><span className="text-sm text-slate-500">正在加载线索数据...</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500"><Target className="mx-auto mb-3 h-4 w-4" />暂无线索</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.leadId}>
                      <td className="font-mono text-xs">{row.leadNo || '-'}</td>
                      <td><strong>{row.leadName}</strong><small>{row.companyName || '-'}</small></td>
                      <td><strong>{row.contactName || '-'}</strong><small>{row.mobile || row.phone || '-'}</small></td>
                      <td><strong>{row.ownerName || '-'}</strong><small>{row.deptName || '-'}</small></td>
                      <td><strong>{row.source || '-'}</strong><small>{row.industry || '-'}</small></td>
                      <td><DictBadge dictType="crm_lead_status" value={row.status || ''} /></td>
                      <td>{formatDateTimeDisplay(row.nextFollowUpTime) || '-'}</td>
                      <td>
                        <div className="admin-users-row-actions">
                          {row.convertedCustomerId ? <button type="button" title="查看客户工作台" onClick={() => navigate(`/office/crm/customer/${row.convertedCustomerId}`)}><Eye size={15} /></button> : null}
                          <button type="button" title="编辑线索" onClick={() => { setEditing(row); setForm(row); setDialogOpen(true); }}><UserRound size={15} /></button>
                          {!row.convertedCustomerId && row.status !== 'CONVERTED' ? <button type="button" title="转为客户" onClick={() => setConfirmConvert(row)}><Target size={15} /></button> : null}
                          <button type="button" className="danger" title="删除线索" onClick={() => setConfirmDelete(row)}><Trash2 size={15} /></button>
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
      <section className="admin-source-page admin-crm-page admin-crm-leads-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

      <BaseDialog
        open={dialogOpen}
        title={editing ? '编辑线索' : '新增线索'}
        onClose={() => setDialogOpen(false)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void saveLead()}>保存</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label>线索名称</Label>
            <Input value={form.leadName || ''} onChange={(e) => setForm((prev) => ({ ...prev, leadName: e.target.value }))} placeholder="例如：景曜科技采购意向" />
          </div>
          <div>
            <Label>公司名称</Label>
            <Input value={form.companyName || ''} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} placeholder="例如：景曜科技" />
          </div>
          <div>
            <Label>联系人</Label>
            <Input value={form.contactName || ''} onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))} placeholder="联系人姓名" />
          </div>
          <div>
            <Label>手机号</Label>
            <Input value={form.mobile || ''} onChange={(e) => setForm((prev) => ({ ...prev, mobile: e.target.value }))} placeholder="手机号" />
          </div>
          <div>
            <Label>联系电话</Label>
            <Input value={form.phone || ''} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="座机 / 备用电话" />
          </div>
          <div>
            <Label>邮箱</Label>
            <Input value={form.email || ''} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="邮箱" />
          </div>
          <div>
            <Label>来源</Label>
            <Input value={form.source || ''} onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))} placeholder="展会 / 官网 / 转介绍" />
          </div>
          <div>
            <Label>行业</Label>
            <Input value={form.industry || ''} onChange={(e) => setForm((prev) => ({ ...prev, industry: e.target.value }))} placeholder="所属行业" />
          </div>
          <div>
            <Label>状态</Label>
            <Select value={form.status || 'NEW'} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{leadStatusDict.getLabel(item) || item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Label>备注</Label>
            <Textarea value={form.remark || ''} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="记录预算、意向产品、沟通背景等" rows={4} />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除线索"
        description={`确定删除线索“${confirmDelete?.leadName || ''}”吗？`}
        confirmText="删除"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete ? void removeLead(confirmDelete) : undefined}
      />

      <ConfirmDialog
        open={!!confirmConvert}
        title="线索转客户"
        description={`确定将线索“${confirmConvert?.leadName || ''}”转为客户并进入 CRM 工作台吗？`}
        confirmText="确认转化"
        onCancel={() => setConfirmConvert(null)}
        onConfirm={() => confirmConvert ? void convertLead(confirmConvert) : undefined}
      />
    </>
  );
}
