import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  ConfirmDialog,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TableHead,
  TableHeader,
  TableRowActions,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { BaseDialog } from '@/components/common/BaseDialog';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  HrBankCard,
  HrBankCardPayload,
  HrFamilyMember,
  HrFamilyMemberPayload,
  EmergencyContact,
  EmergencyContactPayload,
  listBankCards,
  createBankCard,
  updateBankCard,
  deleteBankCard,
  listFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  listEmergencyContacts,
  createEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  resolveCurrentEmployee,
} from '@/services/api/hr';
import { normalizeRows, toDateInputValue } from '../hrShared';

const relationshipOptions = ['配偶', '父亲', '母亲', '子女', '兄弟姐妹', '其他'];

const useTabState = <T,>(loader: () => Promise<T[]>) => {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await loader();
      setRows(items);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载失败'));
    } finally {
      setLoading(false);
    }
  }, [loader]);
  return { rows, loading, setRows, load };
};

const BankCardTab: React.FC<{ employeeId: number }> = ({ employeeId }) => {
  const { rows, load } = useTabState(async () => normalizeRows<HrBankCard>(await listBankCards({ pageSize: 100 })));
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrBankCardPayload>({
    employeeId,
    bankName: '',
    bankBranch: '',
    accountNo: '',
    accountHolder: '',
    isPrimary: false,
  });
  const [deleteTarget, setDeleteTarget] = useState<HrBankCard | null>(null);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.bankName.trim() || !form.accountNo.trim() || !form.accountHolder.trim()) {
      toast.error('请填写银行/卡号/持卡人');
      return;
    }
    try {
      if (editingId) {
        await updateBankCard(editingId, form);
        toast.success('已更新');
      } else {
        await createBankCard({ ...form, employeeId });
        toast.success('已添加');
      }
      setOpen(false);
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBankCard(deleteTarget.id);
      toast.success('已删除');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="space-y-4">
      <FilterBar
        stats={[{ label: '', value: `共 ${rows.length} 张` }]}
        actions={[
          <Button key="create" size="sm" onClick={() => { setEditingId(null); setForm({ employeeId, bankName: '', bankBranch: '', accountNo: '', accountHolder: '', isPrimary: false }); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />新增银行卡
          </Button>,
        ]}
      />
      <TableSurfaceCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>银行</TableHead>
                <TableHead>支行</TableHead>
                <TableHead>卡号（脱敏）</TableHead>
                <TableHead>持卡人</TableHead>
                <TableHead>主卡</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length ? rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{row.bankName}</td>
                  <td className="px-4 py-3 text-sm">{row.bankBranch || '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.accountNo}</td>
                  <td className="px-4 py-3 text-sm">{row.accountHolder}</td>
                  <td className="px-4 py-3 text-sm">{row.isPrimary ? '是' : '否'}</td>
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'edit', semantic: 'edit', label: '编辑', onClick: () => { setEditingId(row.id); setForm({ ...row, accountNo: '' }); setOpen(true); } },
                        { key: 'delete', semantic: 'delete', label: '删除', onClick: () => setDeleteTarget(row) },
                      ]}
                    />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-slate-400">暂无银行卡</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editingId ? '编辑银行卡' : '新增银行卡'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>开户行</Label><Input value={form.bankName} onChange={(e) => setForm((p) => ({ ...p, bankName: e.target.value }))} /></div>
          <div><Label>支行</Label><Input value={form.bankBranch} onChange={(e) => setForm((p) => ({ ...p, bankBranch: e.target.value }))} /></div>
          <div><Label>卡号{editingId ? '（留空则保留原值）' : ''}</Label><Input value={form.accountNo} onChange={(e) => setForm((p) => ({ ...p, accountNo: e.target.value }))} /></div>
          <div><Label>持卡人</Label><Input value={form.accountHolder} onChange={(e) => setForm((p) => ({ ...p, accountHolder: e.target.value }))} /></div>
          <div className="flex items-center gap-2">
            <Switch checked={!!form.isPrimary} onCheckedChange={(checked) => setForm((p) => ({ ...p, isPrimary: checked }))} />
            <Label>设为主卡</Label>
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除银行卡"
        message={deleteTarget ? `确认删除「${deleteTarget.bankName}」银行卡?` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
};

const FamilyTab: React.FC<{ employeeId: number }> = ({ employeeId }) => {
  const { rows, load } = useTabState(async () => normalizeRows<HrFamilyMember>(await listFamilyMembers({ pageSize: 100 })));
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<HrFamilyMemberPayload>({
    employeeId,
    memberName: '',
    relationship: '配偶',
  });
  const [deleteTarget, setDeleteTarget] = useState<HrFamilyMember | null>(null);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.memberName.trim()) {
      toast.error('请填写成员姓名');
      return;
    }
    try {
      if (editingId) {
        await updateFamilyMember(editingId, form);
      } else {
        await createFamilyMember({ ...form, employeeId });
      }
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFamilyMember(deleteTarget.id);
      toast.success('已删除');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="space-y-4">
      <FilterBar
        stats={[{ label: '', value: `共 ${rows.length} 人` }]}
        actions={[
          <Button key="create" size="sm" onClick={() => { setEditingId(null); setForm({ employeeId, memberName: '', relationship: '配偶' }); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />新增家庭成员
          </Button>,
        ]}
      />
      <TableSurfaceCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px]">
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>姓名</TableHead>
                <TableHead>关系</TableHead>
                <TableHead>身份证（脱敏）</TableHead>
                <TableHead>生日</TableHead>
                <TableHead>联系方式</TableHead>
                <TableHead>赡养</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length ? rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{row.memberName}</td>
                  <td className="px-4 py-3 text-sm">{row.relationship}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.idCardNo || '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.birthDate || '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.phone || '-'}</td>
                  <td className="px-4 py-3 text-sm">{row.isDependent ? '是' : '否'}</td>
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'edit', semantic: 'edit', label: '编辑', onClick: () => { setEditingId(row.id); setForm({ ...row, birthDate: toDateInputValue(row.birthDate), idCardNo: '' }); setOpen(true); } },
                        { key: 'delete', semantic: 'delete', label: '删除', onClick: () => setDeleteTarget(row) },
                      ]}
                    />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无家庭成员</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editingId ? '编辑家庭成员' : '新增家庭成员'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>姓名</Label><Input value={form.memberName} onChange={(e) => setForm((p) => ({ ...p, memberName: e.target.value }))} /></div>
          <div>
            <Label>关系</Label>
            <Select value={form.relationship} onValueChange={(v) => setForm((p) => ({ ...p, relationship: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {relationshipOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>身份证号{editingId ? '（留空则保留原值）' : ''}</Label><Input value={form.idCardNo || ''} onChange={(e) => setForm((p) => ({ ...p, idCardNo: e.target.value }))} /></div>
          <div><Label>生日</Label><DatePicker type="date" value={form.birthDate || ''} onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))} /></div>
          <div><Label>职业</Label><Input value={form.occupation || ''} onChange={(e) => setForm((p) => ({ ...p, occupation: e.target.value }))} /></div>
          <div><Label>联系方式</Label><Input value={form.phone || ''} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div className="flex items-center gap-2">
            <Switch checked={!!form.isDependent} onCheckedChange={(checked) => setForm((p) => ({ ...p, isDependent: checked }))} />
            <Label>赡养人</Label>
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除家庭成员"
        message={deleteTarget ? `确认删除家庭成员「${deleteTarget.memberName}」?` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
};

const EmergencyTab: React.FC<{ employeeId: number }> = ({ employeeId }) => {
  const [rows, setRows] = useState<EmergencyContact[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EmergencyContactPayload>({
    employeeId,
    contactName: '',
    relationship: '配偶',
    phone: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<EmergencyContact | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await listEmergencyContacts(employeeId);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载紧急联系人失败'));
    }
  }, [employeeId]);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!form.contactName.trim() || !form.phone.trim()) {
      toast.error('请填写姓名和电话');
      return;
    }
    try {
      if (editingId) {
        await updateEmergencyContact(editingId, form);
      } else {
        await createEmergencyContact({ ...form, employeeId });
      }
      toast.success('已保存');
      setOpen(false);
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEmergencyContact(deleteTarget.id);
      toast.success('已删除');
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <div className="space-y-4">
      <FilterBar
        stats={[{ label: '', value: `共 ${rows.length} 人` }]}
        actions={[
          <Button key="create" size="sm" onClick={() => { setEditingId(null); setForm({ employeeId, contactName: '', relationship: '配偶', phone: '' }); setOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />新增紧急联系人
          </Button>,
        ]}
      />
      <TableSurfaceCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <TableHeader className="sticky top-0 z-10">
              <tr>
                <TableHead>姓名</TableHead>
                <TableHead>关系</TableHead>
                <TableHead>电话</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </tr>
            </TableHeader>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length ? rows.map((row) => (
                <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-sm">{row.contactName}</td>
                  <td className="px-4 py-3 text-sm">{row.relationship}</td>
                  <td className="px-4 py-3 text-sm">{row.phone}</td>
                  <td className="px-4 py-3">
                    <TableRowActions
                      actions={[
                        { key: 'edit', semantic: 'edit', label: '编辑', onClick: () => { setEditingId(row.id); setForm(row); setOpen(true); } },
                        { key: 'delete', semantic: 'delete', label: '删除', onClick: () => setDeleteTarget(row) },
                      ]}
                    />
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-10 text-center text-sm text-slate-400">暂无紧急联系人</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </TableSurfaceCard>

      <BaseDialog
        open={open}
        title={editingId ? '编辑紧急联系人' : '新增紧急联系人'}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={() => void handleSave()}>保存</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div><Label>姓名</Label><Input value={form.contactName} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} /></div>
          <div>
            <Label>关系</Label>
            <Select value={form.relationship} onValueChange={(v) => setForm((p) => ({ ...p, relationship: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {relationshipOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>电话</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除紧急联系人"
        message={deleteTarget ? `确认删除紧急联系人「${deleteTarget.contactName}」?` : ''}
        danger
        confirmText="确认删除"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
};

export const HrEssProfilePage: React.FC = () => {
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const employee = await resolveCurrentEmployee();
        setEmployeeId(employee?.id ?? null);
      } catch (error) {
        toast.error(getErrorMessage(error, '员工信息加载失败'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="py-10 text-center text-sm text-slate-400">加载中…</div>;
  if (!employeeId) return <div className="py-10 text-center text-sm text-rose-500">未找到当前员工档案，请联系 HR</div>;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="bank" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
          <TabsTrigger value="bank" className="flex-1 lg:flex-none"><CreditCard className="mr-1 inline-block h-4 w-4" />银行卡</TabsTrigger>
          <TabsTrigger value="family" className="flex-1 lg:flex-none"><Users className="mr-1 inline-block h-4 w-4" />家庭成员</TabsTrigger>
          <TabsTrigger value="emergency" className="flex-1 lg:flex-none"><Users className="mr-1 inline-block h-4 w-4" />紧急联系人</TabsTrigger>
        </TabsList>
        <TabsContent value="bank"><BankCardTab employeeId={employeeId} /></TabsContent>
        <TabsContent value="family"><FamilyTab employeeId={employeeId} /></TabsContent>
        <TabsContent value="emergency"><EmergencyTab employeeId={employeeId} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default HrEssProfilePage;
