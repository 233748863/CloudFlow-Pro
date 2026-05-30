import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { Eye, Plus, RefreshCcw, Target, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { Pagination } from '@/components/common/Pagination';
import { CrmLead, crmApi } from '@/services/api/crm';
import { getErrorMessage } from '@/utils/errorMessage';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { useNavigate } from 'react-router-dom';

import { getCrmLeadStatusLabel } from '@/utils/enumLabels';

const statusOptions = ['NEW', 'FOLLOWING', 'QUALIFIED', 'CONVERTED', 'CLOSED'];

const emptyLead: CrmLead = {
  leadName: '',
  status: 'NEW',
};

export default function CrmLeadPage() {
  const navigate = useNavigate();
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

  return (
    <div className="space-y-4 animate-fade-in">
      <TablePageLayout
        filters={(
          <div className="cf-filter-bar">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input value={leadName} onChange={(e) => { setPageNum(1); setLeadName(e.target.value); }} placeholder="线索名称" className="w-full sm:w-[220px]" />
              <Input value={companyName} onChange={(e) => { setPageNum(1); setCompanyName(e.target.value); }} placeholder="公司名称" className="w-full sm:w-[220px]" />
              <div className="w-full sm:w-[180px]">
                <Select value={status} onValueChange={(value) => { setPageNum(1); setStatus(value); }}>
                  <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmLeadStatusLabel(item)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-slate-500">第 {pageNum} / {totalPages} 页，共 {total} 条</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCcw size={14} className="mr-1.5" />刷新</Button>
              <Button size="sm" onClick={() => { setEditing(null); setForm(emptyLead); setDialogOpen(true); }}><Plus size={14} className="mr-1.5" />新增线索</Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <TableHeader>
                  <tr>
                    <TableHead>线索编号</TableHead>
                    <TableHead>线索 / 公司</TableHead>
                    <TableHead>联系人</TableHead>
                    <TableHead>负责人 / 部门</TableHead>
                    <TableHead>来源 / 行业</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>下次跟进</TableHead>
                    <TableActionHead>操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row) => (
                    <tr key={row.leadId}>
                      <td className="px-4 py-3 text-sm">{row.leadNo || '-'}</td>
                      <td className="px-4 py-3 text-sm"><div>{row.leadName}</div><div className="text-xs text-slate-500">{row.companyName || '-'}</div></td>
                      <td className="px-4 py-3 text-sm"><div>{row.contactName || '-'}</div><div className="text-xs text-slate-500">{row.mobile || row.phone || '-'}</div></td>
                      <td className="px-4 py-3 text-sm"><div>{row.ownerName || '-'}</div><div className="text-xs text-slate-500">{row.deptName || '-'}</div></td>
                      <td className="px-4 py-3 text-sm"><div>{row.source || '-'}</div><div className="text-xs text-slate-500">{row.industry || '-'}</div></td>
                      <td className="px-4 py-3 text-sm">{getCrmLeadStatusLabel(row.status)}</td>
                      <td className="px-4 py-3 text-sm">{formatDateTimeDisplay(row.nextFollowUpTime) || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '查看客户工作台', icon: <Eye size={14} />, onClick: () => row.convertedCustomerId ? navigate(`/office/crm/customer/${row.convertedCustomerId}`) : toast.error('该线索尚未转客户'), semantic: 'view', hidden: !row.convertedCustomerId },
                            { label: '编辑线索', icon: <UserRound size={14} />, onClick: () => { setEditing(row); setForm(row); setDialogOpen(true); }, semantic: 'edit', isPrimary: true, permissionKey: 'crm:lead:edit' },
                            { label: '转为客户', icon: <Target size={14} />, onClick: () => setConfirmConvert(row), hidden: !!row.convertedCustomerId || row.status === 'CONVERTED', semantic: 'submit', permissionKey: 'crm:lead:convert' },
                            { label: '删除线索', icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(row), semantic: 'delete', danger: true, permissionKey: 'crm:lead:remove' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-sm text-slate-500">
                        <Target className="mx-auto mb-3 h-4 w-4" />
                        暂无线索。下一步操作：新增线索，或从线索直接转客户进入 CRM 360 工作台。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TableSurfaceCard>
        )}
        pagination={total > 0 ? <Pagination total={total} page={pageNum} pageSize={10} showPageSizeSelector={false} showJump={false} onPageChange={setPageNum} onPageSizeChange={() => {}} /> : null}
      />

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
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmLeadStatusLabel(item)}</SelectItem>)}
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
    </div>
  );
}
