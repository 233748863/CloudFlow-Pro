import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, FileText, Phone, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
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
import { WorkspaceMetricCard, WorkspaceSectionCard } from '@/components/workspace/WorkspacePanels';
import { WorkspaceTableStateRow } from '@/components/workspace/WorkspacePrimitives';
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

const textValue = (value?: string | number | null) => value == null || value === '' ? '-' : String(value);

const canDeleteContract = (contract?: EmployeeContract | null) =>
  String(contract?.status || '').toUpperCase() === 'DRAFT';

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
  const [contractEditingId, setContractEditingId] = useState<number | null>(null);
  const [documentEditingId, setDocumentEditingId] = useState<number | null>(null);
  const [contactEditingId, setContactEditingId] = useState<number | null>(null);
  const [contractForm, setContractForm] = useState<ContractFormState>(defaultContractForm);
  const [documentForm, setDocumentForm] = useState<DocumentFormState>(defaultDocumentForm);
  const [contactForm, setContactForm] = useState<ContactFormState>(defaultContactForm);

  const currentEmployee = useMemo(
    () => employees.find(item => item.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

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
    if (documentForm.issueDate && documentForm.expiryDate && documentForm.expiryDate < documentForm.issueDate) {
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
    } catch (error) {
      console.error(error);
      toast.error('合同详情获取失败');
    }
  };

  const handleSubmitContract = async () => {
    if (!selectedEmployeeId || !validateContractForm()) {
      return;
    }

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

    try {
      if (contractEditingId) {
        await updateEmployeeContract(contractEditingId, payload);
        toast.success('员工合同已更新');
      } else {
        await createEmployeeContract({ employeeId: selectedEmployeeId, ...payload });
        toast.success('员工合同已创建');
      }
      resetContractForm();
      await loadEmployeeContracts(selectedEmployeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '合同保存失败');
    }
  };

  const handleDeleteContract = async (item: EmployeeContract) => {
    if (!canDeleteContract(item)) {
      toast.error('只有草稿合同才能删除');
      return;
    }
    if (!window.confirm(`确认删除合同“${item.contractNo}”吗？`)) {
      return;
    }
    try {
      await deleteEmployeeContract(item.id);
      toast.success('员工合同已删除');
      if (contractEditingId === item.id) {
        resetContractForm();
      }
      if (selectedEmployeeId) {
        await loadEmployeeContracts(selectedEmployeeId);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '合同删除失败');
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
    } catch (error) {
      console.error(error);
      toast.error('证件详情获取失败');
    }
  };

  const handleSubmitDocument = async () => {
    if (!selectedEmployeeId || !validateDocumentForm()) {
      return;
    }

    const payload = {
      documentType: documentForm.documentType,
      documentNo: documentForm.documentNo.trim(),
      issueDate: documentForm.issueDate || null,
      expiryDate: documentForm.expiryDate || null,
      fileUrl: documentForm.fileUrl.trim() || null,
    };

    try {
      if (documentEditingId) {
        await updateEmployeeDocument(documentEditingId, payload);
        toast.success('员工证件已更新');
      } else {
        await createEmployeeDocument({ employeeId: selectedEmployeeId, ...payload });
        toast.success('员工证件已创建');
      }
      resetDocumentForm();
      await loadEmployeeDocuments(selectedEmployeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '证件保存失败');
    }
  };

  const handleDeleteDocument = async (item: EmployeeDocument) => {
    if (!window.confirm(`确认删除证件“${item.documentNo}”吗？`)) {
      return;
    }
    try {
      await deleteEmployeeDocument(item.id);
      toast.success('员工证件已删除');
      if (documentEditingId === item.id) {
        resetDocumentForm();
      }
      if (selectedEmployeeId) {
        await loadEmployeeDocuments(selectedEmployeeId);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '证件删除失败');
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
    } catch (error) {
      console.error(error);
      toast.error('紧急联系人详情获取失败');
    }
  };

  const handleSubmitContact = async () => {
    if (!selectedEmployeeId || !validateContactForm()) {
      return;
    }

    const payload = {
      contactName: contactForm.contactName.trim(),
      relationship: contactForm.relationship,
      phone: contactForm.phone.trim(),
      address: contactForm.address.trim() || null,
      priority: contactForm.priority ? Number(contactForm.priority) : null,
    };

    try {
      if (contactEditingId) {
        await updateEmergencyContact(contactEditingId, payload);
        toast.success('紧急联系人已更新');
      } else {
        await createEmergencyContact({ employeeId: selectedEmployeeId, ...payload });
        toast.success('紧急联系人已创建');
      }
      resetContactForm();
      await loadEmployeeContacts(selectedEmployeeId);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '紧急联系人保存失败');
    }
  };

  const handleDeleteContact = async (item: EmergencyContact) => {
    if (!window.confirm(`确认删除紧急联系人“${item.contactName}”吗？`)) {
      return;
    }
    try {
      await deleteEmergencyContact(item.id);
      toast.success('紧急联系人已删除');
      if (contactEditingId === item.id) {
        resetContactForm();
      }
      if (selectedEmployeeId) {
        await loadEmployeeContacts(selectedEmployeeId);
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || '紧急联系人删除失败');
    }
  };

  useEffect(() => {
    // 切换员工时立即清空三个子表单，避免把上一位员工的子档案误写到当前员工。
    resetContractForm();
    resetDocumentForm();
    resetContactForm();
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
      <Card className="rounded-3xl border-white/80 bg-white/70 p-8 backdrop-blur-xl">
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center text-sm text-slate-500">
          {loading ? '正在准备员工工作区...' : '先从上方选择一位员工，再维护合同、证件和紧急联系人。'}
        </div>
      </Card>
    );
  }

  return (
    <WorkspaceSectionCard
      title={employeeDetail?.name || currentEmployee?.name || `员工 #${selectedEmployeeId}`}
      description={
        detailLoading
          ? '正在同步员工主档详情...'
          : ([employeeDetail?.employeeNo || currentEmployee?.employeeNo, employeeDetail?.deptName || currentEmployee?.deptName, employeeDetail?.positionName || currentEmployee?.positionName]
              .filter(Boolean)
              .join(' / ') || '当前员工暂无完整组织信息')
      }
      eyebrow="Employee Workspace"
      headerAside={(
        <>
          <Button variant="outline" onClick={() => void refreshWorkspace(selectedEmployeeId)}>
            <RefreshCcw size={14} className="mr-2" />
            刷新工作区
          </Button>
          <Button variant="secondary" onClick={() => onEditEmployee(selectedEmployeeId)}>
            <Edit3 size={14} className="mr-2" />
            编辑主档
          </Button>
        </>
      )}
    >
      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
        <WorkspaceMetricCard
          label="员工状态"
          value={employeeStatusLabel[employeeDetail?.employeeStatus || currentEmployee?.employeeStatus || ''] || textValue(employeeDetail?.employeeStatus || currentEmployee?.employeeStatus)}
          hint={employeeTypeLabel[employeeDetail?.employeeType || currentEmployee?.employeeType || ''] || textValue(employeeDetail?.employeeType || currentEmployee?.employeeType)}
          valueClassName="text-lg"
        />
        <WorkspaceMetricCard
          label="入转离时间"
          value={<div className="text-sm font-medium text-slate-900">入职 {toDateInputValue(employeeDetail?.hireDate || currentEmployee?.hireDate) || '-'}</div>}
          hint={
            <div className="space-y-1">
              <div>转正 {toDateInputValue(employeeDetail?.regularDate) || '-'}</div>
              <div>离职 {toDateInputValue(employeeDetail?.resignDate) || '-'}</div>
            </div>
          }
          valueClassName="text-sm"
        />
        <WorkspaceMetricCard
          label="联系方式"
          value={<div className="text-sm font-medium text-slate-900">{textValue(employeeDetail?.phone || currentEmployee?.phone)}</div>}
          hint={textValue(employeeDetail?.email || currentEmployee?.email)}
          valueClassName="text-sm"
        />
        <WorkspaceMetricCard
          label="附属档案"
          value={<div className="text-sm font-medium text-slate-900">{contracts.length} 份合同 / {documents.length} 份证件</div>}
          hint={`${contacts.length} 位紧急联系人`}
          valueClassName="text-sm"
        />
      </div>

      <Tabs value={tab} onValueChange={value => setTab(value as WorkspaceTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-slate-100/80 p-1">
          <TabsTrigger value="contracts">合同档案</TabsTrigger>
          <TabsTrigger value="documents">证件档案</TabsTrigger>
          <TabsTrigger value="contacts">紧急联系人</TabsTrigger>
        </TabsList>

        <TabsContent value="contracts" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <WorkspaceSectionCard
              title={contractEditingId ? '编辑员工合同' : '新增员工合同'}
              description="直接写入合同档案，适合真实联调合同新增、续签和状态维护。"
              className="border-white/80 bg-white/88"
            >

              <div className="space-y-4">
                <div>
                  <Label>合同类型</Label>
                  <Select value={contractForm.contractType} onValueChange={value => setContractForm(prev => ({ ...prev, contractType: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LABOR">劳动合同</SelectItem>
                      <SelectItem value="SERVICE">劳务合同</SelectItem>
                      <SelectItem value="INTERN">实习协议</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>合同编号</Label>
                  <Input value={contractForm.contractNo} onChange={event => setContractForm(prev => ({ ...prev, contractNo: event.target.value }))} />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>签订日期</Label>
                    <Input type="date" value={contractForm.signDate} onChange={event => setContractForm(prev => ({ ...prev, signDate: event.target.value }))} />
                  </div>
                  <div>
                    <Label>合同期限（月）</Label>
                    <Input type="number" min="0" value={contractForm.duration} onChange={event => setContractForm(prev => ({ ...prev, duration: event.target.value }))} />
                  </div>
                  <div>
                    <Label>开始日期</Label>
                    <Input type="date" value={contractForm.startDate} onChange={event => setContractForm(prev => ({ ...prev, startDate: event.target.value }))} />
                  </div>
                  <div>
                    <Label>结束日期</Label>
                    <Input type="date" value={contractForm.endDate} onChange={event => setContractForm(prev => ({ ...prev, endDate: event.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>合同状态</Label>
                  <Select value={contractForm.status} onValueChange={value => setContractForm(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DRAFT">草稿</SelectItem>
                      <SelectItem value="ACTIVE">生效中</SelectItem>
                      <SelectItem value="EXPIRED">已过期</SelectItem>
                      <SelectItem value="TERMINATED">已终止</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>附件地址</Label>
                  <Input value={contractForm.fileUrl} placeholder="https://..." onChange={event => setContractForm(prev => ({ ...prev, fileUrl: event.target.value }))} />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button variant="outline" onClick={resetContractForm}>重置</Button>
                <Button onClick={() => void handleSubmitContract()}>{contractEditingId ? '保存合同' : '新增合同'}</Button>
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              title="合同列表"
              description={`当前员工已有 ${contracts.length} 份合同。仅草稿合同允许删除，生效中合同请走续签或终止流程。`}
              className="border-white/80 bg-white/88"
              headerAside={(
                <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  {contractsLoading ? '同步中' : `${contracts.length} 条记录`}
                </span>
              )}
            >

              <Table>
                <TableHeader>
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
                  {contracts.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-slate-900">{item.contractNo}</TableCell>
                      <TableCell>{item.contractTypeName || contractTypeLabel[item.contractType] || item.contractType}</TableCell>
                      <TableCell>{toDateInputValue(item.signDate) || '-'}</TableCell>
                      <TableCell>{`${toDateInputValue(item.startDate) || '-'} 至 ${toDateInputValue(item.endDate) || '-'}`}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
                          {item.statusName || contractStatusLabel[item.status || ''] || textValue(item.status)}
                        </span>
                      </TableCell>
                      <TableCell>{item.remainingDays == null ? '-' : `${item.remainingDays} 天`}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => void handleEditContract(item.id)}>
                            <Edit3 size={14} className="mr-1" />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!canDeleteContract(item)}
                            title={canDeleteContract(item) ? '删除草稿合同' : '只有草稿合同才能删除'}
                            onClick={() => void handleDeleteContract(item)}
                          >
                            <Trash2 size={14} className="mr-1" />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {contractsLoading && <WorkspaceTableStateRow colSpan={7} type="loading" title="正在加载员工合同..." />}
                  {!contracts.length && !contractsLoading && <WorkspaceTableStateRow colSpan={7} title="当前员工还没有合同档案" />}
                </TableBody>
              </Table>
            </WorkspaceSectionCard>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <WorkspaceSectionCard
              title={documentEditingId ? '编辑员工证件' : '新增员工证件'}
              description="优先覆盖身份证、护照、学历与学位证书这几类真实业务证件。"
              className="border-white/80 bg-white/88"
              headerAside={<ShieldCheck size={18} className="text-slate-500" />}
            >

              <div className="space-y-4">
                <div>
                  <Label>证件类型</Label>
                  <Select value={documentForm.documentType} onValueChange={value => setDocumentForm(prev => ({ ...prev, documentType: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ID_CARD">身份证</SelectItem>
                      <SelectItem value="PASSPORT">护照</SelectItem>
                      <SelectItem value="DIPLOMA">学历证书</SelectItem>
                      <SelectItem value="DEGREE">学位证书</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>证件号码</Label>
                  <Input value={documentForm.documentNo} onChange={event => setDocumentForm(prev => ({ ...prev, documentNo: event.target.value }))} />
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <Label>签发日期</Label>
                    <Input type="date" value={documentForm.issueDate} onChange={event => setDocumentForm(prev => ({ ...prev, issueDate: event.target.value }))} />
                  </div>
                  <div>
                    <Label>有效期至</Label>
                    <Input type="date" value={documentForm.expiryDate} onChange={event => setDocumentForm(prev => ({ ...prev, expiryDate: event.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>扫描件地址</Label>
                  <Input value={documentForm.fileUrl} placeholder="https://..." onChange={event => setDocumentForm(prev => ({ ...prev, fileUrl: event.target.value }))} />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button variant="outline" onClick={resetDocumentForm}>重置</Button>
                <Button onClick={() => void handleSubmitDocument()}>{documentEditingId ? '保存证件' : '新增证件'}</Button>
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              title="证件列表"
              description="适合联调证件详情接口和删除回收流程。"
              className="border-white/80 bg-white/88"
              headerAside={(
                <span className="inline-flex rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                  {documentsLoading ? '同步中' : `${documents.length} 条记录`}
                </span>
              )}
            >

              <Table>
                <TableHeader>
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
                  {documents.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-slate-900">{item.documentTypeName || documentTypeLabel[item.documentType] || item.documentType}</TableCell>
                      <TableCell>{item.documentNo}</TableCell>
                      <TableCell>{toDateInputValue(item.issueDate) || '-'}</TableCell>
                      <TableCell>{toDateInputValue(item.expiryDate) || '-'}</TableCell>
                      <TableCell>
                        {item.fileUrl ? (
                          <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-pink-500 hover:text-pink-600">
                            查看附件
                          </a>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => void handleEditDocument(item.id)}>
                            <Edit3 size={14} className="mr-1" />
                            编辑
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => void handleDeleteDocument(item)}>
                            <Trash2 size={14} className="mr-1" />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {documentsLoading && <WorkspaceTableStateRow colSpan={6} type="loading" title="正在加载员工证件..." />}
                  {!documents.length && !documentsLoading && <WorkspaceTableStateRow colSpan={6} title="当前员工还没有证件档案" />}
                </TableBody>
              </Table>
            </WorkspaceSectionCard>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <WorkspaceSectionCard
              title={contactEditingId ? '编辑紧急联系人' : '新增紧急联系人'}
              description="建议至少维护 1 位主联系人，真实联调时也能覆盖优先级字段。"
              className="border-white/80 bg-white/88"
              headerAside={<Phone size={18} className="text-slate-500" />}
            >

              <div className="space-y-4">
                <div>
                  <Label>联系人姓名</Label>
                  <Input value={contactForm.contactName} onChange={event => setContactForm(prev => ({ ...prev, contactName: event.target.value }))} />
                </div>
                <div>
                  <Label>关系</Label>
                  <Select value={contactForm.relationship} onValueChange={value => setContactForm(prev => ({ ...prev, relationship: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SPOUSE">配偶</SelectItem>
                      <SelectItem value="PARENT">父母</SelectItem>
                      <SelectItem value="SIBLING">兄弟姐妹</SelectItem>
                      <SelectItem value="CHILD">子女</SelectItem>
                      <SelectItem value="OTHER">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>联系电话</Label>
                  <Input value={contactForm.phone} onChange={event => setContactForm(prev => ({ ...prev, phone: event.target.value }))} />
                </div>
                <div>
                  <Label>优先级</Label>
                  <Select value={contactForm.priority} onValueChange={value => setContactForm(prev => ({ ...prev, priority: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">第一联系人</SelectItem>
                      <SelectItem value="2">第二联系人</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>联系地址</Label>
                  <Input value={contactForm.address} onChange={event => setContactForm(prev => ({ ...prev, address: event.target.value }))} />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button variant="outline" onClick={resetContactForm}>重置</Button>
                <Button onClick={() => void handleSubmitContact()}>{contactEditingId ? '保存联系人' : '新增联系人'}</Button>
              </div>
            </WorkspaceSectionCard>

            <WorkspaceSectionCard
              title="紧急联系人列表"
              description="覆盖联系人详情、编辑和删除接口，确保员工联络信息可维护。"
              className="border-white/80 bg-white/88"
              headerAside={(
                <span className="inline-flex rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                  {contactsLoading ? '同步中' : `${contacts.length} 条记录`}
                </span>
              )}
            >

              <Table>
                <TableHeader>
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
                  {contacts.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-slate-900">{item.contactName}</TableCell>
                      <TableCell>{item.relationshipName || relationshipLabel[item.relationship] || item.relationship}</TableCell>
                      <TableCell>{item.phone}</TableCell>
                      <TableCell>{item.priority ? `P${item.priority}` : '-'}</TableCell>
                      <TableCell>{textValue(item.address)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => void handleEditContact(item.id)}>
                            <Edit3 size={14} className="mr-1" />
                            编辑
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => void handleDeleteContact(item)}>
                            <Trash2 size={14} className="mr-1" />
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {contactsLoading && <WorkspaceTableStateRow colSpan={6} type="loading" title="正在加载紧急联系人..." />}
                  {!contacts.length && !contactsLoading && <WorkspaceTableStateRow colSpan={6} title="当前员工还没有紧急联系人" />}
                </TableBody>
              </Table>
            </WorkspaceSectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </WorkspaceSectionCard>
  );
};

export default HrEmployeeWorkspace;
