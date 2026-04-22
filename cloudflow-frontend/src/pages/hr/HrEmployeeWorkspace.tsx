import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  FileText,
  Phone,
  Plus,
  RefreshCcw,
  ShieldCheck,
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
} from '@/components/ui';
import {
  EmployeeContract,
  EmployeeDocument,
  EmergencyContact,
  HrEmployee,
  createEmergencyContact,
  createEmployeeContract,
  createEmployeeDocument,
  deleteEmergencyContact,
  deleteEmployeeContract,
  deleteEmployeeDocument,
  getEmergencyContact,
  getEmployeeContract,
  getEmployeeDetail,
  getEmployeeDocument,
  listEmergencyContacts,
  listEmployeeContracts,
  listEmployeeDocuments,
  updateEmergencyContact,
  updateEmployeeContract,
  updateEmployeeDocument,
} from '@/services/api/hr';
import { normalizeRows, toDateInputValue } from './hrShared';

type WorkspaceTab = 'contracts' | 'documents' | 'contacts';
type SaveKind = WorkspaceTab | null;
type DeleteTarget =
  | { kind: 'contract'; id: number; label: string }
  | { kind: 'document'; id: number; label: string }
  | { kind: 'contact'; id: number; label: string };

interface HrEmployeeWorkspaceProps {
  employees: HrEmployee[];
  selectedEmployeeId: number | null;
  loading: boolean;
  onEditEmployee: (id: number) => void | Promise<void>;
}

interface ContractFormState {
  contractType: string;
  contractNo: string;
  signDate: string;
  startDate: string;
  endDate: string;
  duration: string;
  fileUrl: string;
  status: string;
}

interface DocumentFormState {
  documentType: string;
  documentNo: string;
  issueDate: string;
  expiryDate: string;
  fileUrl: string;
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

const contractTypeLabel: Record<string, string> = {
  LABOR: '劳动合同',
  SERVICE: '劳务合同',
  INTERN: '实习协议',
};

const contractStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  ACTIVE: '生效中',
  EXPIRED: '已过期',
  TERMINATED: '已终止',
};

const documentTypeLabel: Record<string, string> = {
  ID_CARD: '身份证',
  PASSPORT: '护照',
  DIPLOMA: '学历证书',
  DEGREE: '学位证书',
};

const relationshipLabel: Record<string, string> = {
  SPOUSE: '配偶',
  PARENT: '父母',
  SIBLING: '兄弟姐妹',
  CHILD: '子女',
  OTHER: '其他',
};

const defaultContractForm: ContractFormState = {
  contractType: 'LABOR',
  contractNo: '',
  signDate: '',
  startDate: '',
  endDate: '',
  duration: '',
  fileUrl: '',
  status: 'DRAFT',
};

const defaultDocumentForm: DocumentFormState = {
  documentType: 'ID_CARD',
  documentNo: '',
  issueDate: '',
  expiryDate: '',
  fileUrl: '',
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

const canDeleteContract = (contract?: EmployeeContract | null) =>
  String(contract?.status || '').toUpperCase() === 'DRAFT';

const employeeStatusTone = (status?: string | null) => {
  switch (status) {
    case 'REGULAR':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
    case 'PROBATION':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
    case 'RESIGNED':
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
    default:
      return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
  }
};

const contractStatusTone = (status?: string | null) => {
  switch (status) {
    case 'ACTIVE':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
    case 'EXPIRED':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
    case 'TERMINATED':
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
};

const InlineState = ({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <Users className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
  </div>
);

const TableStateRow = ({
  colSpan,
  title,
  description,
  loading = false,
}: {
  colSpan: number;
  title: string;
  description?: string;
  loading?: boolean;
}) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-14">
      <InlineState
        title={title}
        description={description}
        className={loading ? 'py-6' : 'py-4'}
      />
    </td>
  </tr>
);

const MetaPill = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={[
      'inline-flex items-center rounded-full border px-2.5 py-1 text-xs',
      className || 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    ].join(' ')}
  >
    {children}
  </span>
);

const DialogSection = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      {description ? (
        <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
      ) : null}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const HrEmployeeWorkspace: React.FC<HrEmployeeWorkspaceProps> = ({
  employees,
  selectedEmployeeId,
  loading,
  onEditEmployee,
}) => {
  const [tab, setTab] = useState<WorkspaceTab>('contracts');
  const [employeeDetail, setEmployeeDetail] = useState<HrEmployee | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [documentDialogOpen, setDocumentDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [contractEditingId, setContractEditingId] = useState<number | null>(null);
  const [documentEditingId, setDocumentEditingId] = useState<number | null>(null);
  const [contactEditingId, setContactEditingId] = useState<number | null>(null);
  const [contractForm, setContractForm] = useState<ContractFormState>(defaultContractForm);
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(defaultDocumentForm);
  const [contactForm, setContactForm] = useState<ContactFormState>(defaultContactForm);
  const [saveKind, setSaveKind] = useState<SaveKind>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const currentEmployee = useMemo(
    () => employees.find((item) => item.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const displayEmployee = employeeDetail || currentEmployee;

  const resetContractForm = () => {
    setContractEditingId(null);
    setContractForm(defaultContractForm);
  };

  const resetDocumentForm = () => {
    setDocumentEditingId(null);
    setDocumentForm(defaultDocumentForm);
  };

  const resetContactForm = () => {
    setContactEditingId(null);
    setContactForm(defaultContactForm);
  };

  const closeContractDialog = () => {
    resetContractForm();
    setContractDialogOpen(false);
  };

  const closeDocumentDialog = () => {
    resetDocumentForm();
    setDocumentDialogOpen(false);
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

  const loadEmployeeContracts = async (employeeId: number) => {
    setContractsLoading(true);
    try {
      setContracts(normalizeRows<EmployeeContract>(await listEmployeeContracts(employeeId)));
    } catch (error) {
      console.error(error);
      toast.error('员工合同加载失败');
    } finally {
      setContractsLoading(false);
    }
  };

  const loadEmployeeDocuments = async (employeeId: number) => {
    setDocumentsLoading(true);
    try {
      setDocuments(normalizeRows<EmployeeDocument>(await listEmployeeDocuments(employeeId)));
    } catch (error) {
      console.error(error);
      toast.error('员工证件加载失败');
    } finally {
      setDocumentsLoading(false);
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
      loadEmployeeContracts(employeeId),
      loadEmployeeDocuments(employeeId),
      loadEmployeeContacts(employeeId),
    ]);
  };

  const validateContractForm = () => {
    if (!contractForm.contractNo.trim()) {
      toast.error('请先填写合同编号');
      return false;
    }
    if (!contractForm.signDate || !contractForm.startDate || !contractForm.endDate) {
      toast.error('请完整填写合同日期');
      return false;
    }
    if (contractForm.endDate < contractForm.startDate) {
      toast.error('合同结束日期不能早于开始日期');
      return false;
    }
    return true;
  };

  const validateDocumentForm = () => {
    if (!documentForm.documentNo.trim()) {
      toast.error('请先填写证件号码');
      return false;
    }
    if (
      documentForm.issueDate
      && documentForm.expiryDate
      && documentForm.expiryDate < documentForm.issueDate
    ) {
      toast.error('证件有效期不能早于签发日期');
      return false;
    }
    return true;
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

  const handleOpenContractCreate = () => {
    resetContractForm();
    setTab('contracts');
    setContractDialogOpen(true);
  };

  const handleOpenDocumentCreate = () => {
    resetDocumentForm();
    setTab('documents');
    setDocumentDialogOpen(true);
  };

  const handleOpenContactCreate = () => {
    resetContactForm();
    setTab('contacts');
    setContactDialogOpen(true);
  };

  const handleEditContract = async (id: number) => {
    try {
      // 编辑前先拉详情，避免列表字段裁剪导致表单回显不完整。
      const detail = await getEmployeeContract(id);
      setContractEditingId(id);
      setContractForm({
        contractType: detail.contractType || 'LABOR',
        contractNo: detail.contractNo || '',
        signDate: toDateInputValue(detail.signDate),
        startDate: toDateInputValue(detail.startDate),
        endDate: toDateInputValue(detail.endDate),
        duration: detail.duration == null ? '' : String(detail.duration),
        fileUrl: detail.fileUrl || '',
        status: detail.status || 'DRAFT',
      });
      setTab('contracts');
      setContractDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('合同详情获取失败');
    }
  };

  const handleEditDocument = async (id: number) => {
    try {
      const detail = await getEmployeeDocument(id);
      setDocumentEditingId(id);
      setDocumentForm({
        documentType: detail.documentType || 'ID_CARD',
        documentNo: detail.documentNo || '',
        issueDate: toDateInputValue(detail.issueDate),
        expiryDate: toDateInputValue(detail.expiryDate),
        fileUrl: detail.fileUrl || '',
      });
      setTab('documents');
      setDocumentDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('证件详情获取失败');
    }
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
      setTab('contacts');
      setContactDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error('紧急联系人详情获取失败');
    }
  };

  const handleSubmitContract = async () => {
    if (!selectedEmployeeId || !validateContractForm()) return;

    const payload = {
      contractType: contractForm.contractType,
      contractNo: contractForm.contractNo.trim(),
      signDate: contractForm.signDate,
      startDate: contractForm.startDate,
      endDate: contractForm.endDate,
      duration: contractForm.duration ? Number(contractForm.duration) : null,
      fileUrl: contractForm.fileUrl.trim() || null,
      status: contractForm.status || null,
    };

    setSaveKind('contracts');
    try {
      if (contractEditingId) {
        await updateEmployeeContract(contractEditingId, payload);
        toast.success('员工合同已更新');
      } else {
        await createEmployeeContract({ employeeId: selectedEmployeeId, ...payload });
        toast.success('员工合同已创建');
      }
      closeContractDialog();
      await loadEmployeeContracts(selectedEmployeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '合同保存失败');
    } finally {
      setSaveKind(null);
    }
  };

  const handleSubmitDocument = async () => {
    if (!selectedEmployeeId || !validateDocumentForm()) return;

    const payload = {
      documentType: documentForm.documentType,
      documentNo: documentForm.documentNo.trim(),
      issueDate: documentForm.issueDate || null,
      expiryDate: documentForm.expiryDate || null,
      fileUrl: documentForm.fileUrl.trim() || null,
    };

    setSaveKind('documents');
    try {
      if (documentEditingId) {
        await updateEmployeeDocument(documentEditingId, payload);
        toast.success('员工证件已更新');
      } else {
        await createEmployeeDocument({ employeeId: selectedEmployeeId, ...payload });
        toast.success('员工证件已创建');
      }
      closeDocumentDialog();
      await loadEmployeeDocuments(selectedEmployeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '证件保存失败');
    } finally {
      setSaveKind(null);
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

  const requestDeleteContract = (item: EmployeeContract) => {
    if (!canDeleteContract(item)) {
      toast.error('只有草稿合同才能删除');
      return;
    }
    setPendingDelete({
      kind: 'contract',
      id: item.id,
      label: `合同“${item.contractNo}”`,
    });
  };

  const requestDeleteDocument = (item: EmployeeDocument) => {
    setPendingDelete({
      kind: 'document',
      id: item.id,
      label: `证件“${item.documentNo}”`,
    });
  };

  const requestDeleteContact = (item: EmergencyContact) => {
    setPendingDelete({
      kind: 'contact',
      id: item.id,
      label: `紧急联系人“${item.contactName}”`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !selectedEmployeeId) return;

    setDeleteLoading(true);
    try {
      switch (pendingDelete.kind) {
        case 'contract':
          await deleteEmployeeContract(pendingDelete.id);
          toast.success('员工合同已删除');
          if (contractEditingId === pendingDelete.id) {
            closeContractDialog();
          }
          await loadEmployeeContracts(selectedEmployeeId);
          break;
        case 'document':
          await deleteEmployeeDocument(pendingDelete.id);
          toast.success('员工证件已删除');
          if (documentEditingId === pendingDelete.id) {
            closeDocumentDialog();
          }
          await loadEmployeeDocuments(selectedEmployeeId);
          break;
        case 'contact':
          await deleteEmergencyContact(pendingDelete.id);
          toast.success('紧急联系人已删除');
          if (contactEditingId === pendingDelete.id) {
            closeContactDialog();
          }
          await loadEmployeeContacts(selectedEmployeeId);
          break;
        default:
          break;
      }
      setPendingDelete(null);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '删除失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    // 切换员工时统一清空三类子档案表单和确认状态，避免把上一位员工的数据继续带到当前员工。
    closeContractDialog();
    closeDocumentDialog();
    closeContactDialog();
    setPendingDelete(null);

    if (!selectedEmployeeId) {
      setEmployeeDetail(null);
      setContracts([]);
      setDocuments([]);
      setContacts([]);
      return;
    }

    void refreshWorkspace(selectedEmployeeId);
  }, [selectedEmployeeId, employees]);

  if (!selectedEmployeeId) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <InlineState
          title={loading ? '正在准备员工工作区...' : '先选择一位员工'}
          description={loading ? '稍后会自动同步员工详情和附属档案。' : '从上方列表选中员工后，这里会继续维护合同、证件和紧急联系人。'}
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
        displayEmployee?.positionName,
      ]
        .filter(Boolean)
        .join(' / ') || '当前员工暂无完整组织信息');

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
              <Users className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
              Employee Workspace
            </div>
            <h2 className="mt-1.5 truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
              {employeeName}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {employeeMetaLine}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshWorkspace(selectedEmployeeId)}
            >
              <RefreshCcw
                size={14}
                className={`mr-1.5 ${detailLoading || contractsLoading || documentsLoading || contactsLoading ? 'animate-spin' : ''}`}
              />
              刷新档案
            </Button>
            <Button size="sm" onClick={() => onEditEmployee(selectedEmployeeId)}>
              <Edit3 size={14} className="mr-1.5" />
              编辑主档
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <MetaPill className={employeeStatusTone(displayEmployee?.employeeStatus)}>
            {employeeStatusLabel[displayEmployee?.employeeStatus || ''] || textValue(displayEmployee?.employeeStatus)}
          </MetaPill>
          <MetaPill>
            类型 {employeeTypeLabel[displayEmployee?.employeeType || ''] || textValue(displayEmployee?.employeeType)}
          </MetaPill>
          <MetaPill>电话 {textValue(displayEmployee?.phone)}</MetaPill>
          <MetaPill>邮箱 {textValue(displayEmployee?.email)}</MetaPill>
          <MetaPill>入职 {toDateInputValue(displayEmployee?.hireDate) || '-'}</MetaPill>
          <MetaPill>
            档案 合同 {contracts.length} / 证件 {documents.length} / 联系人 {contacts.length}
          </MetaPill>
        </div>

        <div className="p-4">
          <Tabs value={tab} onValueChange={(value) => setTab(value as WorkspaceTab)} className="space-y-4">
            <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
              <TabsTrigger value="contracts" className="flex-1 lg:flex-none">
                合同档案
              </TabsTrigger>
              <TabsTrigger value="documents" className="flex-1 lg:flex-none">
                证件档案
              </TabsTrigger>
              <TabsTrigger value="contacts" className="flex-1 lg:flex-none">
                紧急联系人
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contracts" className="space-y-0">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <FileText className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                      合同档案
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      当前员工已有 {contracts.length} 份合同。仅草稿合同允许删除，生效中合同请走续签或终止流程。
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadEmployeeContracts(selectedEmployeeId)}
                    >
                      <RefreshCcw
                        size={14}
                        className={`mr-1.5 ${contractsLoading ? 'animate-spin' : ''}`}
                      />
                      刷新
                    </Button>
                    <Button size="sm" onClick={handleOpenContractCreate}>
                      <Plus size={14} className="mr-1.5" />
                      新增合同
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table className="min-w-[920px]">
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                      <TableRow>
                        <TableHead>合同编号</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>签订日期</TableHead>
                        <TableHead>合同周期</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>剩余天数</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contractsLoading ? (
                        <TableStateRow
                          colSpan={7}
                          title="正在加载员工合同..."
                          description="稍后会展示当前员工的合同列表。"
                          loading
                        />
                      ) : contracts.length === 0 ? (
                        <TableStateRow
                          colSpan={7}
                          title="当前员工还没有合同档案"
                          description="可以先新增一份合同，再继续维护周期和状态。"
                        />
                      ) : (
                        contracts.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                              {item.contractNo}
                            </TableCell>
                            <TableCell>
                              {item.contractTypeName || contractTypeLabel[item.contractType] || item.contractType}
                            </TableCell>
                            <TableCell>{toDateInputValue(item.signDate) || '-'}</TableCell>
                            <TableCell>
                              {`${toDateInputValue(item.startDate) || '-'} 至 ${toDateInputValue(item.endDate) || '-'}`}
                            </TableCell>
                            <TableCell>
                              <span
                                className={[
                                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                  contractStatusTone(item.status),
                                ].join(' ')}
                              >
                                {item.statusName || contractStatusLabel[item.status || ''] || textValue(item.status)}
                              </span>
                            </TableCell>
                            <TableCell>{item.remainingDays == null ? '-' : `${item.remainingDays} 天`}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => void handleEditContract(item.id)}>
                                  <Edit3 size={14} className="mr-1.5" />
                                  编辑
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canDeleteContract(item)}
                                  onClick={() => requestDeleteContract(item)}
                                >
                                  <Trash2 size={14} className="mr-1.5" />
                                  删除
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="space-y-0">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                      证件档案
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      覆盖身份证、护照、学历和学位等证件信息，便于联调证件详情和删除接口。
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadEmployeeDocuments(selectedEmployeeId)}
                    >
                      <RefreshCcw
                        size={14}
                        className={`mr-1.5 ${documentsLoading ? 'animate-spin' : ''}`}
                      />
                      刷新
                    </Button>
                    <Button size="sm" onClick={handleOpenDocumentCreate}>
                      <Plus size={14} className="mr-1.5" />
                      新增证件
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                      <TableRow>
                        <TableHead>证件类型</TableHead>
                        <TableHead>证件号码</TableHead>
                        <TableHead>签发日期</TableHead>
                        <TableHead>有效期至</TableHead>
                        <TableHead>扫描件</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documentsLoading ? (
                        <TableStateRow
                          colSpan={6}
                          title="正在加载员工证件..."
                          description="稍后会展示当前员工的证件档案。"
                          loading
                        />
                      ) : documents.length === 0 ? (
                        <TableStateRow
                          colSpan={6}
                          title="当前员工还没有证件档案"
                          description="可以先新增一份证件，再继续维护签发日期和附件。"
                        />
                      ) : (
                        documents.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                              {item.documentTypeName || documentTypeLabel[item.documentType] || item.documentType}
                            </TableCell>
                            <TableCell>{item.documentNo}</TableCell>
                            <TableCell>{toDateInputValue(item.issueDate) || '-'}</TableCell>
                            <TableCell>{toDateInputValue(item.expiryDate) || '-'}</TableCell>
                            <TableCell>
                              {item.fileUrl ? (
                                <a
                                  href={item.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                                >
                                  查看附件
                                </a>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => void handleEditDocument(item.id)}>
                                  <Edit3 size={14} className="mr-1.5" />
                                  编辑
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => requestDeleteDocument(item)}>
                                  <Trash2 size={14} className="mr-1.5" />
                                  删除
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="space-y-0">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <Phone className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                      紧急联系人
                    </div>
                    <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                      建议至少维护 1 位主联系人，便于覆盖优先级和联系人详情链路。
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void loadEmployeeContacts(selectedEmployeeId)}
                    >
                      <RefreshCcw
                        size={14}
                        className={`mr-1.5 ${contactsLoading ? 'animate-spin' : ''}`}
                      />
                      刷新
                    </Button>
                    <Button size="sm" onClick={handleOpenContactCreate}>
                      <Plus size={14} className="mr-1.5" />
                      新增联系人
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table className="min-w-[860px]">
                    <TableHeader className="bg-slate-50/80 dark:bg-slate-900/60">
                      <TableRow>
                        <TableHead>联系人</TableHead>
                        <TableHead>关系</TableHead>
                        <TableHead>电话</TableHead>
                        <TableHead>优先级</TableHead>
                        <TableHead>地址</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contactsLoading ? (
                        <TableStateRow
                          colSpan={6}
                          title="正在加载紧急联系人..."
                          description="稍后会展示当前员工的联系人档案。"
                          loading
                        />
                      ) : contacts.length === 0 ? (
                        <TableStateRow
                          colSpan={6}
                          title="当前员工还没有紧急联系人"
                          description="可以先新增一位联系人，再继续维护优先级和地址。"
                        />
                      ) : (
                        contacts.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                              {item.contactName}
                            </TableCell>
                            <TableCell>{item.relationshipName || relationshipLabel[item.relationship] || item.relationship}</TableCell>
                            <TableCell>{item.phone}</TableCell>
                            <TableCell>{item.priority ? `P${item.priority}` : '-'}</TableCell>
                            <TableCell>{textValue(item.address)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" onClick={() => void handleEditContact(item.id)}>
                                  <Edit3 size={14} className="mr-1.5" />
                                  编辑
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => requestDeleteContact(item)}>
                                  <Trash2 size={14} className="mr-1.5" />
                                  删除
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <BaseDialog
        open={contractDialogOpen}
        title={contractEditingId ? '编辑员工合同' : '新增员工合同'}
        description="直接写入合同档案，覆盖新增、续签和状态维护。"
        onClose={closeContractDialog}
        maxWidthClassName="max-w-4xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeContractDialog}>
              取消
            </Button>
            <Button disabled={saveKind === 'contracts'} onClick={() => void handleSubmitContract()}>
              {saveKind === 'contracts' ? '保存中...' : contractEditingId ? '保存合同' : '新增合同'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <DialogSection
            title="基础信息"
            description="维护合同类型、编号和当前状态。"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">合同类型</Label>
                <Select
                  value={contractForm.contractType}
                  onValueChange={(value) =>
                    setContractForm((prev) => ({ ...prev, contractType: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LABOR">劳动合同</SelectItem>
                    <SelectItem value="SERVICE">劳务合同</SelectItem>
                    <SelectItem value="INTERN">实习协议</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">合同编号</Label>
                <Input
                  value={contractForm.contractNo}
                  onChange={(event) =>
                    setContractForm((prev) => ({ ...prev, contractNo: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">合同状态</Label>
                <Select
                  value={contractForm.status}
                  onValueChange={(value) =>
                    setContractForm((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">草稿</SelectItem>
                    <SelectItem value="ACTIVE">生效中</SelectItem>
                    <SelectItem value="EXPIRED">已过期</SelectItem>
                    <SelectItem value="TERMINATED">已终止</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogSection>

          <DialogSection
            title="时间与附件"
            description="时间字段用于计算合同周期和剩余天数。"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">签订日期</Label>
                <Input
                  type="date"
                  value={contractForm.signDate}
                  onChange={(event) =>
                    setContractForm((prev) => ({ ...prev, signDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">开始日期</Label>
                <Input
                  type="date"
                  value={contractForm.startDate}
                  onChange={(event) =>
                    setContractForm((prev) => ({ ...prev, startDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">结束日期</Label>
                <Input
                  type="date"
                  value={contractForm.endDate}
                  onChange={(event) =>
                    setContractForm((prev) => ({ ...prev, endDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">合同期限（月）</Label>
                <Input
                  type="number"
                  min="0"
                  value={contractForm.duration}
                  onChange={(event) =>
                    setContractForm((prev) => ({ ...prev, duration: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2 xl:col-span-4">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">附件地址</Label>
                <Input
                  value={contractForm.fileUrl}
                  placeholder="https://..."
                  onChange={(event) =>
                    setContractForm((prev) => ({ ...prev, fileUrl: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>

      <BaseDialog
        open={documentDialogOpen}
        title={documentEditingId ? '编辑员工证件' : '新增员工证件'}
        description="优先覆盖身份证、护照、学历和学位证书等真实业务证件。"
        onClose={closeDocumentDialog}
        maxWidthClassName="max-w-4xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeDocumentDialog}>
              取消
            </Button>
            <Button disabled={saveKind === 'documents'} onClick={() => void handleSubmitDocument()}>
              {saveKind === 'documents' ? '保存中...' : documentEditingId ? '保存证件' : '新增证件'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <DialogSection
            title="证件信息"
            description="维护证件类型、号码和时间字段。"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">证件类型</Label>
                <Select
                  value={documentForm.documentType}
                  onValueChange={(value) =>
                    setDocumentForm((prev) => ({ ...prev, documentType: value }))
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ID_CARD">身份证</SelectItem>
                    <SelectItem value="PASSPORT">护照</SelectItem>
                    <SelectItem value="DIPLOMA">学历证书</SelectItem>
                    <SelectItem value="DEGREE">学位证书</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">证件号码</Label>
                <Input
                  value={documentForm.documentNo}
                  onChange={(event) =>
                    setDocumentForm((prev) => ({ ...prev, documentNo: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">签发日期</Label>
                <Input
                  type="date"
                  value={documentForm.issueDate}
                  onChange={(event) =>
                    setDocumentForm((prev) => ({ ...prev, issueDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">有效期至</Label>
                <Input
                  type="date"
                  value={documentForm.expiryDate}
                  onChange={(event) =>
                    setDocumentForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2 xl:col-span-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">扫描件地址</Label>
                <Input
                  value={documentForm.fileUrl}
                  placeholder="https://..."
                  onChange={(event) =>
                    setDocumentForm((prev) => ({ ...prev, fileUrl: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>

      <BaseDialog
        open={contactDialogOpen}
        title={contactEditingId ? '编辑紧急联系人' : '新增紧急联系人'}
        description="建议至少维护 1 位主联系人，覆盖联系人详情、优先级和删除链路。"
        onClose={closeContactDialog}
        maxWidthClassName="max-w-4xl"
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
        <div className="space-y-4">
          <DialogSection
            title="联系人信息"
            description="维护关系、电话、优先级和联系地址。"
          >
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
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="确认删除"
        message={pendingDelete ? `确认删除${pendingDelete.label}吗？删除后不可恢复。` : ''}
        confirmText={deleteLoading ? '删除中...' : '确认删除'}
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
