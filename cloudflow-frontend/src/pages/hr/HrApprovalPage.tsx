import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eye, RotateCcw, Timer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  approveHrLeaveApplication,
  approveHrOvertimeApplication,
  HrLeaveApplicationVO,
  HrOvertimeApplicationVO,
  listHrLeaveApplications,
  listHrOvertimeApplications,
  rejectHrLeaveApplication,
  rejectHrOvertimeApplication,
} from '@/services/api/hr';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog } from '@/components/common/BaseDialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Pagination } from '@/components/common/Pagination';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
} from '@/components/common';
import { TableRowActions } from '@/components/common/table-row-actions';

type ApprovalKind = 'LEAVE' | 'OVERTIME';
type ApprovalStatus = '' | 'APPROVING' | 'APPROVED' | 'REJECTED';

interface ApprovalRecord {
  key: string;
  kind: ApprovalKind;
  id: number;
  applicationNo: string;
  employeeName: string;
  typeName: string;
  startTime: string;
  endTime: string;
  durationLabel: string;
  quotaLabel: string;
  reason: string;
  status: string;
  createTime?: string;
  raw: HrLeaveApplicationVO | HrOvertimeApplicationVO;
}

interface ConfirmState {
  action: 'approve' | 'reject';
  record: ApprovalRecord;
}

interface TableStateRowProps {
  colSpan: number;
  title: string;
  loading?: boolean;
}

interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
}

const ALL_FILTER_VALUE = '__all__';

const statusMap: Record<string, string> = {
  DRAFT: '草稿',
  APPROVING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  CANCELLED: '已撤销',
};

const kindMap: Record<ApprovalKind, string> = {
  LEAVE: '休假',
  OVERTIME: '加班',
};

const overtimeTypeMap: Record<string, string> = {
  WORKDAY: '工作日',
  WEEKEND: '周末',
  HOLIDAY: '节假日',
};

const periodTypeMap: Record<string, string> = {
  AM: '上午',
  PM: '下午',
  FULL_DAY: '全天',
};

const TableStateRow: React.FC<TableStateRowProps> = ({ colSpan, title, loading = false }) => (
  <tr className="hover:bg-transparent">
    <td colSpan={colSpan} className="px-4 py-16">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
          {loading ? <Timer className="h-4 w-4 animate-pulse" /> : <ClipboardCheck className="h-4 w-4" />}
        </div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      </div>
    </td>
  </tr>
);

const DetailField: React.FC<DetailFieldProps> = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70">
    <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{label}</div>
    <div className="mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
  </div>
);

const getStatusBadge = (status: string) => {
  const config: Record<string, string> = {
    APPROVING: 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200',
    APPROVED: 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
    REJECTED: 'border border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200',
    CANCELLED: 'border border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${config[status] || config.APPROVING}`}>
      {statusMap[status] || status}
    </span>
  );
};

const formatNumber = (value?: number | null) => {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2).replace(/\.00$/, '') : '0';
};

const formatPeriodType = (periodType?: string) => (periodType ? periodTypeMap[periodType] || periodType : '-');

const mapLeaveRecord = (item: HrLeaveApplicationVO): ApprovalRecord => ({
  key: `LEAVE-${item.id}`,
  kind: 'LEAVE',
  id: item.id,
  applicationNo: item.applicationNo || '-',
  employeeName: item.employeeName || '-',
  typeName: item.leaveTypeName || '-',
  startTime: item.startTime,
  endTime: item.endTime,
  durationLabel: `${formatNumber(item.duration)} 天`,
  quotaLabel: formatPeriodType(item.periodType),
  reason: item.reason || '',
  status: item.status,
  createTime: item.createTime,
  raw: item,
});

const mapOvertimeRecord = (item: HrOvertimeApplicationVO): ApprovalRecord => ({
  key: `OVERTIME-${item.id}`,
  kind: 'OVERTIME',
  id: item.id,
  applicationNo: item.applicationNo || '-',
  employeeName: item.employeeName || '-',
  typeName: overtimeTypeMap[item.overtimeType] || item.overtimeTypeName || item.overtimeType || '-',
  startTime: item.startTime,
  endTime: item.endTime,
  durationLabel: `${formatNumber(item.duration)} 小时`,
  quotaLabel: `${formatNumber(item.quotaAmount)} 天调休`,
  reason: item.reason || '',
  status: item.status,
  createTime: item.createTime,
  raw: item,
});

const getRecordTime = (record: ApprovalRecord) => {
  const timestamp = new Date(record.createTime || record.startTime || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const paginateRecords = (records: ApprovalRecord[], pageNum: number, pageSize: number) => {
  const start = Math.max(pageNum - 1, 0) * pageSize;
  return records.slice(start, start + pageSize);
};

const renderDetailValue = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
};

const HrApprovalPage: React.FC = () => {
  const [records, setRecords] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ApprovalStatus>('APPROVING');
  const [kind, setKind] = useState<ApprovalKind | ''>('');
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailRecord, setDetailRecord] = useState<ApprovalRecord | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const normalizedStatus = status || undefined;
      const [leavePage, overtimeList] = await Promise.all([
        listHrLeaveApplications({
          status: normalizedStatus,
          pageNum: 1,
          pageSize: 200,
        }),
        listHrOvertimeApplications({
          status: normalizedStatus,
        }),
      ]);
      const nextRecords = [
        ...(leavePage.records || []).map(mapLeaveRecord),
        ...(overtimeList || []).map(mapOvertimeRecord),
      ].sort((left, right) => getRecordTime(right) - getRecordTime(left));
      setRecords(nextRecords);
    } catch (error) {
      toast.error(getErrorMessage(error, '加载审批列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, [status]);

  useEffect(() => {
    setPageNum(1);
  }, [kind, status]);

  const filteredRecords = useMemo(
    () => (kind ? records.filter((item) => item.kind === kind) : records),
    [kind, records],
  );

  const pageRecords = useMemo(
    () => paginateRecords(filteredRecords, pageNum, pageSize),
    [filteredRecords, pageNum, pageSize],
  );

  const pendingCount = records.filter((item) => item.status === 'APPROVING').length;
  const leaveCount = filteredRecords.filter((item) => item.kind === 'LEAVE').length;
  const overtimeCount = filteredRecords.filter((item) => item.kind === 'OVERTIME').length;

  const handleConfirmAction = async () => {
    if (!confirmState) return;
    const { action, record } = confirmState;
    try {
      if (record.kind === 'LEAVE') {
        if (action === 'approve') {
          await approveHrLeaveApplication(record.id);
        } else {
          await rejectHrLeaveApplication(record.id);
        }
      } else if (action === 'approve') {
        await approveHrOvertimeApplication(record.id);
      } else {
        await rejectHrOvertimeApplication(record.id);
      }
      toast.success(action === 'approve' ? '已通过' : '已驳回');
      setConfirmState(null);
      setDetailRecord(null);
      await loadRecords();
    } catch (error) {
      toast.error(getErrorMessage(error, action === 'approve' ? '通过失败' : '驳回失败'));
    }
  };

  const statusFilters: Array<{ label: string; value: ApprovalStatus }> = [
    { label: '待审核', value: 'APPROVING' },
    { label: '已通过', value: 'APPROVED' },
    { label: '已驳回', value: 'REJECTED' },
    { label: '全部', value: '' },
  ];

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <ClipboardCheck className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          HR Approvals
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          人事审批
        </h1>
      </div>

      <TablePageLayout
        className="gap-4"
        filters={(
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.value || 'all'}
                  variant={status === filter.value ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setStatus(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
              <div className="w-full sm:w-[180px]">
                <Select
                  value={kind || ALL_FILTER_VALUE}
                  onValueChange={(value) => setKind(value === ALL_FILTER_VALUE ? '' : value as ApprovalKind)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="按类型筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>全部类型</SelectItem>
                    <SelectItem value="LEAVE">休假</SelectItem>
                    <SelectItem value="OVERTIME">加班</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {`共 ${filteredRecords.length} 条 · 待审核 ${pendingCount} · 休假 ${leaveCount} · 加班 ${overtimeCount}`}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadRecords()} disabled={loading}>
              <RotateCcw size={14} className={loading ? 'mr-1.5 animate-spin' : 'mr-1.5'} />
              刷新
            </Button>
          </div>
        )}
        table={(
          <div className="flex min-h-[36rem] flex-col">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px]">
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-slate-950/95">
                  <tr>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      类型
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      申请单号
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      申请人
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      申请内容
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      时间区间
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      时长/额度
                    </TableHead>
                    <TableHead className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      状态
                    </TableHead>
                    <TableActionHead className="w-44 px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      当前操作
                    </TableActionHead>
                  </tr>
                </TableHeader>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <TableStateRow colSpan={8} title="正在加载审批列表..." loading />
                  ) : pageRecords.length === 0 ? (
                    <TableStateRow colSpan={8} title="暂无审批记录" />
                  ) : (
                    pageRecords.map((item) => (
                      <tr key={item.key} className="transition hover:bg-slate-50 dark:hover:bg-slate-900/60">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {kindMap[item.kind]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100">
                          {item.applicationNo}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {item.employeeName}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          {item.typeName}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          <div>{formatDateTimeDisplay(item.startTime)}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{formatDateTimeDisplay(item.endTime)}</div>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300">
                          <div>{item.durationLabel}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{item.quotaLabel}</div>
                        </td>
                        <td className="px-4 py-2.5">{getStatusBadge(item.status)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <TableRowActions
                            align="end"
                            className="gap-1"
                            iconOnly
                            actions={[
                              {
                                label: '详情',
                                icon: <Eye size={14} />,
                                onClick: () => setDetailRecord(item),
                                tone: 'neutral',
                                className: 'rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950',
                              },
                              {
                                label: '通过',
                                icon: <CheckCircle2 size={14} />,
                                onClick: () => setConfirmState({ action: 'approve', record: item }),
                                hidden: item.status !== 'APPROVING',
                                tone: 'success',
                                className: 'rounded-lg',
                              },
                              {
                                label: '驳回',
                                icon: <XCircle size={14} />,
                                onClick: () => setConfirmState({ action: 'reject', record: item }),
                                hidden: item.status !== 'APPROVING',
                                tone: 'danger',
                                className: 'rounded-lg',
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        pagination={(
          filteredRecords.length > 0 ? (
            <Pagination
              total={filteredRecords.length}
              page={pageNum}
              pageSize={pageSize}
              showPageSizeSelector={false}
              showJump={false}
              onPageChange={setPageNum}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPageNum(1);
              }}
            />
          ) : null
        )}
      />

      <BaseDialog
        open={Boolean(detailRecord)}
        title={detailRecord?.applicationNo || '审批详情'}
        onClose={() => setDetailRecord(null)}
        width="wide"
        headerAside={detailRecord ? getStatusBadge(detailRecord.status) : null}
        bodyClassName="space-y-4"
        footer={(
          <>
            {detailRecord?.status === 'APPROVING' ? (
              <>
                <Button variant="outline" onClick={() => setConfirmState({ action: 'reject', record: detailRecord })}>
                  驳回
                </Button>
                <Button onClick={() => setConfirmState({ action: 'approve', record: detailRecord })}>
                  通过
                </Button>
              </>
            ) : null}
            <Button variant="outline" onClick={() => setDetailRecord(null)}>
              关闭
            </Button>
          </>
        )}
      >
        {detailRecord ? (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <DetailField label="申请类型" value={kindMap[detailRecord.kind]} />
              <DetailField label="申请人" value={renderDetailValue(detailRecord.employeeName)} />
              <DetailField label="申请内容" value={renderDetailValue(detailRecord.typeName)} />
              <DetailField label="开始时间" value={formatDateTimeDisplay(detailRecord.startTime)} />
              <DetailField label="结束时间" value={formatDateTimeDisplay(detailRecord.endTime)} />
              <DetailField label="时长" value={detailRecord.durationLabel} />
              <DetailField label="额度/时段" value={detailRecord.quotaLabel} />
              <DetailField label="状态" value={statusMap[detailRecord.status] || detailRecord.status} />
              <DetailField label="创建时间" value={formatDateTimeDisplay(detailRecord.createTime)} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">申请事由</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                {detailRecord.reason || '-'}
              </div>
            </div>
          </>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.action === 'approve' ? '通过申请' : '驳回申请'}
        message={confirmState ? `确认${confirmState.action === 'approve' ? '通过' : '驳回'} ${kindMap[confirmState.record.kind]}申请 ${confirmState.record.applicationNo}？` : ''}
        confirmText={confirmState?.action === 'approve' ? '通过' : '驳回'}
        danger={confirmState?.action === 'reject'}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default HrApprovalPage;
