import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus, Trash2, Users } from 'lucide-react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { TableSurfaceCard } from '@/components/layout/TablePageLayout';
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
import { normalizeRows } from '../hrShared';

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

  const handleDelete = async (id: number) => {
    try {
      await deleteBankCard(id);
      toast.success('已删除');
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => { setEditingId(null); setForm({ employeeId, bankName: '', bankBranch: '', accountNo: '', accountHolder: '', isPrimary: false }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />新增银行卡
        </Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>银行</TableHead>
              <TableHead>支行</TableHead>
              <TableHead>卡号（脱敏）</TableHead>
              <TableHead>持卡人</TableHead>
              <TableHead>主卡</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.bankName}</TableCell>
                <TableCell>{row.bankBranch || '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.accountNo}</TableCell>
                <TableCell>{row.accountHolder}</TableCell>
                <TableCell>{row.isPrimary ? '是' : '否'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm({ ...row, accountNo: '' }); setOpen(true); }}>编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-400">暂无银行卡</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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
            <input type="checkbox" checked={!!form.isPrimary} onChange={(e) => setForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
            <Label>设为主卡</Label>
          </div>
        </div>
      </BaseDialog>
    </>
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

  const handleDelete = async (id: number) => {
    try {
      await deleteFamilyMember(id);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => { setEditingId(null); setForm({ employeeId, memberName: '', relationship: '配偶' }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />新增家庭成员
        </Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>关系</TableHead>
              <TableHead>身份证（脱敏）</TableHead>
              <TableHead>生日</TableHead>
              <TableHead>联系方式</TableHead>
              <TableHead>赡养</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.memberName}</TableCell>
                <TableCell>{row.relationship}</TableCell>
                <TableCell className="font-mono text-xs">{row.idCardNo || '-'}</TableCell>
                <TableCell>{row.birthDate || '-'}</TableCell>
                <TableCell>{row.phone || '-'}</TableCell>
                <TableCell>{row.isDependent ? '是' : '否'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm({ ...row, idCardNo: '' }); setOpen(true); }}>编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-400">暂无家庭成员</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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
          <div><Label>生日</Label><Input type="date" value={form.birthDate || ''} onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))} /></div>
          <div><Label>职业</Label><Input value={form.occupation || ''} onChange={(e) => setForm((p) => ({ ...p, occupation: e.target.value }))} /></div>
          <div><Label>联系方式</Label><Input value={form.phone || ''} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={!!form.isDependent} onChange={(e) => setForm((p) => ({ ...p, isDependent: e.target.checked }))} />
            <Label>赡养人</Label>
          </div>
        </div>
      </BaseDialog>
    </>
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

  const handleDelete = async (id: number) => {
    try {
      await deleteEmergencyContact(id);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除失败'));
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => { setEditingId(null); setForm({ employeeId, contactName: '', relationship: '配偶', phone: '' }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />新增紧急联系人
        </Button>
      </div>
      <TableSurfaceCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>关系</TableHead>
              <TableHead>电话</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.contactName}</TableCell>
                <TableCell>{row.relationship}</TableCell>
                <TableCell>{row.phone}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingId(row.id); setForm(row); setOpen(true); }}>编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDelete(row.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-slate-400">暂无紧急联系人</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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
    </>
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

  if (loading) return <div className="p-6 text-sm text-slate-400">加载中...</div>;
  if (!employeeId) return <div className="p-6 text-sm text-rose-500">未找到当前员工档案，请联系 HR</div>;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <div className="text-xl font-semibold text-slate-900 dark:text-slate-50">个人信息</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">银行卡 · 家庭成员 · 紧急联系人</div>
      </div>
      <Tabs defaultValue="bank">
        <TabsList>
          <TabsTrigger value="bank"><CreditCard className="mr-1 inline-block h-4 w-4" />银行卡</TabsTrigger>
          <TabsTrigger value="family"><Users className="mr-1 inline-block h-4 w-4" />家庭成员</TabsTrigger>
          <TabsTrigger value="emergency"><Users className="mr-1 inline-block h-4 w-4" />紧急联系人</TabsTrigger>
        </TabsList>
        <TabsContent value="bank"><BankCardTab employeeId={employeeId} /></TabsContent>
        <TabsContent value="family"><FamilyTab employeeId={employeeId} /></TabsContent>
        <TabsContent value="emergency"><EmergencyTab employeeId={employeeId} /></TabsContent>
      </Tabs>
    </div>
  );
};

export default HrEssProfilePage;
