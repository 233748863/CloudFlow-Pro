import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle,
  LogIn,
  LogOut,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog, ConfirmDialog, Pagination } from '@/components/common';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import { getErrorMessage } from '@/utils/errorMessage';
import { visitorApi, Visitor } from '../services/api/visitor';
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
  Table,
  TableActionHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';

const STATUS_MAP: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  ARRIVED: '已到访',
  COMPLETED: '已离场',
  CANCELLED: '已取消',
};

const createDefaultForm = (): Visitor => ({
  visitorName: '',
  visitReason: '',
  hostId: 0,
  visitDate: '',
  visitorPhone: '',
  visitorCompany: '',
  visitorCount: 1,
  visitArea: '',
  carPlate: '',
  hostName: '',
});

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}> = ({ title, description, icon, className }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <UserCheck className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
  </div>
);

const TableStateRow: React.FC<{
  colSpan: number;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}> = ({ colSpan, title, description, icon, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <RotateCcw className="h-4 w-4 animate-spin" /> : icon || <UserCheck className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
        {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      </div>
    </td>
  </tr>
);

const getStatusTone = (status: string) => {
  const config: Record<string, string> = {
    PENDING: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
    CONFIRMED: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    ARRIVED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    COMPLETED: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
    CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
  };

  return config[status] || config.PENDING;
};

export const VisitorPage: React.FC = () => {
  const [list, setList] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchParams, setSearchParams] = useState({
    status: '',
    visitorName: '',
    visitDate: '',
    pageNum: 1,
    pageSize: 10,
  });
  const [visitorNameInput, setVisitorNameInput] = useState('');
  const [visitDateInput, setVisitDateInput] = useState('');
  const [total, setTotal] = useState(0);
  const [showDialog, setShowDialog] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Visitor | null>(null);
  const [formData, setFormData] = useState<Visitor>(createDefaultForm());
  const [passVisitor, setPassVisitor] = useState<Visitor | null>(null);
  const [passQrCodeUrl, setPassQrCodeUrl] = useState('');
  const [passQrCodeLoading, setPassQrCodeLoading] = useState(false);
  const [passQrCodeError, setPassQrCodeError] = useState('');

  useEffect(() => {
    void fetchList();
  }, [searchParams]);

  useEffect(() => {
    if (!passVisitor?.visitorId || !passVisitor.passCode) {
      setPassQrCodeUrl('');
      setPassQrCodeError('');
      setPassQrCodeLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl = '';

    const loadQrCode = async () => {
      setPassQrCodeUrl('');
      setPassQrCodeError('');
      setPassQrCodeLoading(true);

      try {
        const blob = await visitorApi.qrCode(passVisitor.visitorId!);
        const contentType = blob.type.toLowerCase();
        if (blob.size === 0) {
          throw new Error('二维码图片为空');
        }
        if (contentType && !contentType.startsWith('image/')) {
          throw new Error('二维码接口未返回图片');
        }
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPassQrCodeUrl(objectUrl);
      } catch (error) {
        if (!cancelled) {
          setPassQrCodeError(getErrorMessage(error, '二维码加载失败'));
        }
      } finally {
        if (!cancelled) {
          setPassQrCodeLoading(false);
        }
      }
    };

    void loadQrCode();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [passVisitor?.visitorId, passVisitor?.passCode]);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await visitorApi.list(searchParams);
      setList(res.records || res.rows || []);
      setTotal(res.total || 0);
    } catch (error) {
      toast.error(getErrorMessage(error, '获取访客列表失败'));
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData(createDefaultForm());
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.visitorName || !formData.visitReason || !formData.visitDate) {
      toast.error('请填写完整信息');
      return;
    }

    try {
      await visitorApi.add(formData);
      toast.success('预约成功');
      setShowDialog(false);
      setFormData(createDefaultForm());
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存失败'));
    }
  };

  const handleConfirm = async (id: number) => {
    try {
      await visitorApi.confirm(id);
      toast.success('已确认');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCheckIn = async (id: number) => {
    try {
      await visitorApi.checkIn(id);
      toast.success('已签到');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCheckOut = async (id: number) => {
    try {
      await visitorApi.checkOut(id);
      toast.success('已签退');
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget?.visitorId) {
      return;
    }

    try {
      await visitorApi.cancel(cancelTarget.visitorId);
      toast.success('已取消');
      setCancelTarget(null);
      void fetchList();
    } catch (error) {
      toast.error(getErrorMessage(error, '操作失败'));
    }
  };

  const applySearch = () => {
    setSearchParams((prev) => ({
      ...prev,
      visitorName: visitorNameInput.trim(),
      visitDate: visitDateInput,
      pageNum: 1,
    }));
  };

  const handleResetFilters = () => {
    setVisitorNameInput('');
    setVisitDateInput('');
    setSearchParams({
      status: '',
      visitorName: '',
      visitDate: '',
      pageNum: 1,
      pageSize: 10,
    });
  };

  const currentStatusLabel = searchParams.status
    ? STATUS_MAP[searchParams.status] || searchParams.status
    : '全部状态';
  const hasActiveFilters = Boolean(searchParams.status || searchParams.visitorName || searchParams.visitDate);

  return (
    <div className="space-y-4">
      <TablePageLayout
        className="gap-3"
        actions={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-slate-900 dark:text-slate-100">共 {total} 条</span>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void fetchList()} disabled={loading}>
                <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
                刷新
              </Button>
              <Button size="sm" onClick={handleAdd}>
                <Plus size={14} className="mr-1.5" />
                新增预约
              </Button>
            </div>
          </div>
        )}
        filters={(
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/88 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1 lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  value={visitorNameInput}
                  onChange={(event) => setVisitorNameInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      applySearch();
                    }
                  }}
                  placeholder="按访客姓名搜索"
                  className="h-10 pl-10"
                />
              </div>

              <div className="w-full sm:w-[170px]">
                <Select
                  value={searchParams.status || 'ALL'}
                  onValueChange={(value) => setSearchParams((prev) => ({
                    ...prev,
                    status: value === 'ALL' ? '' : value,
                    pageNum: 1,
                  }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">全部状态</SelectItem>
                    <SelectItem value="PENDING">待确认</SelectItem>
                    <SelectItem value="CONFIRMED">已确认</SelectItem>
                    <SelectItem value="ARRIVED">已到访</SelectItem>
                    <SelectItem value="COMPLETED">已离场</SelectItem>
                    <SelectItem value="CANCELLED">已取消</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[180px]">
                <DatePicker
                  className="h-10"
                  type="date"
                  value={visitDateInput}
                  onChange={(event) => setVisitDateInput(event.target.value)}
                />
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              {hasActiveFilters
                ? `${currentStatusLabel} / ${searchParams.visitorName || '全部访客'} / ${searchParams.visitDate || '全部日期'}`
                : '全部预约'}
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto lg:justify-start">
              <Button variant="outline" size="sm" onClick={applySearch}>
                <Search size={14} className="mr-1.5" />
                搜索
              </Button>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                清空筛选
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="flex min-h-[40rem] flex-col">
            <div className="overflow-x-auto">
              <Table className="min-w-[1020px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <TableRow className="border-slate-100 bg-transparent hover:bg-transparent dark:border-slate-800">
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">访客</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">单位</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">来访日期</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">被访人</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">来访事由</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">通行码</TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">状态</TableHead>
                    <TableActionHead className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">操作</TableActionHead>
                  </TableRow>
                </TableHeader>

                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={8} title="正在加载访客记录..." loading />
                  ) : list.length === 0 ? (
                    <TableStateRow colSpan={8} title="暂无访客记录" />
                  ) : (
                    list.map((item) => {
                      const tone = getStatusTone(item.status || 'PENDING');

                      return (
                        <TableRow key={item.visitorId} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                          <TableCell className="px-4 py-3 align-top">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.visitorName}
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {item.visitorPhone || '未填写联系电话'}
                            </div>
                          </TableCell>

                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            <span className="inline-flex items-center gap-1">
                              <Building2 size={12} className="text-slate-400 dark:text-slate-500" />
                              {item.visitorCompany || '-'}
                            </span>
                          </TableCell>

                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            {item.visitDate}
                          </TableCell>

                          <TableCell className="px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            {item.hostName || '-'}
                          </TableCell>

                          <TableCell className="max-w-xs px-4 py-3 align-top text-sm text-slate-600 dark:text-slate-300">
                            <span className="line-clamp-1">{item.visitReason}</span>
                          </TableCell>

                          <TableCell className="px-4 py-3 align-top">
                            {item.passCode ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5"
                                onClick={() => setPassVisitor(item)}
                                title={item.passCode}
                              >
                                <QrCode size={14} className="mr-1.5" />
                                查看
                              </Button>
                            ) : (
                              <span className="text-sm text-slate-400 dark:text-slate-500">-</span>
                            )}
                          </TableCell>

                          <TableCell className="px-4 py-3 align-top">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
                              {STATUS_MAP[item.status || 'PENDING'] || item.status}
                            </span>
                          </TableCell>

                          <TableCell className="px-4 py-3 align-top text-right">
                            <TableRowActions
                              align="end"
                              className="gap-1"
                              actions={[
                                {
                                  label: '确认',
                                  icon: <CheckCircle size={14} />,
                                  onClick: () => handleConfirm(item.visitorId!),
                                  tone: 'neutral',
                                  hidden: item.status !== 'PENDING',
                                },
                                {
                                  label: '签到',
                                  icon: <LogIn size={14} />,
                                  onClick: () => handleCheckIn(item.visitorId!),
                                  tone: 'neutral',
                                  hidden: item.status !== 'CONFIRMED',
                                },
                                {
                                  label: '签退',
                                  icon: <LogOut size={14} />,
                                  onClick: () => handleCheckOut(item.visitorId!),
                                  tone: 'neutral',
                                  hidden: item.status !== 'ARRIVED',
                                },
                                {
                                  label: '取消',
                                  icon: <XCircle size={14} />,
                                  onClick: () => setCancelTarget(item),
                                  tone: 'neutral',
                                  hidden: item.status !== 'PENDING' && item.status !== 'CONFIRMED',
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        pagination={(
          total > 0 ? (
            <Pagination
              total={total}
              page={searchParams.pageNum}
              pageSize={searchParams.pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={(page) => setSearchParams((prev) => ({ ...prev, pageNum: page }))}
              onPageSizeChange={() => {}}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={Boolean(passVisitor)}
        title={passVisitor?.passCode || '访客通行码'}
        onClose={() => setPassVisitor(null)}
        maxWidthClassName="max-w-md"
        footer={(
          <Button variant="outline" onClick={() => setPassVisitor(null)}>
            关闭
          </Button>
        )}
      >
        {passVisitor ? (
          <div className="space-y-4 py-1">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              <div className="font-medium text-slate-900 dark:text-slate-100">{passVisitor.visitorName}</div>
              <div className="mt-1 grid gap-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{passVisitor.visitorCompany || '-'}</span>
                <span>{passVisitor.visitDate || '-'} / {passVisitor.hostName || '-'}</span>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-4">
              {passQrCodeLoading ? (
                <div className="flex h-52 w-52 items-center justify-center rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800">
                  <RotateCcw className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : passQrCodeError ? (
                <InlineState
                  title="二维码加载失败"
                  description={passQrCodeError}
                  icon={<QrCode className="h-4 w-4" />}
                  className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
                />
              ) : passQrCodeUrl ? (
                <img
                  src={passQrCodeUrl}
                  alt="访客通行二维码"
                  className="h-52 w-52 rounded-xl border border-slate-200 bg-white p-3"
                />
              ) : null}
              <div className="font-mono text-sm text-slate-500 dark:text-slate-400">
                {passVisitor.passCode || '-'}
              </div>
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={showDialog}
        title="新增访客预约"
        onClose={() => {
          setShowDialog(false);
          setFormData(createDefaultForm());
        }}
        maxWidthClassName="max-w-2xl"
        panelClassName="max-h-[92vh]"
        bodyClassName="max-h-[72vh] overflow-y-auto"
        footer={(
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowDialog(false);
                setFormData(createDefaultForm());
              }}
            >
              取消
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">访客姓名</Label>
            <Input
              type="text"
              value={formData.visitorName}
              onChange={(event) => setFormData({ ...formData, visitorName: event.target.value })}
              placeholder="请输入访客姓名"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">访客电话</Label>
            <Input
              type="text"
              value={formData.visitorPhone || ''}
              onChange={(event) => setFormData({ ...formData, visitorPhone: event.target.value })}
              placeholder="请输入电话号码"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">访客单位</Label>
            <Input
              type="text"
              value={formData.visitorCompany || ''}
              onChange={(event) => setFormData({ ...formData, visitorCompany: event.target.value })}
              placeholder="请输入单位名称"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">来访人数</Label>
            <Input
              type="number"
              value={formData.visitorCount || 1}
              onChange={(event) => setFormData({
                ...formData,
                visitorCount: parseInt(event.target.value, 10) || 1,
              })}
              min="1"
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">来访日期</Label>
            <DatePicker
              className="h-11"
              type="date"
              value={formData.visitDate}
              onChange={(event) => setFormData({ ...formData, visitDate: event.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">车牌号</Label>
            <Input
              type="text"
              value={formData.carPlate || ''}
              onChange={(event) => setFormData({ ...formData, carPlate: event.target.value })}
              placeholder="选填"
              className="h-11"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">被访人姓名</Label>
            <Input
              type="text"
              value={formData.hostName || ''}
              onChange={(event) => setFormData({ ...formData, hostName: event.target.value })}
              placeholder="请输入被访人姓名"
              className="h-11"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">来访事由</Label>
            <Textarea
              className="min-h-[120px]"
              value={formData.visitReason}
              onChange={(event) => setFormData({ ...formData, visitReason: event.target.value })}
              placeholder="请输入来访事由"
            />
          </div>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="取消预约"
        message={cancelTarget ? `确定取消“${cancelTarget.visitorName}”的预约吗？` : '确定取消这条预约吗？'}
        confirmText="取消预约"
        danger
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
};

export default VisitorPage;

