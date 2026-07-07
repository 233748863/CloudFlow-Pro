import React, { useEffect, useMemo, useState } from 'react';
import { getConfigIntSync } from '../hooks/useSystemConfig';
import { SYS_PAGE_DEFAULT_PAGE_SIZE } from '../constants/sysConfig';
import { ListOrdered, RefreshCcw, Search, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DatePicker,
  DeptSelector,
  DictSelect,
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
import { CrmAssignmentRule, crmApi } from '@/services/api/crm';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { useDict } from '@/hooks/useDict';

import { getCrmGenericStatusLabel } from '@/utils/enumLabels';

const ruleTypeOptions: CrmAssignmentRule['ruleType'][] = ['AUTO_RELEASE', 'CLAIM_LIMIT', 'ASSIGN'];
const statusOptions = ['ACTIVE', 'INACTIVE'];
const CUSTOMER_LEVEL_DICT_TYPE = 'crm_customer_level';

const emptyRule: CrmAssignmentRule = {
  ruleName: '',
  ruleType: 'AUTO_RELEASE',
  priority: 100,
  status: 'ACTIVE',
  inactiveDays: 30,
};

export default function CrmAssignmentRulePage() {
  const ruleTypeDict = useDict('crm_assignment_rule_type');
  const customerLevelDict = useDict(CUSTOMER_LEVEL_DICT_TYPE);
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
  const stats = useMemo(
    () => [
      { label: '规则总数', value: String(total), meta: `当前第 ${pageNum} 页`, icon: <ListOrdered size={18} />, tone: 'blue' },
      { label: '启用规则', value: String(rows.filter((row) => row.status === 'ACTIVE').length), meta: '当前页统计', icon: <ShieldCheck size={18} />, tone: 'green' },
      { label: '自动回收', value: String(rows.filter((row) => row.ruleType === 'AUTO_RELEASE').length), meta: '当前页统计', icon: <RefreshCcw size={18} />, tone: 'amber' },
      { label: '分页', value: `${pageNum}/${totalPages}`, meta: `每页 ${getConfigIntSync(SYS_PAGE_DEFAULT_PAGE_SIZE, 10)} 条`, icon: <Settings2 size={18} />, tone: 'violet' },
    ],
    [pageNum, rows, total, totalPages],
  );

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

  const pageActions = (
    <>
        <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">ASSIGNMENT RULES</p>
            <h2>分配规则</h2>
            <span>配置客户回收、领取上限、派单范围和规则优先级</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw size={16} className={loading ? 'animate-spin' : undefined} />
              刷新
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setForm(emptyRule); setDialogOpen(true); }}>
              <ListOrdered size={16} />
              新增规则
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
              <span className="input-label">搜索规则</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input className="h-[42px]" value={ruleName} onChange={(e) => { setPageNum(1); setRuleName(e.target.value); }} placeholder="规则名称" type="search" />
              </div>
            </label>
            <label>
              <span className="input-label">规则类型</span>
              <Select value={ruleType} onValueChange={(value) => { setPageNum(1); setRuleType(value); }}>
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="规则类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部类型</SelectItem>
                  {ruleTypeOptions.map((item) => <SelectItem key={item} value={item}>{ruleTypeDict.getLabel(item)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span className="input-label">状态</span>
              <Select value={status} onValueChange={(value) => { setPageNum(1); setStatus(value); }}>
                <SelectTrigger className="h-[42px]"><SelectValue placeholder="状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  {statusOptions.map((item) => <SelectItem key={item} value={item}>{getCrmGenericStatusLabel(item)}</SelectItem>)}
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
            <table className="unity-data-table admin-source-table admin-crm-table min-w-[1180px]">
              <thead>
                <tr>
                  <th>优先级</th>
                  <th>规则名称</th>
                  <th>类型</th>
                  <th>适用范围</th>
                  <th>阈值</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th className="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center"><LoadingSpinner size="lg" className="mx-auto mb-3" /><span className="text-sm text-slate-500">正在加载分配规则...</span></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500"><ListOrdered className="mx-auto mb-3 h-4 w-4" />暂无分配规则</td></tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.ruleId}>
                      <td className="font-mono text-xs">{row.priority ?? 100}</td>
                      <td><strong>{row.ruleName}</strong><small>{row.remark || '-'}</small></td>
                      <td>{ruleTypeDict.getLabel(row.ruleType || '') || '-'}</td>
                      <td><strong>部门：{row.deptName || '全部'}</strong><small>等级：{row.customerLevel ? customerLevelDict.getLabel(row.customerLevel) : '全部'}；标签：{row.customerTags || '全部'}</small></td>
                      <td>
                        {row.ruleType === 'AUTO_RELEASE' ? `${row.inactiveDays || '-'} 天未跟进` : null}
                        {row.ruleType === 'CLAIM_LIMIT' ? `单人持有上限 ${row.maxPerOwner || '-'}` : null}
                        {row.ruleType === 'ASSIGN' ? '按规则派单' : null}
                      </td>
                      <td><span className={row.status === 'ACTIVE' ? 'badge badge-success' : 'badge badge-gray'}>{getCrmGenericStatusLabel(row.status)}</span></td>
                      <td>{formatDateTimeDisplay(row.updateTime) || '-'}</td>
                      <td>
                        <div className="admin-users-row-actions">
                          <button type="button" title="编辑规则" onClick={() => { setEditing(row); setForm({ ...row }); setDialogOpen(true); }}><Settings2 size={15} /></button>
                          <button type="button" className="danger" title="删除规则" onClick={() => setConfirmDelete(row)}><Trash2 size={15} /></button>
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
      <section className="admin-source-page admin-crm-page admin-crm-rules-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
          pagination={pagePagination}
        />
      </section>

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
            <DictSelect
              dictType={CUSTOMER_LEVEL_DICT_TYPE}
              value={form.customerLevel || ''}
              onChange={(value) => setForm((prev) => ({ ...prev, customerLevel: value || undefined }))}
              placeholder="留空表示全部"
              allowClear
            />
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
    </>
  );
}
