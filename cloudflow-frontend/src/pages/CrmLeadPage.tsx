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
import { crmOperations } from '@/services/api/crm/operations';
import { ProfileFields } from '@/components/crm/operations/ProfileFields';
import { LeadConversionDialog, LeadQualificationDialog } from '@/components/crm/operations/LeadActions';
import { LeadDetailDialog } from '@/components/crm/operations/LeadDetailDialog';
import { Field, labelOf, OpsSelect, qualificationStatuses, useAccess, useMutation, useRemote } from '@/components/crm/operations/OperationsKit';

const statusOptions = ['NEW', 'FOLLOWING', 'QUALIFIED', 'CONVERTED', 'CLOSED'];

const emptyLead: CrmLead = {
  leadName: '',
  status: 'NEW',
};

export default function CrmLeadPage() {
  const navigate = useNavigate();
  const can = useAccess();
  const mutation = useMutation();
  const territories = useRemote(() => can('crm:territory:list') ? crmOperations.territories() : Promise.resolve([]));
  const segments = useDict('crm_market_segment');
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
  const [qualification, setQualification] = useState<CrmLead>();
  const [viewedId, setViewedId] = useState<number>();
  const [qualificationStatus, setQualificationStatus] = useState('');
  const [territoryId, setTerritoryId] = useState('');
  const [marketSegment, setMarketSegment] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [scoreOrder, setScoreOrder] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const pageSize = getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
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
    setSelected([]);
    try {
      const result = await crmApi.listLeads({
        pageNum,
        pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
        leadName: leadName || undefined,
        companyName: companyName || undefined,
        status: status === 'ALL' ? undefined : status,
        qualificationStatus: qualificationStatus || undefined,
        territoryId: territoryId ? Number(territoryId) : undefined,
        marketSegment: marketSegment || undefined,
        scoreMin: scoreMin ? Number(scoreMin) : undefined,
        scoreMax: scoreMax ? Number(scoreMax) : undefined,
        scoreOrder: scoreOrder || undefined,
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
  }, [pageNum, leadName, companyName, status, qualificationStatus, territoryId, marketSegment, scoreMin, scoreMax, scoreOrder]);

  const saveLead = async () => {
    try {
      if (editing?.leadId) {
        const update = { ...form, leadId: editing.leadId };
        for (const field of ['mobile', 'phone', 'email'] as const) {
          if (form[field] === editing[field]) delete update[field];
        }
        await crmApi.editLead(update);
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
            {can('crm:lead:score') && <Button size="sm" variant="outline" disabled={mutation.busy || !selected.length} onClick={() => void mutation.run(() => crmOperations.batchScore(selected), () => setSelected([]), '重算请求已加入后台队列，完成后刷新查看')}>重算已选评分（{selected.length}）</Button>}
            {can('crm:lead:add') && <Button size="sm" onClick={() => { setEditing(null); setForm(emptyLead); setDialogOpen(true); }}>
              <Plus size={16} />
              新增线索
            </Button>}
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
            <Field label="资质状态"><OpsSelect label="资质筛选" value={qualificationStatus} empty="全部资质" options={qualificationStatuses} onChange={value => { setQualificationStatus(value); setPageNum(1); }} /></Field>
            <Field label="区域"><OpsSelect label="线索区域筛选" value={territoryId} empty="全部区域" options={Object.fromEntries((territories.data || []).map(node => [String(node.territoryId), node.territoryName]))} onChange={value => { setTerritoryId(value); setPageNum(1); }} /></Field>
            <Field label="细分市场"><OpsSelect label="线索市场筛选" value={marketSegment} empty="全部市场" options={Object.fromEntries(segments.getOptions().map(option => [option.value, option.label]))} onChange={value => { setMarketSegment(value); setPageNum(1); }} /></Field>
            <Field label="最低分"><Input type="number" value={scoreMin} onChange={event => { setScoreMin(event.target.value); setPageNum(1); }} /></Field>
            <Field label="最高分"><Input type="number" value={scoreMax} onChange={event => { setScoreMax(event.target.value); setPageNum(1); }} /></Field>
            <Field label="评分排序"><OpsSelect label="评分排序" value={scoreOrder} empty="默认排序" options={{ DESC: '高分优先', ASC: '低分优先' }} onChange={value => { setScoreOrder(value); setPageNum(1); }} /></Field>
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
                  {statusOptions.map((item) => <SelectItem key={item} value={item}>{leadStatusDict.getLabel(item) || '-'}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <div className="admin-users-toolbar-actions">
            </div>
          </div>
        </section>
  );

  const pageTable = (
        <InnerTableSurface className="admin-crm-table-panel">
            <table className="unity-data-table admin-source-table admin-crm-table min-w-[1100px]">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="全选本页线索" checked={rows.length > 0 && selected.length === rows.length} onChange={event => setSelected(event.target.checked ? rows.map(row => row.leadId!) : [])} /> 线索 / 公司</th>
                  <th>线索编号</th>
                  <th>联系人</th>
                  <th>负责人 / 部门</th>
                  <th>来源 / 行业</th>
                  <th>状态 / 资质 / 评分</th>
                  <th>下次跟进</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center"><LoadingSpinner size="lg" className="mx-auto mb-3" /><span className="text-sm text-cf-subtle">正在加载线索数据...</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-cf-subtle"><Target className="mx-auto mb-3 h-4 w-4" />暂无线索</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.leadId}>
                      <td style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}><div className="flex items-start gap-2"><input type="checkbox" className="mt-1 shrink-0" aria-label={`选择${row.leadName}`} checked={selected.includes(row.leadId!)} onChange={event => setSelected(previous => event.target.checked ? [...previous, row.leadId!] : previous.filter(id => id !== row.leadId))} /><div className="min-w-0 w-[min(16rem,calc(100vw-15rem))] shrink-0"><strong className="block" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{row.leadName}</strong><small className="block" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{row.companyName || '-'}</small></div></div></td>
                      <td className="font-mono text-xs">{row.leadNo || '-'}</td>
                      <td><strong>{row.contactName || '-'}</strong><small>{row.mobile || row.phone || '-'}</small></td>
                      <td><strong>{row.ownerName || '-'}</strong><small>{row.deptName || '-'}</small></td>
                      <td><strong>{row.source || '-'}</strong><small>{row.industry || '-'}</small></td>
                      <td><DictBadge dictType="crm_lead_status" value={row.status || ''} /><div className="text-xs">{labelOf(qualificationStatuses, row.qualificationStatus)} · {row.leadScore ?? 0} 分</div>{row.disqualifyReason && <div className="max-w-xs whitespace-normal text-xs text-cf-muted">{row.disqualifyReason}</div>}</td>
                      <td>{formatDateTimeDisplay(row.nextFollowUpTime) || '-'}</td>
                      <td>
                        <div className="admin-users-row-actions max-lg:!grid max-lg:!grid-cols-2 max-lg:!w-[94px] max-lg:[&>button]:!h-11 max-lg:[&>button]:!w-11">
                          <button type="button" className="!min-h-11 !min-w-11" data-tooltip="查看线索" aria-label="查看线索" onClick={() => setViewedId(row.leadId)}><Eye size={15} /></button>
                          {row.convertedCustomerId ? <button type="button" data-tooltip="查看客户工作台" aria-label="查看客户工作台" onClick={() => navigate(`/office/crm/customer/${row.convertedCustomerId}`)}><Eye size={15} /></button> : null}
                          {can('crm:lead:edit') && <button type="button" data-tooltip="编辑线索" aria-label="编辑线索" onClick={() => { setEditing(row); setForm(row); setDialogOpen(true); }}><UserRound size={15} /></button>}
                          {can('crm:lead:qualify') && !row.convertedCustomerId && <Button size="sm" variant="ghost" onClick={() => setQualification(row)}>评估</Button>}
                          {can('crm:lead:score') && <Button size="sm" variant="ghost" disabled={mutation.busy} onClick={() => void mutation.run(() => crmOperations.recalculateLead(row.leadId!), () => void load())}>重算</Button>}
                          {can('crm:lead:convert') && !row.convertedCustomerId && row.status !== 'CONVERTED' ? <button type="button" data-tooltip="转为客户" aria-label="转为客户" onClick={() => setConfirmConvert(row)}><Target size={15} /></button> : null}
                          {can('crm:lead:remove') && <button type="button" className="danger" data-tooltip="删除线索" aria-label="删除线索" onClick={() => setConfirmDelete(row)}><Trash2 size={15} /></button>}
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
    ? <Pagination total={total} page={pageNum} pageSize={pageSize} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} />
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
          <ProfileFields value={form} onChange={fields => setForm(previous => ({ ...previous, ...fields }))} />
          <Field label="职务"><Input value={form.jobTitle || ''} onChange={event => setForm(previous => ({ ...previous, jobTitle: event.target.value }))} /></Field>
          <Field label="网站"><Input type="url" value={form.website || ''} onChange={event => setForm(previous => ({ ...previous, website: event.target.value }))} /></Field>
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
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{leadStatusDict.getLabel(item) || '-'}</SelectItem>)}
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

      {confirmConvert && <LeadConversionDialog key={confirmConvert.leadId} lead={confirmConvert} onClose={() => setConfirmConvert(null)} onConverted={id => { setConfirmConvert(null); navigate(`/office/crm/customer/${id}`); }} />}
      {viewedId !== undefined && <LeadDetailDialog key={viewedId} leadId={viewedId} onClose={() => setViewedId(undefined)} />}
      {qualification && <LeadQualificationDialog key={qualification.leadId} lead={qualification} onClose={() => setQualification(undefined)} onSaved={() => void load()} />}
    </>
  );
}
