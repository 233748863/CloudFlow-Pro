import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { Anchor, Gavel, HandCoins, RefreshCcw, Waves, History } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Label,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
  UserSelector,
} from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Pagination } from '@/components/common/Pagination';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { CrmCustomer, CrmCustomerPoolLog, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';

const actionLabelMap: Record<string, string> = {
  RELEASE: '释放到公海',
  CLAIM: '抢单',
  ASSIGN: '指派',
  AUTO_RELEASE: '自动回收',
};

export default function CrmCustomerPoolPage() {
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
      await crmApi.claimCustomer(customer.customerId, '公海抢单');
      toast.success('抢单成功');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '抢单失败'));
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

  return (
    <div className="space-y-4 animate-fade-in">
      <TablePageLayout
        filters={(
          <div className="cf-filter-bar">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input value={customerName} onChange={(e) => { setPageNum(1); setCustomerName(e.target.value); }} placeholder="客户名称" className="w-full sm:w-[220px]" />
              <Input value={industry} onChange={(e) => { setPageNum(1); setIndustry(e.target.value); }} placeholder="行业" className="w-full sm:w-[180px]" />
              <Input value={levelCode} onChange={(e) => { setPageNum(1); setLevelCode(e.target.value); }} placeholder="客户等级" className="w-full sm:w-[160px]" />
              <div className="text-xs text-slate-500">第 {pageNum} / {totalPages} 页，共 {total} 条</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCcw size={14} className="mr-1.5" />刷新</Button>
              <Button size="sm" onClick={() => void handleAutoRelease()}><Waves size={14} className="mr-1.5" />触发自动回收</Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <TableHeader>
                  <tr>
                    <TableHead>客户</TableHead>
                    <TableHead>行业 / 等级</TableHead>
                    <TableHead>原负责人</TableHead>
                    <TableHead>入池时间</TableHead>
                    <TableHead>最近跟进</TableHead>
                    <TableHead>标签</TableHead>
                    <TableActionHead>操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row) => (
                    <tr key={row.customerId}>
                      <td className="px-4 py-3 text-sm">
                        <div>{row.customerName}</div>
                        <div className="text-xs text-slate-500">{row.customerCode || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>{row.industry || '-'}</div>
                        <div className="text-xs text-slate-500">{row.levelCode || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{row.originalOwnerName || '-'}</td>
                      <td className="px-4 py-3 text-sm">{formatDateTimeDisplay(row.pooledTime) || '-'}</td>
                      <td className="px-4 py-3 text-sm">{formatDateTimeDisplay(row.lastFollowUpTime) || '-'}</td>
                      <td className="px-4 py-3 text-sm">{row.customerTags || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '抢单', icon: <HandCoins size={14} />, onClick: () => void handleClaim(row), semantic: 'confirm', isPrimary: true, permissionKey: 'crm:customer-pool:claim' },
                            { label: '指派负责人', icon: <Gavel size={14} />, onClick: () => { setAssignDialog(row); setAssignForm({ ownerId: '', ownerName: '', reason: '' }); }, permissionKey: 'crm:customer-pool:assign' },
                            { label: '查看日志', icon: <History size={14} />, onClick: () => void openLogs(row) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center text-sm text-slate-500">
                        <Anchor className="mx-auto mb-3 h-4 w-4" />
                        公海暂无客户。下一步操作：配置自动回收规则，长时间未跟进的客户会被自动释放到此。
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
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="px-2 py-2">时间</th>
                <th className="px-2 py-2">动作</th>
                <th className="px-2 py-2">原负责人</th>
                <th className="px-2 py-2">新负责人</th>
                <th className="px-2 py-2">说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {!logLoading && logs.length === 0 ? (
                <tr><td colSpan={5} className="px-2 py-6 text-center text-xs text-slate-500">暂无日志</td></tr>
              ) : null}
              {logs.map((log) => (
                <tr key={log.logId}>
                  <td className="px-2 py-2">{formatDateTimeDisplay(log.createTime) || '-'}</td>
                  <td className="px-2 py-2">{actionLabelMap[log.actionType || ''] || log.actionType || '-'}</td>
                  <td className="px-2 py-2">{log.fromOwnerName || '-'}</td>
                  <td className="px-2 py-2">{log.toOwnerName || '-'}</td>
                  <td className="px-2 py-2 text-xs text-slate-500">{log.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BaseDialog>
    </div>
  );
}
