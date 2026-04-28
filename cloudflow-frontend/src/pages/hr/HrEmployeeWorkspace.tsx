import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  Edit3,
  MapPin,
  Phone,
  Plus,
  RefreshCcw,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
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
import {
  EmergencyContact,
  HrEmployee,
  createEmergencyContact,
  deleteEmergencyContact,
  getEmergencyContact,
  getEmployeeDetail,
  listEmergencyContacts,
  updateEmergencyContact,
} from '@/services/api/hr';
import { normalizeRows, toDateInputValue } from './hrShared';

type SaveKind = 'contacts' | null;
type DeleteTarget = { id: number; label: string };

interface HrEmployeeWorkspaceProps {
  employees: HrEmployee[];
  selectedEmployeeId: number | null;
  loading: boolean;
  onEditEmployee: (id: number) => void | Promise<void>;
}

interface ContactFormState {
  contactName: string;
  relationship: string;
  phone: string;
  address: string;
  priority: string;
}

const employeeStatusLabel: Record<string, string> = {
  PENDING: '待入职',
  PROBATION: '试用期',
  REGULAR: '正式员工',
  RESIGNED: '已离职',
};

const employeeTypeLabel: Record<string, string> = {
  FULL_TIME: '全职',
  PART_TIME: '兼职',
  INTERN: '实习生',
  CONTRACTOR: '外包',
};

const relationshipLabel: Record<string, string> = {
  SPOUSE: '配偶',
  PARENT: '父母',
  SIBLING: '兄弟姐妹',
  CHILD: '子女',
  OTHER: '其他',
};

const defaultContactForm: ContactFormState = {
  contactName: '',
  relationship: 'PARENT',
  phone: '',
  address: '',
  priority: '1',
};

const textValue = (value?: string | number | null) =>
  value == null || value === '' ? '-' : String(value);

const InlineState = ({
  title,
  icon,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Users className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
  </div>
);

const DetailField = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const ArchiveCardField = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      {icon}
      {label}
    </div>
    <div className="mt-2 break-words text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const DialogSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/60">
    <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
    {children}
  </section>
);

const contactPriorityTone = (priority?: number | null) => {
  if (priority === 1) {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
  }
  if (priority === 2) {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const contactPriorityLabel = (priority?: number | null) =>
  priority ? `P${priority} 优先联系` : '未设置优先级';

const HrEmployeeWorkspace: React.FC<HrEmployeeWorkspaceProps> = ({
  employees,
  selectedEmployeeId,
  loading,
  onEditEmployee,
}) => {
  const [employeeDetail, setEmployeeDetail] = useState<HrEmployee | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contactEditingId, setContactEditingId] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState<ContactFormState>(defaultContactForm);
  const [saveKind, setSaveKind] = useState<SaveKind>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const currentEmployee = useMemo(
    () => employees.find((item) => item.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const displayEmployee = employeeDetail || currentEmployee;

  const resetContactForm = () => {
    setContactEditingId(null);
    setContactForm(defaultContactForm);
  };

  const closeContactDialog = () => {
    resetContactForm();
    setContactDialogOpen(false);
  };

  const loadEmployeeProfile = async (employeeId: number) => {
    setDetailLoading(true);
    try {
      setEmployeeDetail(await getEmployeeDetail(employeeId));
    } catch (error) {
      console.error(error);
      toast.error('员工详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadEmployeeContacts = async (employeeId: number) => {
    setContactsLoading(true);
    try {
      setContacts(normalizeRows<EmergencyContact>(await listEmergencyContacts(employeeId)));
    } catch (error) {
      console.error(error);
      toast.error('紧急联系人加载失败');
    } finally {
      setContactsLoading(false);
    }
  };

  const refreshWorkspace = async (employeeId: number) => {
    await Promise.all([
      loadEmployeeProfile(employeeId),
      loadEmployeeContacts(employeeId),
    ]);
  };

  const validateContactForm = () => {
    if (!contactForm.contactName.trim()) {
      toast.error('请先填写联系人姓名');
      return false;
    }
    if (!contactForm.phone.trim()) {
      toast.error('请先填写联系人电话');
      return false;
    }
    return true;
  };

  const handleOpenContactCreate = () => {
    resetContactForm();
    setContactDialogOpen(true);
  };

  const handleEditContact = async (id: number) => {
    try {
      const detail = await getEmergencyContact(id);
      setContactEditingId(id);
      setContactForm({
        contactName: detail.contactName || '',
        relationship: detail.relationship || 'PARENT',
        phone: detail.phone || '',
        address: detail.address || '',
        priority: detail.priority == null ? '1' : String(detail.priority),
      });
      setContactDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('紧急联系人详情获取失败');
    }
  };

  const handleSubmitContact = async () => {
    if (!selectedEmployeeId || !validateContactForm()) return;

    const payload = {
      contactName: contactForm.contactName.trim(),
      relationship: contactForm.relationship,
      phone: contactForm.phone.trim(),
      address: contactForm.address.trim() || null,
      priority: contactForm.priority ? Number(contactForm.priority) : null,
    };

    setSaveKind('contacts');
    try {
      if (contactEditingId) {
        await updateEmergencyContact(contactEditingId, payload);
        toast.success('紧急联系人已更新');
      } else {
        await createEmergencyContact({ employeeId: selectedEmployeeId, ...payload });
        toast.success('紧急联系人已创建');
      }
      closeContactDialog();
      await loadEmployeeContacts(selectedEmployeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '紧急联系人保存失败');
    } finally {
      setSaveKind(null);
    }
  };

  const requestDeleteContact = (item: EmergencyContact) => {
    setPendingDelete({
      id: item.id,
      label: `紧急联系人“${item.contactName}”`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !selectedEmployeeId) return;

    setDeleteLoading(true);
    try {
      await deleteEmergencyContact(pendingDelete.id);
      toast.success('紧急联系人已删除');
      if (contactEditingId === pendingDelete.id) {
        closeContactDialog();
      }
      await loadEmployeeContacts(selectedEmployeeId);
      setPendingDelete(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    closeContactDialog();
    setPendingDelete(null);

    if (!selectedEmployeeId) {
      setEmployeeDetail(null);
      setContacts([]);
      return;
    }

    void refreshWorkspace(selectedEmployeeId);
  }, [employees, selectedEmployeeId]);

  if (!selectedEmployeeId) {
    return (
      <div className="flex h-full min-h-[560px] items-center justify-center px-6">
        <InlineState
          title={loading ? '正在准备员工档案...' : '先选择一位员工'}
          className="py-16"
        />
      </div>
    );
  }

  const employeeName = displayEmployee?.name || `员工 #${selectedEmployeeId}`;
  const employeeMetaLine = detailLoading
    ? '正在同步员工主档详情...'
    : ([
        displayEmployee?.employeeNo,
        displayEmployee?.deptName,
        displayEmployee?.postName,
      ]
        .filter(Boolean)
        .join(' / ') || '当前员工暂无完整组织信息');
  const employeeSummaryFields = [
    { label: '工号', value: textValue(displayEmployee?.employeeNo) },
    { label: '部门', value: textValue(displayEmployee?.deptName) },
    { label: '岗位', value: textValue(displayEmployee?.postName) },
    {
      label: '状态',
      value: employeeStatusLabel[displayEmployee?.employeeStatus || ''] || textValue(displayEmployee?.employeeStatus),
    },
    {
      label: '类型',
      value: employeeTypeLabel[displayEmployee?.employeeType || ''] || textValue(displayEmployee?.employeeType),
    },
    { label: '电话', value: textValue(displayEmployee?.phone) },
    { label: '邮箱', value: textValue(displayEmployee?.email) },
    { label: '入职', value: toDateInputValue(displayEmployee?.hireDate) || '-' },
    { label: '转正', value: toDateInputValue(displayEmployee?.regularDate) || '-' },
    { label: '紧急联系人', value: `${contacts.length} 人` },
  ];

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {employeeName}
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {employeeMetaLine}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void refreshWorkspace(selectedEmployeeId)}
            >
              <RefreshCcw
                size={14}
                className={`mr-1.5 ${detailLoading || contactsLoading ? 'animate-spin' : ''}`}
              />
              刷新
            </Button>
            <Button size="sm" className="h-8" onClick={() => onEditEmployee(selectedEmployeeId)}>
              <Edit3 size={14} className="mr-1.5" />
              编辑主档
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-slate-200 px-4 py-4 dark:border-slate-800 2xl:grid-cols-3">
          {employeeSummaryFields.map((item) => (
            <DetailField key={item.label} label={item.label} value={item.value} />
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Phone className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              紧急联系人
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => void loadEmployeeContacts(selectedEmployeeId)}
              >
                <RefreshCcw
                  size={14}
                  className={`mr-1.5 ${contactsLoading ? 'animate-spin' : ''}`}
                />
                刷新
              </Button>
              <Button size="sm" className="h-8" onClick={handleOpenContactCreate}>
                <Plus size={14} className="mr-1.5" />
                新增联系人
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-4 py-4 dark:bg-slate-950/10">
            {contactsLoading ? (
              <InlineState
                title="正在加载紧急联系人..."
                icon={<Phone className="h-4 w-4" />}
                className="min-h-[260px]"
              />
            ) : contacts.length === 0 ? (
              <InlineState
                title="当前员工还没有紧急联系人"
                icon={<Phone className="h-4 w-4" />}
                className="min-h-[260px]"
              />
            ) : (
              <div className="flex flex-col gap-3 pb-4">
                {contacts.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition hover:border-cyan-200 hover:shadow-[0_20px_44px_-28px_rgba(8,145,178,0.35)] dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-cyan-900"
                  >
                    <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-white dark:bg-slate-100 dark:text-slate-900">
                              {item.relationshipName || relationshipLabel[item.relationship] || item.relationship}
                            </span>
                            <div className="break-all text-base font-semibold text-slate-900 dark:text-slate-100">
                              {item.contactName}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span
                              className={[
                                'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                                contactPriorityTone(item.priority),
                              ].join(' ')}
                            >
                              {contactPriorityLabel(item.priority)}
                            </span>
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                              {item.phone}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button size="sm" variant="outline" className="h-8 rounded-full px-3" onClick={() => void handleEditContact(item.id)}>
                            <Edit3 size={14} className="mr-1.5" />
                            编辑
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-full px-3" onClick={() => requestDeleteContact(item)}>
                            <Trash2 size={14} className="mr-1.5" />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <ArchiveCardField
                        label="联系电话"
                        value={item.phone}
                        icon={<Phone className="h-3.5 w-3.5" />}
                      />
                      <ArchiveCardField
                        label="关系"
                        value={item.relationshipName || relationshipLabel[item.relationship] || item.relationship}
                        icon={<Users className="h-3.5 w-3.5" />}
                      />
                      <ArchiveCardField
                        label="优先级"
                        value={item.priority ? `P${item.priority}` : '-'}
                        icon={<Clock3 className="h-3.5 w-3.5" />}
                      />
                      <ArchiveCardField
                        label="联系地址"
                        value={textValue(item.address)}
                        icon={<MapPin className="h-3.5 w-3.5" />}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <BaseDialog
        open={contactDialogOpen}
        title={contactEditingId ? '编辑紧急联系人' : '新增紧急联系人'}
        onClose={closeContactDialog}
        width="wide"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeContactDialog}>
              取消
            </Button>
            <Button disabled={saveKind === 'contacts'} onClick={() => void handleSubmitContact()}>
              {saveKind === 'contacts' ? '保存中...' : contactEditingId ? '保存联系人' : '新增联系人'}
            </Button>
          </div>
        )}
      >
        <DialogSection title="联系人信息">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">联系人姓名</Label>
              <Input
                value={contactForm.contactName}
                onChange={(event) =>
                  setContactForm((prev) => ({ ...prev, contactName: event.target.value }))
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">关系</Label>
              <Select
                value={contactForm.relationship}
                onValueChange={(value) =>
                  setContactForm((prev) => ({ ...prev, relationship: value }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPOUSE">配偶</SelectItem>
                  <SelectItem value="PARENT">父母</SelectItem>
                  <SelectItem value="SIBLING">兄弟姐妹</SelectItem>
                  <SelectItem value="CHILD">子女</SelectItem>
                  <SelectItem value="OTHER">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">联系电话</Label>
              <Input
                value={contactForm.phone}
                onChange={(event) =>
                  setContactForm((prev) => ({ ...prev, phone: event.target.value }))
                }
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">优先级</Label>
              <Select
                value={contactForm.priority}
                onValueChange={(value) =>
                  setContactForm((prev) => ({ ...prev, priority: value }))
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">第一联系人</SelectItem>
                  <SelectItem value="2">第二联系人</SelectItem>
                  <SelectItem value="3">第三联系人</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 xl:col-span-4">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">联系地址</Label>
              <Input
                value={contactForm.address}
                onChange={(event) =>
                  setContactForm((prev) => ({ ...prev, address: event.target.value }))
                }
                className="h-11"
              />
            </div>
          </div>
        </DialogSection>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="确认删除"
        message={pendingDelete ? `确认删除${pendingDelete.label}吗？删除后不可恢复。` : ''}
        confirmText={deleteLoading ? '删除中...' : '确认删除'}
        cancelText="取消"
        danger
        onCancel={() => {
          if (!deleteLoading) {
            setPendingDelete(null);
          }
        }}
        onConfirm={() => {
          if (!deleteLoading) {
            void handleConfirmDelete();
          }
        }}
      />
    </>
  );
};

export default HrEmployeeWorkspace;
