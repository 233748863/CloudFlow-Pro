import React, { useEffect, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { ListOrdered, RefreshCcw, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DatePicker,
  DeptSelector,
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
import { Pagination } from '@/components/common/Pagination';
import { TableRowActions } from '@/components/common/table-row-actions';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { CrmAssignmentRule, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';

import { getCrmGenericStatusLabel } from '@/utils/enumLabels';

const ruleTypeOptions: CrmAssignmentRule['ruleType'][] = ['AUTO_RELEASE', 'CLAIM_LIMIT', 'ASSIGN'];
const statusOptions = ['ACTIVE', 'INACTIVE'];

const emptyRule: CrmAssignmentRule = {
  ruleName: '',
  ruleType: 'AUTO_RELEASE',
  priority: 100,
  status: 'ACTIVE',
  inactiveDays: 30,
};

export default function CrmAssignmentRulePage() {
  const ruleTypeDict = useDict('crm_assignment_rule_type');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CrmAssignmentRule[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CrmAssignmentRule>(emptyRule);
  const [editing, setEditing] = useState<CrmAssignmentRule | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CrmAssignmentRule | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / 10));

  const load = async () => {
    setLoading(true);
    try {
      const result = await crmApi.listAssignmentRules({
        pageNum,
        pageSize: getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10),
        ruleName: ruleName || undefined,
        ruleType: ruleType === 'ALL' ? undefined : ruleType,
        status: status === 'ALL' ? undefined : status,
      });
      setRows(result.rows || []);
      setTotal(result.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载分配规则失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [pageNum, ruleName, ruleType, status]);

  const saveRule = async () => {
    try {
      if (editing?.ruleId) {
        await crmApi.editAssignmentRule({ ...form, ruleId: editing.ruleId });
        toast.success('规则已更新');
      } else {
        await crmApi.addAssignmentRule(form);
        toast.success('规则已创建');
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyRule);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存规则失败'));
    }
  };

  const removeRule = async (rule: CrmAssignmentRule) => {
    if (!rule.ruleId) return;
    try {
      await crmApi.removeAssignmentRule([rule.ruleId]);
      toast.success('规则已删除');
      setConfirmDelete(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除规则失败'));
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <TablePageLayout
        filters={(
          <div className="cf-filter-bar">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input value={ruleName} onChange={(e) => { setPageNum(1); setRuleName(e.target.value); }} placeholder="规则名称" className="w-full sm:w-[220px]" />
              <div className="w-full sm:w-[160px]">
                <Select value={ruleType} onValueChange={(value) => { setPageNum(1); setRuleType(value); }}>
                  <SelectTrigger><SelectValue placeholder="规则类型" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部类型</SelectItem>
                    {ruleTypeOptions.map((item) => <SelectItem key={item} value={item}>{ruleTypeDict.getLabel(item)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[160px]">
                <Select value={status} onValueChange={(value) => { setPageNum(1); setStatus(value); }}>
                  <SelectTrigger><SelectValue placeholder="状态" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmGenericStatusLabel(item)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-slate-500">第 {pageNum} / {totalPages} 页，共 {total} 条</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCcw size={14} className="mr-1.5" />刷新</Button>
              <Button size="sm" onClick={() => { setEditing(null); setForm(emptyRule); setDialogOpen(true); }}><ListOrdered size={14} className="mr-1.5" />新增规则</Button>
            </div>
          </div>
        )}
        table={(
          <TableSurfaceCard fill>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <TableHeader>
                  <tr>
                    <TableHead>优先级</TableHead>
                    <TableHead>规则名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>适用范围</TableHead>
                    <TableHead>阈值</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableActionHead>操作</TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row) => (
                    <tr key={row.ruleId}>
                      <td className="px-4 py-3 text-sm">{row.priority ?? 100}</td>
                      <td className="px-4 py-3 text-sm"><div>{row.ruleName}</div><div className="text-xs text-slate-500">{row.remark || '-'}</div></td>
                      <td className="px-4 py-3 text-sm">{ruleTypeDict.getLabel(row.ruleType || '') || row.ruleType}</td>
                      <td className="px-4 py-3 text-sm">
                        <div>部门：{row.deptName || '全部'}</div>
                        <div className="text-xs text-slate-500">等级：{row.customerLevel || '全部'}；标签：{row.customerTags || '全部'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {row.ruleType === 'AUTO_RELEASE' ? `${row.inactiveDays || '-'} 天未跟进` : null}
                        {row.ruleType === 'CLAIM_LIMIT' ? `单人持有上限 ${row.maxPerOwner || '-'}` : null}
                        {row.ruleType === 'ASSIGN' ? '按规则派单' : null}
                      </td>
                      <td className="px-4 py-3 text-sm">{getCrmGenericStatusLabel(row.status)}</td>
                      <td className="px-4 py-3 text-sm">{formatDateTimeDisplay(row.updateTime) || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <TableRowActions
                          align="end"
                          overflowLabel="更多"
                          actions={[
                            { label: '编辑规则', icon: <Settings2 size={14} />, onClick: () => { setEditing(row); setForm({ ...row }); setDialogOpen(true); }, semantic: 'edit', isPrimary: true, permissionKey: 'crm:assignment-rule:edit' },
                            { label: '删除规则', icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(row), semantic: 'delete', danger: true, permissionKey: 'crm:assignment-rule:remove' },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-16 text-center text-sm text-slate-500">
                        <ListOrdered className="mx-auto mb-3 h-4 w-4" />
                        暂无分配规则。建议先配置 “AUTO_RELEASE” 回收阈值，然后再按部门配置抢单上限。
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
        title={editing ? '编辑分配规则' : '新增分配规则'}
        onClose={() => setDialogOpen(false)}
        width="wide"
        footer={<><Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button><Button onClick={() => void saveRule()}>保存</Button></>}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <Label>规则名称</Label>
            <Input value={form.ruleName || ''} onChange={(e) => setForm((prev) => ({ ...prev, ruleName: e.target.value }))} placeholder="例如：华东大区 45 天未跟进回收" />
          </div>
          <div>
            <Label>规则类型</Label>
            <Select value={form.ruleType} onValueChange={(value) => setForm((prev) => ({ ...prev, ruleType: value as CrmAssignmentRule['ruleType'] }))}>
              <SelectTrigger><SelectValue placeholder="选择类型" /></SelectTrigger>
              <SelectContent>
                {ruleTypeOptions.map((item) => <SelectItem key={item} value={item}>{ruleTypeDict.getLabel(item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>优先级</Label>
            <Input type="number" value={String(form.priority ?? 100)} onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value || 100) }))} placeholder="越小越优先" />
          </div>
          {form.ruleType === 'AUTO_RELEASE' ? (
            <div>
              <Label>未跟进天数</Label>
              <Input type="number" value={String(form.inactiveDays ?? 30)} onChange={(e) => setForm((prev) => ({ ...prev, inactiveDays: Number(e.target.value || 0) }))} placeholder="例如 30" />
            </div>
          ) : null}
          {form.ruleType === 'CLAIM_LIMIT' ? (
            <div>
              <Label>单人持有上限</Label>
              <Input type="number" value={String(form.maxPerOwner ?? 0)} onChange={(e) => setForm((prev) => ({ ...prev, maxPerOwner: Number(e.target.value || 0) }))} placeholder="例如 50" />
            </div>
          ) : null}
          <div className="md:col-span-2">
            <Label>适用部门</Label>
            <DeptSelector
              single
              value={form.deptId ?? null}
              onChange={(id, picked) => setForm((prev) => ({ ...prev, deptId: id ?? undefined, deptName: picked?.deptName || '' }))}
              placeholder="留空表示全部"
              allowClear
            />
          </div>
          <div>
            <Label>客户等级</Label>
            <Input value={form.customerLevel || ''} onChange={(e) => setForm((prev) => ({ ...prev, customerLevel: e.target.value }))} placeholder="例如 VIP / NORMAL" />
          </div>
          <div>
            <Label>客户标签</Label>
            <Input value={form.customerTags || ''} onChange={(e) => setForm((prev) => ({ ...prev, customerTags: e.target.value }))} placeholder="匹配包含此标签的客户" />
          </div>
          <div>
            <Label>生效开始</Label>
            <DatePicker className="h-11" type="date" value={form.effectiveStart || ''} onChange={(e) => setForm((prev) => ({ ...prev, effectiveStart: e.target.value }))} />
          </div>
          <div>
            <Label>生效结束</Label>
            <DatePicker className="h-11" type="date" value={form.effectiveEnd || ''} onChange={(e) => setForm((prev) => ({ ...prev, effectiveEnd: e.target.value }))} />
          </div>
          <div>
            <Label>状态</Label>
            <Select value={form.status || 'ACTIVE'} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmGenericStatusLabel(item)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Label>备注</Label>
            <Textarea rows={3} value={form.remark || ''} onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))} placeholder="记录规则意图、业务边界" />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除分配规则"
        description={`确定删除规则“${confirmDelete?.ruleName || ''}”吗？`}
        confirmText="删除"
        tone="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete ? void removeRule(confirmDelete) : undefined}
      />
    </div>
  );
}
