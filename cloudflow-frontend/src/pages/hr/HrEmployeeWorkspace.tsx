import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  Edit3,
  FileText,
  MapPin,
  Paperclip,
  Phone,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import {
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common';
import { FileUpload } from '@/components/FileUpload';
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
import { normalizeAttachmentUrls } from '@/utils/attachment';

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
  attachmentValue: string;
  status: string;
}

interface DocumentFormState {
  documentType: string;
  documentNo: string;
  issueDate: string;
  expiryDate: string;
  attachmentValue: string;
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
  attachmentValue: '',
  status: 'DRAFT',
};

const defaultDocumentForm: DocumentFormState = {
  documentType: 'ID_CARD',
  documentNo: '',
  issueDate: '',
  expiryDate: '',
  attachmentValue: '',
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

type AttachmentValue = string[] | string | null | undefined;

const splitAttachmentValue = (value?: string | null) =>
  normalizeAttachmentUrls(value);

const mergeAttachmentValue = (attachmentUrls?: AttachmentValue) => {
  const normalizedUrls = new Set<string>();
  const urls = Array.isArray(attachmentUrls)
    ? attachmentUrls
    : splitAttachmentValue(typeof attachmentUrls === 'string' ? attachmentUrls : '');
  urls.forEach((url) => {
    if (url?.trim()) {
      normalizedUrls.add(url.trim());
    }
  });
  return Array.from(normalizedUrls).join(',');
};

const getAttachmentList = (attachmentUrls?: AttachmentValue) =>
  splitAttachmentValue(mergeAttachmentValue(attachmentUrls));

const getAttachmentCount = (attachmentUrls?: AttachmentValue) =>
  getAttachmentList(attachmentUrls).length;

const AttachmentLinks = ({
  attachmentUrls,
}: {
  attachmentUrls?: AttachmentValue;
}) => {
  const attachmentList = getAttachmentList(attachmentUrls);
  if (attachmentList.length === 0) {
    return <span>-</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {attachmentList.slice(0, 2).map((url, index) => (
        <a
          key={`${url}-${index}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
        >
          {`附件${index + 1}`}
        </a>
      ))}
      {attachmentList.length > 2 ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">{`+${attachmentList.length - 2}`}</span>
      ) : null}
    </div>
  );
};

const canDeleteContract = (contract?: EmployeeContract | null) =>
  String(contract?.status || '').toUpperCase() === 'DRAFT';

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

const DialogSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const DetailField = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="min-w-0">
    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const ArchiveCardField = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) => (
  <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/80 px-3.5 py-3 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/30">
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      {icon}
      <span>{label}</span>
    </div>
    <div className="mt-2 break-words text-sm font-medium leading-5 text-slate-900 dark:text-slate-100">
      {value}
    </div>
  </div>
);

const contractDateRangeLabel = (contract: EmployeeContract) =>
  `${toDateInputValue(contract.startDate) || '-'} \u81f3 ${toDateInputValue(contract.endDate) || '-'}`;

const contractRemainingTone = (contract: EmployeeContract) => {
  if (contract.status === 'ACTIVE' && contract.remainingDays != null) {
    if (contract.remainingDays <= 30) {
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
    }
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
  }

  if (contract.status === 'EXPIRED') {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }

  if (contract.status === 'TERMINATED') {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }

  return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const contractRemainingLabel = (contract: EmployeeContract) => {
  if (contract.status === 'EXPIRED') {
    return '\u5df2\u5230\u671f';
  }
  if (contract.status === 'TERMINATED') {
    return '\u5df2\u7ec8\u6b62';
  }
  if (contract.remainingDays == null) {
    return '\u672a\u8ba1\u7b97\u5269\u4f59\u5929\u6570';
  }
  return `\u5269\u4f59 ${contract.remainingDays} \u5929`;
};

const getDateRemainingDays = (value?: string | null) => {
  const normalizedDate = toDateInputValue(value);
  if (!normalizedDate) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(`${normalizedDate}T00:00:00`).getTime();
  if (Number.isNaN(target)) {
    return null;
  }

  return Math.floor((target - today) / 86400000);
};

const documentExpiryTone = (document: EmployeeDocument) => {
  const remainingDays = getDateRemainingDays(document.expiryDate);
  if (remainingDays == null) {
    return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }
  if (remainingDays < 0) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200';
  }
  if (remainingDays <= 30) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
};

const documentExpiryLabel = (document: EmployeeDocument) => {
  const expiryDate = toDateInputValue(document.expiryDate);
  const remainingDays = getDateRemainingDays(document.expiryDate);
  if (!expiryDate) {
    return '\u672a\u8bbe\u7f6e\u6709\u6548\u671f';
  }
  if (remainingDays == null) {
    return `\u6709\u6548\u671f\u81f3 ${expiryDate}`;
  }
  if (remainingDays < 0) {
    return `\u5df2\u8fc7\u671f ${Math.abs(remainingDays)} \u5929`;
  }
  if (remainingDays === 0) {
    return '\u4eca\u65e5\u5230\u671f';
  }
  return `\u8ddd\u5230\u671f ${remainingDays} \u5929`;
};

const contactPriorityTone = (priority?: number | null) => {
  if (priority === 1) {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
  }
  if (priority === 2) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
};

const contactPriorityLabel = (priority?: number | null) =>
  priority ? `P${priority} \u4f18\u5148\u8054\u7cfb` : '\u672a\u8bbe\u7f6e\u4f18\u5148\u7ea7';

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
      toast.error(getErrorMessage(error, '员工详情加载失败'));
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
      toast.error(getErrorMessage(error, '员工合同加载失败'));
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
      toast.error(getErrorMessage(error, '员工证件加载失败'));
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
      toast.error(getErrorMessage(error, '紧急联系人加载失败'));
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
      const detail = await getEmployeeContract(id);
      setContractEditingId(id);
      setContractForm({
        contractType: detail.contractType || 'LABOR',
        contractNo: detail.contractNo || '',
        signDate: toDateInputValue(detail.signDate),
        startDate: toDateInputValue(detail.startDate),
        endDate: toDateInputValue(detail.endDate),
        duration: detail.duration == null ? '' : String(detail.duration),
        attachmentValue: mergeAttachmentValue(detail.attachmentUrls),
        status: detail.status || 'DRAFT',
      });
      setTab('contracts');
      setContractDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '合同详情获取失败'));
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
        attachmentValue: mergeAttachmentValue(detail.attachmentUrls),
      });
      setTab('documents');
      setDocumentDialogOpen(true);
    } catch (error) {
      console.error(error);
      toast.error(getErrorMessage(error, '证件详情获取失败'));
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
      toast.error(getErrorMessage(error, '紧急联系人详情获取失败'));
    }
  };

  const handleSubmitContract = async () => {
    if (!selectedEmployeeId || !validateContractForm()) return;

    const attachmentUrls = splitAttachmentValue(contractForm.attachmentValue);
    const payload = {
      contractType: contractForm.contractType,
      contractNo: contractForm.contractNo.trim(),
      signDate: contractForm.signDate,
      startDate: contractForm.startDate,
      endDate: contractForm.endDate,
      duration: contractForm.duration ? Number(contractForm.duration) : null,
      attachmentUrls,
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

    const attachmentUrls = splitAttachmentValue(documentForm.attachmentValue);
    const payload = {
      documentType: documentForm.documentType,
      documentNo: documentForm.documentNo.trim(),
      issueDate: documentForm.issueDate || null,
      expiryDate: documentForm.expiryDate || null,
      attachmentUrls,
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
        displayEmployee?.positionName,
      ]
        .filter(Boolean)
        .join(' / ') || '当前员工暂无完整组织信息');
  const employeeSummaryFields = [
    { label: '工号', value: textValue(displayEmployee?.employeeNo) },
    { label: '部门', value: textValue(displayEmployee?.deptName) },
    { label: '岗位', value: textValue(displayEmployee?.postName) },
    { label: '职位', value: textValue(displayEmployee?.positionName) },
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
    { label: '合同', value: `${contracts.length} 条` },
    { label: '证件 / 联系人', value: `${documents.length} / ${contacts.length}` },
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
                className={`mr-1.5 ${detailLoading || contractsLoading || documentsLoading || contactsLoading ? 'animate-spin' : ''}`}
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
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as WorkspaceTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
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
            </div>

            <TabsContent value="contracts" className="mt-0 flex min-h-0 flex-1 flex-col">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <FileText className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  合同档案
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void loadEmployeeContracts(selectedEmployeeId)}
                  >
                    <RefreshCcw
                      size={14}
                      className={`mr-1.5 ${contractsLoading ? 'animate-spin' : ''}`}
                    />
                    刷新
                  </Button>
                  <Button size="sm" className="h-8" onClick={handleOpenContractCreate}>
                    <Plus size={14} className="mr-1.5" />
                    新增合同
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-4 py-4 dark:bg-slate-950/10">
                {contractsLoading ? (
                  <InlineState
                    title={'\u6b63\u5728\u52a0\u8f7d\u5458\u5de5\u5408\u540c...'}
                    icon={<FileText className="h-4 w-4" />}
                    className="min-h-[260px]"
                  />
                ) : contracts.length === 0 ? (
                  <InlineState
                    title={'\u5f53\u524d\u5458\u5de5\u8fd8\u6ca1\u6709\u5408\u540c\u6863\u6848'}
                    icon={<FileText className="h-4 w-4" />}
                    className="min-h-[260px]"
                  />
                ) : (
                  <div className="flex flex-col gap-3 pb-4">
                    {contracts.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition hover:border-cyan-200 hover:shadow-[0_20px_44px_-28px_rgba(8,145,178,0.35)] dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-cyan-900"
                      >
                        <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-white dark:bg-slate-100 dark:text-slate-900">
                                  {item.contractTypeName || contractTypeLabel[item.contractType] || item.contractType}
                                </span>
                                <div className="break-all text-base font-semibold text-slate-900 dark:text-slate-100">
                                  {item.contractNo}
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={[
                                    'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                                    contractStatusTone(item.status),
                                  ].join(' ')}
                                >
                                  {item.statusName || contractStatusLabel[item.status || ''] || textValue(item.status)}
                                </span>
                                <span
                                  className={[
                                    'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                                    contractRemainingTone(item),
                                  ].join(' ')}
                                >
                                  {contractRemainingLabel(item)}
                                </span>
                                {item.duration != null ? (
                                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                    {`${item.duration} \u4e2a\u6708`}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 sm:justify-end">
                              <Button size="sm" variant="outline" className="h-8 rounded-full px-3" onClick={() => void handleEditContract(item.id)}>
                                <Edit3 size={14} className="mr-1.5" />
                                {'\u7f16\u8f91'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-full px-3"
                                disabled={!canDeleteContract(item)}
                                onClick={() => requestDeleteContract(item)}
                              >
                                <Trash2 size={14} className="mr-1.5" />
                                {'\u5220\u9664'}
                              </Button>
                            </div>
                          </div>

                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <ArchiveCardField
                            label={'\u7b7e\u8ba2\u65e5\u671f'}
                            value={toDateInputValue(item.signDate) || '-'}
                            icon={<CalendarDays className="h-3.5 w-3.5" />}
                          />
                          <ArchiveCardField
                            label={'\u5408\u540c\u5468\u671f'}
                            value={contractDateRangeLabel(item)}
                            icon={<Clock3 className="h-3.5 w-3.5" />}
                          />
                          <ArchiveCardField
                            label={'\u5269\u4f59\u5929\u6570'}
                            value={item.remainingDays == null ? '-' : `${item.remainingDays} \u5929`}
                            icon={<Clock3 className="h-3.5 w-3.5" />}
                          />
                          <ArchiveCardField
                            label={'\u5408\u540c\u9644\u4ef6'}
                            value={<AttachmentLinks attachmentUrls={item.attachmentUrls} />}
                            icon={<Paperclip className="h-3.5 w-3.5" />}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="documents" className="mt-0 flex min-h-0 flex-1 flex-col">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <ShieldCheck className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  证件档案
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void loadEmployeeDocuments(selectedEmployeeId)}
                  >
                    <RefreshCcw
                      size={14}
                      className={`mr-1.5 ${documentsLoading ? 'animate-spin' : ''}`}
                    />
                    刷新
                  </Button>
                  <Button size="sm" className="h-8" onClick={handleOpenDocumentCreate}>
                    <Plus size={14} className="mr-1.5" />
                    新增证件
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-4 py-4 dark:bg-slate-950/10">
                {documentsLoading ? (
                  <InlineState
                    title="正在加载员工证件..."
                    icon={<ShieldCheck className="h-4 w-4" />}
                    className="min-h-[260px]"
                  />
                ) : documents.length === 0 ? (
                  <InlineState
                    title="当前员工还没有证件档案"
                    icon={<ShieldCheck className="h-4 w-4" />}
                    className="min-h-[260px]"
                  />
                ) : (
                  <div className="flex flex-col gap-3 pb-4">
                    {documents.map((item) => {
                      const attachmentCount = getAttachmentCount(item.attachmentUrls);

                      return (
                        <article
                          key={item.id}
                          className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition hover:border-cyan-200 hover:shadow-[0_20px_44px_-28px_rgba(8,145,178,0.35)] dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-cyan-900"
                        >
                          <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-white dark:bg-slate-100 dark:text-slate-900">
                                    {item.documentTypeName || documentTypeLabel[item.documentType] || item.documentType}
                                  </span>
                                  <div className="break-all text-base font-semibold text-slate-900 dark:text-slate-100">
                                    {item.documentNo}
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <span
                                    className={[
                                      'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                                      documentExpiryTone(item),
                                    ].join(' ')}
                                  >
                                    {documentExpiryLabel(item)}
                                  </span>
                                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                                    {attachmentCount ? `${attachmentCount} 个附件` : '无附件'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2 sm:justify-end">
                                <Button size="sm" variant="outline" className="h-8 rounded-full px-3" onClick={() => void handleEditDocument(item.id)}>
                                  <Edit3 size={14} className="mr-1.5" />
                                  编辑
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 rounded-full px-3" onClick={() => requestDeleteDocument(item)}>
                                  <Trash2 size={14} className="mr-1.5" />
                                  删除
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <ArchiveCardField
                              label="证件号码"
                              value={item.documentNo}
                              icon={<FileText className="h-3.5 w-3.5" />}
                            />
                            <ArchiveCardField
                              label="签发日期"
                              value={toDateInputValue(item.issueDate) || '-'}
                              icon={<CalendarDays className="h-3.5 w-3.5" />}
                            />
                            <ArchiveCardField
                              label="有效期至"
                              value={toDateInputValue(item.expiryDate) || '-'}
                              icon={<Clock3 className="h-3.5 w-3.5" />}
                            />
                            <ArchiveCardField
                              label="扫描件"
                              value={<AttachmentLinks attachmentUrls={item.attachmentUrls} />}
                              icon={<Paperclip className="h-3.5 w-3.5" />}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="contacts" className="mt-0 flex min-h-0 flex-1 flex-col">
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
                        className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition hover:border-cyan-200 hover:shadow-[0_20px_44px_-28px_rgba(8,145,178,0.35)] dark:border-slate-800 dark:bg-slate-950/50 dark:hover:border-cyan-900"
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
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <BaseDialog
        open={contractDialogOpen}
        title={contractEditingId ? '编辑员工合同' : '新增员工合同'}
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
          <DialogSection title="基础信息">
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

          <DialogSection title="时间与附件">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">签订日期</Label>
                <DatePicker
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
                <DatePicker
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
                <DatePicker
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
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">合同附件</Label>
                <FileUpload
                  value={contractForm.attachmentValue}
                  onChange={(value) =>
                    setContractForm((prev) => ({ ...prev, attachmentValue: value }))
                  }
                  maxCount={5}
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>

      <BaseDialog
        open={documentDialogOpen}
        title={documentEditingId ? '编辑员工证件' : '新增员工证件'}
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
          <DialogSection title="证件信息">
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
                <DatePicker
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
                <DatePicker
                  type="date"
                  value={documentForm.expiryDate}
                  onChange={(event) =>
                    setDocumentForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
              <div className="space-y-2 xl:col-span-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">扫描件</Label>
                <FileUpload
                  value={documentForm.attachmentValue}
                  onChange={(value) =>
                    setDocumentForm((prev) => ({ ...prev, attachmentValue: value }))
                  }
                  maxCount={5}
                />
              </div>
            </div>
          </DialogSection>
        </div>
      </BaseDialog>

      <BaseDialog
        open={contactDialogOpen}
        title={contactEditingId ? '编辑紧急联系人' : '新增紧急联系人'}
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
