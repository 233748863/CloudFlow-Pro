import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Coins, RefreshCcw, Search, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { BaseDialog } from '@/components/common/BaseDialog';
import { TablePageLayout } from '@/components/layout/TablePageLayout';
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
  Textarea,
} from '@/components/ui';
import {
  adjustHrLeaveQuota,
  HrEmployee,
  HrLeaveQuotaInitResult,
  HrLeaveQuotaVO,
  HrLeaveTypeOption,
  initHrLeaveQuota,
  listEmployees,
  listHrLeaveQuotaBuckets,
  listHrLeaveQuotas,
  listHrLeaveTypes,
} from '@/services/api/hr';
import {
  buildEmployeeLabel,
  matchEmployeeKeyword,
  normalizeRows,
  toDateInputValue,
} from './hrShared';

const NEW_BUCKET_VALUE = '__new__';
const COMPENSATORY_CODE = 'COMPENSATORY';
const INIT_RESULT_HISTORY_STORAGE_KEY = 'hr-leave-quota-init-result-history';
const DISMISSED_INIT_RESULT_STORAGE_KEY = 'hr-leave-quota-dismissed-result-keys';

type AdjustFormState = {
  adjustmentAmount: string;
  reason: string;
  bucketId: string;
  bucketYear: string;
  expiryDate: string;
};

const getCurrentYear = () => new Date().getFullYear();

const getCurrentDateInputValue = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const buildYearOptions = (anchorYear: number) =>
  Array.from({ length: 5 }, (_, index) => anchorYear - 2 + index);

const getUnitLabel = (unit?: string | null) => {
  switch (String(unit || '').toUpperCase()) {
    case 'HOUR':
      return '小时';
    case 'DAY':
    default:
      return '天';
  }
};

const formatQuotaNumber = (value?: number | string | null) => {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return '-';
  return numericValue
    .toFixed(Number.isInteger(numericValue) ? 0 : 2)
    .replace(/\.?0+$/, '');
};

const formatQuotaValue = (value?: number | string | null, unit?: string | null) =>
  `${formatQuotaNumber(value)} ${getUnitLabel(unit)}`;

const isCompensatoryLeaveType = (leaveType?: HrLeaveTypeOption | null) =>
  String(leaveType?.leaveCode || '').toUpperCase() === COMPENSATORY_CODE;

const createDefaultAdjustForm = (year: string): AdjustFormState => ({
  adjustmentAmount: '',
  reason: '',
  bucketId: NEW_BUCKET_VALUE,
  bucketYear: year,
  expiryDate: '',
});

const readSessionStorageRecord = <T,>(storageKey: string): Record<string, T> => {
  if (typeof window === 'undefined') return {};
  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    if (!rawValue) return {};
    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === 'object'
      ? (parsedValue as Record<string, T>)
      : {};
  } catch {
    return {};
  }
};

const writeSessionStorageRecord = (storageKey: string, value: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  try {
    if (!Object.keys(value).length) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // 会话缓存写入失败时不影响主流程，只回退为当前页内状态。
  }
};

const bucketStatusToneClassName = (bucket: HrLeaveQuotaVO) => {
  const expiryDate = toDateInputValue(bucket.expiryDate);
  const availableQuota = Number(bucket.availableQuota ?? 0);
  const frozenQuota = Number(bucket.frozenQuota ?? 0);

  if (!expiryDate) {
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300';
  }

  const diffDays = Math.ceil(
    (new Date(`${expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0))
      / (1000 * 60 * 60 * 24),
  );

  if (availableQuota > 0 && diffDays <= 30) {
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
  if (frozenQuota > 0) {
    return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
};

const bucketStatusLabel = (bucket: HrLeaveQuotaVO) => {
  const expiryDate = toDateInputValue(bucket.expiryDate);
  const availableQuota = Number(bucket.availableQuota ?? 0);
  const frozenQuota = Number(bucket.frozenQuota ?? 0);

  if (!expiryDate) {
    return '长期有效';
  }

  const diffDays = Math.ceil(
    (new Date(`${expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0))
      / (1000 * 60 * 60 * 24),
  );

  if (availableQuota > 0 && diffDays <= 30) {
    return diffDays >= 0 ? `${diffDays} 天内到期` : '已到期';
  }
  if (frozenQuota > 0) {
    return '存在冻结';
  }
  return '正常';
};

const initActionToneClassName = (action?: string | null) => {
  switch (String(action || '').toUpperCase()) {
    case 'CREATED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200';
    case 'REFRESHED':
      return 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200';
    case 'SKIPPED':
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200';
  }
};

const initActionLabel = (action?: string | null) => {
  switch (String(action || '').toUpperCase()) {
    case 'CREATED':
      return '新建';
    case 'REFRESHED':
      return '刷新';
    case 'SKIPPED':
    default:
      return '跳过';
  }
};

const InlineState = ({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) => (
  <div
    className={[
      'flex flex-col items-center justify-center px-6 py-10 text-center',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      <Wallet className="h-4 w-4" />
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div>
    ) : null}
    {actions ? <div className="mt-4">{actions}</div> : null}
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

export const HrLeaveQuotaPage: React.FC = () => {
  const currentYear = getCurrentYear();
  const todayDateInputValue = getCurrentDateInputValue();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<HrLeaveTypeOption[]>([]);
  const [quotaSummary, setQuotaSummary] = useState<HrLeaveQuotaVO[]>([]);
  const [quotaBuckets, setQuotaBuckets] = useState<HrLeaveQuotaVO[]>([]);
  const [employeeKeyword, setEmployeeKeyword] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('');
  const [pageLoading, setPageLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [initResultHistory, setInitResultHistory] = useState<Record<string, HrLeaveQuotaInitResult>>(
    () => readSessionStorageRecord<HrLeaveQuotaInitResult>(INIT_RESULT_HISTORY_STORAGE_KEY),
  );
  const [dismissedInitResultKeys, setDismissedInitResultKeys] = useState<Record<string, boolean>>(
    () => readSessionStorageRecord<boolean>(DISMISSED_INIT_RESULT_STORAGE_KEY),
  );
  const [bulkInitDialogOpen, setBulkInitDialogOpen] = useState(false);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>(
    createDefaultAdjustForm(String(currentYear)),
  );

  const yearOptions = useMemo(() => buildYearOptions(currentYear), [currentYear]);

  const quotaEnabledLeaveTypes = useMemo(
    () => leaveTypes.filter((item) => item.needQuota !== false && item.status !== 0),
    [leaveTypes],
  );

  const leaveTypeMap = useMemo(
    () => new Map(quotaEnabledLeaveTypes.map((item) => [item.id, item])),
    [quotaEnabledLeaveTypes],
  );

  const selectedEmployee = useMemo(
    () => employees.find((item) => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  const currentInitResultKey = useMemo(
    () => (selectedEmployeeId && selectedYear ? `${selectedEmployeeId}-${selectedYear}` : ''),
    [selectedEmployeeId, selectedYear],
  );

  const visibleInitResult = useMemo(
    () =>
      currentInitResultKey && !dismissedInitResultKeys[currentInitResultKey]
        ? initResultHistory[currentInitResultKey] || null
        : null,
    [currentInitResultKey, dismissedInitResultKeys, initResultHistory],
  );

  const hiddenInitResult = useMemo(
    () =>
      currentInitResultKey && dismissedInitResultKeys[currentInitResultKey]
        ? initResultHistory[currentInitResultKey] || null
        : null,
    [currentInitResultKey, dismissedInitResultKeys, initResultHistory],
  );

  const filteredEmployees = useMemo(() => {
    const rows = employees.filter((item) => matchEmployeeKeyword(item, employeeKeyword));
    if (!selectedEmployee) return rows;
    if (rows.some((item) => item.id === selectedEmployee.id)) return rows;
    return [selectedEmployee, ...rows];
  }, [employeeKeyword, employees, selectedEmployee]);

  const selectedLeaveType = useMemo(
    () => quotaEnabledLeaveTypes.find((item) => String(item.id) === selectedLeaveTypeId) || null,
    [quotaEnabledLeaveTypes, selectedLeaveTypeId],
  );

  const selectedQuotaSummary = useMemo(
    () => quotaSummary.find((item) => String(item.leaveTypeId) === selectedLeaveTypeId) || null,
    [quotaSummary, selectedLeaveTypeId],
  );

  const selectedBucket = useMemo(
    () => quotaBuckets.find((item) => String(item.id) === adjustForm.bucketId) || null,
    [adjustForm.bucketId, quotaBuckets],
  );

  const newBucketMinExpiryDate = useMemo(() => {
    const bucketYear = Number(adjustForm.bucketYear);
    const yearStart =
      Number.isInteger(bucketYear) && bucketYear > 0
        ? `${bucketYear}-01-01`
        : todayDateInputValue;
    return yearStart > todayDateInputValue ? yearStart : todayDateInputValue;
  }, [adjustForm.bucketYear, todayDateInputValue]);

  useEffect(() => {
    writeSessionStorageRecord(
      INIT_RESULT_HISTORY_STORAGE_KEY,
      initResultHistory as Record<string, unknown>,
    );
  }, [initResultHistory]);

  useEffect(() => {
    writeSessionStorageRecord(
      DISMISSED_INIT_RESULT_STORAGE_KEY,
      dismissedInitResultKeys as Record<string, unknown>,
    );
  }, [dismissedInitResultKeys]);

  const isCompensatorySelected = isCompensatoryLeaveType(selectedLeaveType);
  const selectedQuotaInitialized = selectedQuotaSummary?.id != null;
  const selectedQuotaPendingInit = Boolean(
    selectedQuotaSummary && !selectedQuotaInitialized && !isCompensatorySelected,
  );

  const initializedQuotaCount = useMemo(
    () => quotaSummary.filter((item) => item.id != null).length,
    [quotaSummary],
  );

  const pendingQuotaCount = useMemo(
    () =>
      quotaSummary.filter((item) => {
        const leaveType = leaveTypeMap.get(item.leaveTypeId);
        return item.id == null && !isCompensatoryLeaveType(leaveType);
      }).length,
    [leaveTypeMap, quotaSummary],
  );

  const pendingAnnualQuotaSummaries = useMemo(
    () =>
      quotaSummary.filter((item) => {
        const leaveType = leaveTypeMap.get(item.leaveTypeId);
        return item.id == null && !isCompensatoryLeaveType(leaveType);
      }),
    [leaveTypeMap, quotaSummary],
  );

  const canInitCurrentAnnualQuota = Boolean(
    selectedEmployeeId
      && selectedYear
      && selectedLeaveType
      && !isCompensatorySelected
      && !selectedQuotaInitialized,
  );

  const canInitAllAnnualQuota = Boolean(selectedEmployeeId && selectedYear && pendingQuotaCount > 0);

  const showBulkInitButton =
    canInitAllAnnualQuota && (pendingQuotaCount > 1 || !canInitCurrentAnnualQuota);

  const expiringBucketCount = useMemo(
    () =>
      quotaBuckets.filter((item) => {
        const expiryDate = toDateInputValue(item.expiryDate);
        const availableQuota = Number(item.availableQuota ?? 0);
        if (!expiryDate || availableQuota <= 0) return false;
        const diffDays = Math.ceil(
          (new Date(`${expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0))
            / (1000 * 60 * 60 * 24),
        );
        return diffDays <= 30;
      }).length,
    [quotaBuckets],
  );

  useEffect(() => {
    const bootstrap = async () => {
      setPageLoading(true);
      try {
        const [employeeRes, leaveTypeRes] = await Promise.all([
          listEmployees({ pageNum: 1, pageSize: 200 }),
          listHrLeaveTypes(),
        ]);
        const employeeList = normalizeRows<HrEmployee>(employeeRes);
        const leaveTypeList = (Array.isArray(leaveTypeRes) ? leaveTypeRes : []).filter(
          (item) => item.status !== 0,
        );

        setEmployees(employeeList);
        setLeaveTypes(leaveTypeList);
        setSelectedEmployeeId((prev) =>
          prev && employeeList.some((item) => String(item.id) === prev)
            ? prev
            : String(employeeList[0]?.id || ''),
        );
        setSelectedLeaveTypeId((prev) => {
          const quotaTypes = leaveTypeList.filter(
            (item) => item.needQuota !== false && item.status !== 0,
          );
          return prev && quotaTypes.some((item) => String(item.id) === prev)
            ? prev
            : String(quotaTypes[0]?.id || '');
        });
      } catch (error) {
        console.error(error);
        toast.error('假期额度基础数据加载失败');
      } finally {
        setPageLoading(false);
      }
    };

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!employees.length) {
      setSelectedEmployeeId('');
      return;
    }
    if (selectedEmployeeId && employees.some((item) => String(item.id) === selectedEmployeeId)) {
      return;
    }
    setSelectedEmployeeId(String(employees[0]?.id || ''));
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (!quotaEnabledLeaveTypes.length) {
      setSelectedLeaveTypeId('');
      return;
    }
    if (
      selectedLeaveTypeId
      && quotaEnabledLeaveTypes.some((item) => String(item.id) === selectedLeaveTypeId)
    ) {
      return;
    }
    setSelectedLeaveTypeId(String(quotaEnabledLeaveTypes[0]?.id || ''));
  }, [quotaEnabledLeaveTypes, selectedLeaveTypeId]);

  useEffect(() => {
    const employeeId = Number(selectedEmployeeId);
    const year = Number(selectedYear);
    if (!employeeId || !year) {
      setQuotaSummary([]);
      return;
    }

    const loadQuotaSummary = async () => {
      setSummaryLoading(true);
      try {
        const data = await listHrLeaveQuotas({ employeeId, year });
        setQuotaSummary(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setQuotaSummary([]);
        toast.error((error as Error)?.message || '年度额度汇总加载失败');
      } finally {
        setSummaryLoading(false);
      }
    };

    void loadQuotaSummary();
  }, [reloadToken, selectedEmployeeId, selectedYear]);

  useEffect(() => {
    const employeeId = Number(selectedEmployeeId);
    const leaveTypeId = Number(selectedLeaveTypeId);
    const year = Number(selectedYear);
    if (!employeeId || !leaveTypeId || !year) {
      setQuotaBuckets([]);
      return;
    }

    const loadQuotaBuckets = async () => {
      setBucketLoading(true);
      try {
        const data = await listHrLeaveQuotaBuckets({ employeeId, leaveTypeId, year });
        setQuotaBuckets(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error(error);
        setQuotaBuckets([]);
        toast.error((error as Error)?.message || '额度桶明细加载失败');
      } finally {
        setBucketLoading(false);
      }
    };

    void loadQuotaBuckets();
  }, [reloadToken, selectedEmployeeId, selectedLeaveTypeId, selectedYear]);

  useEffect(() => {
    if (!quotaEnabledLeaveTypes.length) return;
    if (
      selectedLeaveTypeId
      && quotaEnabledLeaveTypes.some((item) => String(item.id) === selectedLeaveTypeId)
    ) {
      return;
    }
    if (quotaSummary[0]?.leaveTypeId) {
      setSelectedLeaveTypeId(String(quotaSummary[0].leaveTypeId));
      return;
    }
    setSelectedLeaveTypeId(String(quotaEnabledLeaveTypes[0]?.id || ''));
  }, [quotaEnabledLeaveTypes, quotaSummary, selectedLeaveTypeId]);

  const handleRefresh = () => {
    setReloadToken((value) => value + 1);
  };

  const persistInitResult = (result: HrLeaveQuotaInitResult) => {
    const resultKey = `${result.employeeId}-${result.year}`;
    setInitResultHistory((prev) => ({ ...prev, [resultKey]: result }));
    setDismissedInitResultKeys((prev) => {
      if (!prev[resultKey]) return prev;
      const next = { ...prev };
      delete next[resultKey];
      return next;
    });
  };

  const dismissVisibleInitResult = () => {
    if (!currentInitResultKey) return;
    setDismissedInitResultKeys((prev) => ({ ...prev, [currentInitResultKey]: true }));
  };

  const restoreVisibleInitResult = () => {
    if (!currentInitResultKey) return;
    setDismissedInitResultKeys((prev) => {
      if (!prev[currentInitResultKey]) return prev;
      const next = { ...prev };
      delete next[currentInitResultKey];
      return next;
    });
  };

  const handleInitAnnualQuota = async () => {
    const employeeId = Number(selectedEmployeeId);
    const year = Number(selectedYear);
    if (!employeeId || !year) {
      toast.error('请先选择员工和年度');
      return;
    }
    if (!selectedLeaveType || isCompensatorySelected) {
      toast.error('当前选中假种不支持从这里补齐年度额度');
      return;
    }

    setActionLoading(true);
    try {
      const result = await initHrLeaveQuota({
        employeeId,
        year,
        leaveTypeId: Number(selectedLeaveTypeId),
      });
      persistInitResult(result);
      const item = result.items[0];
      toast.success(
        item
          ? `${item.leaveTypeName || selectedLeaveType.leaveName} ${year} 年度处理完成：${initActionLabel(item.action)}`
          : `${selectedLeaveType.leaveName} ${year} 年度处理完成`,
      );
      setReloadToken((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.error((error as Error)?.message || '补齐当前假种年度额度失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitAllAnnualQuota = async () => {
    const employeeId = Number(selectedEmployeeId);
    const year = Number(selectedYear);
    if (!employeeId || !year) {
      toast.error('请先选择员工和年度');
      return;
    }
    if (!pendingAnnualQuotaSummaries.length) {
      toast.error('当前没有待补齐的年度额度');
      return;
    }

    setActionLoading(true);
    try {
      const result = await initHrLeaveQuota({ employeeId, year });
      persistInitResult(result);
      toast.success(
        `${year} 年度处理完成：新建 ${result.createdCount}，刷新 ${result.refreshedCount}，跳过 ${result.skippedCount}`,
      );
      setBulkInitDialogOpen(false);
      setReloadToken((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.error((error as Error)?.message || '批量补齐年度额度失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenBulkInitDialog = () => {
    if (!pendingAnnualQuotaSummaries.length) {
      toast.error('当前没有待补齐的年度额度');
      return;
    }
    setBulkInitDialogOpen(true);
  };

  const handleOpenAdjustDialog = () => {
    if (!selectedEmployeeId || !selectedLeaveTypeId) {
      toast.error('请先选择员工和假种');
      return;
    }
    if (!isCompensatorySelected && !selectedQuotaInitialized) {
      toast.error('当前假种还没有年度额度记录，暂时无法直接调整');
      return;
    }

    // 调休额度按额度桶管理：允许命中已有桶，也允许新增一个新的过期桶。
    const nextBucket = isCompensatorySelected && quotaBuckets.length ? quotaBuckets[0] : null;
    setAdjustForm({
      adjustmentAmount: '',
      reason: '',
      bucketId: nextBucket ? String(nextBucket.id) : NEW_BUCKET_VALUE,
      bucketYear: String(nextBucket?.year || selectedYear),
      expiryDate: toDateInputValue(nextBucket?.expiryDate) || '',
    });
    setAdjustDialogOpen(true);
  };

  const handleAdjustBucketChange = (value: string) => {
    const matchedBucket = quotaBuckets.find((item) => String(item.id) === value);
    setAdjustForm((prev) => ({
      ...prev,
      bucketId: value,
      bucketYear: String(matchedBucket?.year || selectedYear),
      expiryDate: toDateInputValue(matchedBucket?.expiryDate) || '',
    }));
  };

  const handleSubmitAdjustment = async () => {
    const employeeId = Number(selectedEmployeeId);
    const leaveTypeId = Number(selectedLeaveTypeId);
    if (!employeeId || !leaveTypeId) {
      toast.error('请先选择员工和假种');
      return;
    }

    if (!adjustForm.adjustmentAmount.trim()) {
      toast.error('请输入调整额度');
      return;
    }

    const adjustmentAmount = Number(adjustForm.adjustmentAmount);
    if (!Number.isFinite(adjustmentAmount) || adjustmentAmount === 0) {
      toast.error('调整额度必须是非零数字');
      return;
    }

    let year = Number(selectedYear);
    let expiryDate: string | undefined;

    if (isCompensatorySelected) {
      const isNewBucket = adjustForm.bucketId === NEW_BUCKET_VALUE;

      if (adjustmentAmount < 0 && isNewBucket) {
        toast.error('减少调休额度时必须指定已有额度桶');
        return;
      }

      if (!isNewBucket && !selectedBucket) {
        toast.error('当前选择的额度桶不存在，请重新选择');
        return;
      }

      year = Number(isNewBucket ? adjustForm.bucketYear : selectedBucket?.year);
      if (!Number.isInteger(year) || year <= 0) {
        toast.error('请输入正确的额度归属年度');
        return;
      }

      expiryDate = isNewBucket
        ? adjustForm.expiryDate
        : toDateInputValue(selectedBucket?.expiryDate);
      if (!expiryDate) {
        toast.error('调休额度必须指定过期日期');
        return;
      }
      if (isNewBucket) {
        const bucketYearStart = `${year}-01-01`;
        if (expiryDate < bucketYearStart) {
          toast.error('调休额度过期日期不能早于归属年度开始日期');
          return;
        }
        if (adjustmentAmount > 0 && expiryDate < todayDateInputValue) {
          toast.error('不能新增已过期的调休额度桶');
          return;
        }
      }
    }

    setActionLoading(true);
    try {
      await adjustHrLeaveQuota({
        employeeId,
        leaveTypeId,
        year,
        adjustmentAmount,
        expiryDate,
        reason: adjustForm.reason.trim() || undefined,
      });
      toast.success('额度调整已保存');
      setAdjustDialogOpen(false);
      setReloadToken((value) => value + 1);
    } catch (error) {
      console.error(error);
      toast.error((error as Error)?.message || '额度调整失败');
    } finally {
      setActionLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="space-y-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <Wallet className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            Leave Quota
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            假期额度
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            正在加载员工、假种和额度配置。
          </p>
        </div>
        <InlineState title="正在准备假期额度页面..." />
      </div>
    );
  }

  if (!employees.length) {
    return (
      <div className="space-y-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <Wallet className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            Leave Quota
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            假期额度
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
            当前租户还没有 HR 员工档案，暂时无法进入额度管理。
          </p>
        </div>
        <InlineState
          title="暂无可管理员工"
          description="先在 HR 员工档案里补齐员工资料，再回来查看假期额度。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <Wallet className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Leave Quota
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          假期额度
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
          围绕员工年度额度、调休额度桶和人工加减做统一管理，页面结构直接压回参考后台列表页语法。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          可管理假种 {quotaSummary.length || '--'}
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          已初始化 {initializedQuotaCount}
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          待初始化 {pendingQuotaCount}
        </span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200">
          当前可用 {selectedQuotaSummary ? formatQuotaValue(selectedQuotaSummary.availableQuota, selectedLeaveType?.unit) : '--'}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          快到期额度桶 {selectedLeaveType ? expiringBucketCount : '--'}
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={summaryLoading || bucketLoading || actionLoading}
          >
            <RefreshCcw
              size={14}
              className={`mr-1.5 ${summaryLoading || bucketLoading ? 'animate-spin' : ''}`}
            />
            刷新额度
          </Button>
          {canInitCurrentAnnualQuota ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleInitAnnualQuota()}
              disabled={actionLoading}
            >
              <CalendarRange size={14} className="mr-1.5" />
              补齐当前假种
            </Button>
          ) : null}
          {showBulkInitButton ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenBulkInitDialog}
              disabled={actionLoading}
            >
              <CalendarRange size={14} className="mr-1.5" />
              批量补齐
            </Button>
          ) : null}
          <Button size="sm" onClick={handleOpenAdjustDialog} disabled={!selectedLeaveTypeId || actionLoading}>
            <Coins size={14} className="mr-1.5" />
            手工调整
          </Button>
        </div>
      </div>

      <TablePageLayout
        filters={(
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <Input
                  className="pl-10"
                  placeholder="搜索姓名、工号、部门"
                  value={employeeKeyword}
                  onChange={(event) => setEmployeeKeyword(event.target.value)}
                />
              </div>
              <div className="w-full sm:w-40">
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="选择年份" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((item) => (
                      <SelectItem key={item} value={String(item)}>
                        {item} 年
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-56">
                <Select value={selectedLeaveTypeId} onValueChange={setSelectedLeaveTypeId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="选择假种" />
                  </SelectTrigger>
                  <SelectContent>
                    {quotaEnabledLeaveTypes.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.leaveName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <Button variant="outline" onClick={() => setEmployeeKeyword('')}>
                重置搜索
              </Button>
            </div>
          </div>
        )}
        table={(
          <div className="grid min-h-[760px] grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="min-w-0 border-b border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/20 xl:border-b-0 xl:border-r">
              <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">员工列表</div>
                <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                  先定位员工，再核对该员工在当前年度下的额度配置。
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto p-4">
                {filteredEmployees.length === 0 ? (
                  <InlineState title="当前搜索条件下没有匹配员工" className="py-12" />
                ) : (
                  filteredEmployees.map((employee) => {
                    const active = String(employee.id) === selectedEmployeeId;

                    return (
                      <button
                        key={employee.id}
                        type="button"
                        className={[
                          'w-full rounded-xl border px-4 py-4 text-left transition',
                          active
                            ? 'border-amber-200 bg-amber-50 shadow-sm dark:border-amber-900 dark:bg-amber-950/20'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/88 dark:hover:bg-slate-900/70',
                        ].join(' ')}
                        onClick={() => setSelectedEmployeeId(String(employee.id))}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {employee.name}
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {buildEmployeeLabel(employee)}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">当前组织</span>
                            <div className="mt-1">
                              {[employee.deptName, employee.postName, employee.positionName]
                                .filter(Boolean)
                                .join(' / ') || '-'}
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 dark:text-slate-500">工号</span>
                            <div className="mt-1">{employee.employeeNo || '-'}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <div className="grid gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:grid-cols-[1.2fr_1fr_1fr]">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    当前员工
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedEmployee?.name || '-'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '-'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    当前假种
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedLeaveType?.leaveName || '未选择'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedLeaveType
                      ? `${getUnitLabel(selectedLeaveType.unit)} / ${isCompensatorySelected ? '按额度桶管理' : '按年度汇总管理'}`
                      : '先从下方选择一个假种'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="text-xs uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                    当前提示
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedQuotaPendingInit
                      ? '当前假种待初始化'
                      : isCompensatorySelected
                        ? '调休调整命中额度桶'
                        : '普通假种按年度调整'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedQuotaPendingInit
                      ? `可以先补齐 ${selectedLeaveType?.leaveName || '当前假种'} 在 ${selectedYear} 年的年度额度。`
                      : isCompensatorySelected
                        ? '增加调休可新建额度桶，减少调休必须指定已有桶。'
                        : '系统会按总额、已用和冻结自动重算可用额度。'}
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                {!visibleInitResult && hiddenInitResult ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 md:flex-row md:items-center md:justify-between dark:border-slate-800 dark:bg-slate-900/30">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        最近一次补齐结果已隐藏
                      </div>
                      <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                        {`${hiddenInitResult.employeeName || selectedEmployee?.name || '--'} / ${hiddenInitResult.year} 年 / ${hiddenInitResult.mode === 'BATCH' ? '批量补齐' : '单假种补齐'} / 共处理 ${hiddenInitResult.requestedCount} 类假种`}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={restoreVisibleInitResult}>
                      重新显示
                    </Button>
                  </div>
                ) : null}

                {visibleInitResult ? (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">最近一次补齐结果</div>
                        <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                          {`${visibleInitResult.employeeName || selectedEmployee?.name || '--'} / ${visibleInitResult.year} 年 / ${visibleInitResult.mode === 'BATCH' ? '批量补齐' : '单假种补齐'}`}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={dismissVisibleInitResult}>
                        关闭结果
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 lg:grid-cols-4">
                      <div className="bg-white px-4 py-3 dark:bg-slate-950/88">
                        <div className="text-xs text-slate-400 dark:text-slate-500">纳入处理</div>
                        <div className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {visibleInitResult.requestedCount}
                        </div>
                      </div>
                      <div className="bg-white px-4 py-3 dark:bg-slate-950/88">
                        <div className="text-xs text-emerald-600 dark:text-emerald-300">新建</div>
                        <div className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-200">
                          {visibleInitResult.createdCount}
                        </div>
                      </div>
                      <div className="bg-white px-4 py-3 dark:bg-slate-950/88">
                        <div className="text-xs text-cyan-600 dark:text-cyan-300">刷新</div>
                        <div className="mt-2 text-lg font-semibold text-cyan-700 dark:text-cyan-200">
                          {visibleInitResult.refreshedCount}
                        </div>
                      </div>
                      <div className="bg-white px-4 py-3 dark:bg-slate-950/88">
                        <div className="text-xs text-amber-600 dark:text-amber-300">跳过</div>
                        <div className="mt-2 text-lg font-semibold text-amber-700 dark:text-amber-200">
                          {visibleInitResult.skippedCount}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>假种</TableHead>
                            <TableHead>处理结果</TableHead>
                            <TableHead>处理后总额</TableHead>
                            <TableHead>过期日期</TableHead>
                            <TableHead>说明</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleInitResult.items.map((item) => {
                            const leaveType = leaveTypeMap.get(item.leaveTypeId);
                            return (
                              <TableRow key={`init-result-${item.leaveTypeId}-${item.action}`}>
                                <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                                  {item.leaveTypeName || leaveType?.leaveName || `假种#${item.leaveTypeId}`}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={[
                                      'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                      initActionToneClassName(item.action),
                                    ].join(' ')}
                                  >
                                    {initActionLabel(item.action)}
                                  </span>
                                </TableCell>
                                <TableCell>{formatQuotaValue(item.totalQuota, leaveType?.unit)}</TableCell>
                                <TableCell>{toDateInputValue(item.expiryDate) || '长期有效'}</TableCell>
                                <TableCell className="text-slate-600 dark:text-slate-300">
                                  {item.message || '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">年度额度总览</div>
                      <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                        点击某一行后，右下区域会切到该假种的额度桶明细。
                      </div>
                    </div>
                    {canInitCurrentAnnualQuota || showBulkInitButton ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        {canInitCurrentAnnualQuota
                          ? `当前假种还没有年度额度记录，可以先补齐 ${selectedLeaveType?.leaveName || '当前假种'} 在 ${selectedYear} 年的年度额度。`
                          : `当前员工在 ${selectedYear} 年还有 ${pendingQuotaCount} 类普通假种待初始化。`}
                      </div>
                    ) : null}
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>假种</TableHead>
                          <TableHead>管理方式</TableHead>
                          <TableHead>总额度</TableHead>
                          <TableHead>已用</TableHead>
                          <TableHead>冻结</TableHead>
                          <TableHead>可用</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quotaSummary.map((item) => {
                          const leaveType = leaveTypeMap.get(item.leaveTypeId);
                          const selected = String(item.leaveTypeId) === selectedLeaveTypeId;
                          const pendingInit =
                            !isCompensatoryLeaveType(leaveType) && item.id == null;
                          return (
                            <TableRow
                              key={`${item.leaveTypeId}-${item.year}`}
                              className={[
                                'cursor-pointer',
                                selected && pendingInit
                                  ? 'bg-amber-100/70 dark:bg-amber-950/20'
                                  : '',
                                selected && !pendingInit
                                  ? 'bg-cyan-50 dark:bg-cyan-950/20'
                                  : '',
                                !selected && pendingInit
                                  ? 'bg-amber-50/70 dark:bg-amber-950/10'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => setSelectedLeaveTypeId(String(item.leaveTypeId))}
                            >
                              <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                                {item.leaveTypeName || leaveType?.leaveName || '-'}
                              </TableCell>
                              <TableCell>
                                {pendingInit
                                  ? '按年度 / 待初始化'
                                  : isCompensatoryLeaveType(leaveType)
                                    ? '按过期桶'
                                    : '按年度'}
                              </TableCell>
                              <TableCell>{formatQuotaValue(item.totalQuota, leaveType?.unit)}</TableCell>
                              <TableCell>{formatQuotaValue(item.usedQuota, leaveType?.unit)}</TableCell>
                              <TableCell>{formatQuotaValue(item.frozenQuota, leaveType?.unit)}</TableCell>
                              <TableCell className="font-medium text-emerald-700 dark:text-emerald-300">
                                {formatQuotaValue(item.availableQuota, leaveType?.unit)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {summaryLoading ? (
                          <TableStateRow
                            colSpan={6}
                            loading
                            title="正在加载年度额度汇总..."
                          />
                        ) : null}
                        {!summaryLoading && !quotaSummary.length ? (
                          <TableStateRow
                            colSpan={6}
                            title="当前年度没有额度记录"
                            description="如果是普通假种，先补齐本年度额度；如果是调休，等加班入账或手工新增额度桶后，这里就会出现记录。"
                          />
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">额度桶明细</div>
                      <div className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
                        {isCompensatorySelected
                          ? '调休会按额度桶展示，便于核对不同过期日的可用余额。'
                          : '普通假种通常只有当前年度的一条汇总额度。'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                      {selectedLeaveType
                        ? `${selectedLeaveType.leaveName} / ${getUnitLabel(selectedLeaveType.unit)} / ${selectedYear} 年`
                        : '先选择假种'}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>归属年度</TableHead>
                          <TableHead>总额度</TableHead>
                          <TableHead>已用</TableHead>
                          <TableHead>冻结</TableHead>
                          <TableHead>可用</TableHead>
                          <TableHead>过期日期</TableHead>
                          <TableHead>状态</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quotaBuckets.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                              {item.year} 年
                            </TableCell>
                            <TableCell>{formatQuotaValue(item.totalQuota, selectedLeaveType?.unit)}</TableCell>
                            <TableCell>{formatQuotaValue(item.usedQuota, selectedLeaveType?.unit)}</TableCell>
                            <TableCell>{formatQuotaValue(item.frozenQuota, selectedLeaveType?.unit)}</TableCell>
                            <TableCell className="font-medium text-emerald-700 dark:text-emerald-300">
                              {formatQuotaValue(item.availableQuota, selectedLeaveType?.unit)}
                            </TableCell>
                            <TableCell>{toDateInputValue(item.expiryDate) || '长期有效'}</TableCell>
                            <TableCell>
                              <span
                                className={[
                                  'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                                  bucketStatusToneClassName(item),
                                ].join(' ')}
                              >
                                {bucketStatusLabel(item)}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        {bucketLoading ? (
                          <TableStateRow
                            colSpan={7}
                            loading
                            title="正在加载额度桶明细..."
                          />
                        ) : null}
                        {!bucketLoading && !quotaBuckets.length ? (
                          <TableStateRow
                            colSpan={7}
                            title="当前假种没有额度桶明细"
                            description={
                              isCompensatorySelected
                                ? '调休还没有入账或手工新增额度桶。'
                                : '当前年度还没有对应的年度额度记录。'
                            }
                          />
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      />

      <BaseDialog
        open={bulkInitDialogOpen}
        title={`批量补齐 ${selectedYear} 年度额度`}
        description="执行后会一次性为当前员工补齐所有待初始化的普通假种年度额度，调休等按额度桶管理的假种不会受影响。"
        onClose={() => setBulkInitDialogOpen(false)}
        maxWidthClassName="max-w-3xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setBulkInitDialogOpen(false)} disabled={actionLoading}>
              取消
            </Button>
            <Button onClick={() => void handleInitAllAnnualQuota()} disabled={actionLoading}>
              {actionLoading ? '补齐中...' : `确认补齐 ${pendingAnnualQuotaSummaries.length} 类假种`}
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <DialogSection title="本次处理范围" description="这里只会处理普通按年控额假种，不会改动调休额度桶。">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/88">
                <div className="text-xs text-slate-400 dark:text-slate-500">当前员工</div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '-'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/88">
                <div className="text-xs text-slate-400 dark:text-slate-500">年度口径</div>
                <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {selectedYear} 年
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="text-xs text-amber-700 dark:text-amber-300">待补齐假种</div>
                <div className="mt-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
                  {pendingAnnualQuotaSummaries.length} 类
                </div>
              </div>
            </div>
          </DialogSection>

          <DialogSection title="待补齐假种" description="以下假种会在本次操作里被批量创建或刷新额度。">
            <div className="flex flex-wrap gap-2">
              {pendingAnnualQuotaSummaries.map((item) => {
                const leaveType = leaveTypeMap.get(item.leaveTypeId);
                const isCurrentSelection = String(item.leaveTypeId) === selectedLeaveTypeId;
                return (
                  <div
                    key={`bulk-init-${item.leaveTypeId}`}
                    className={isCurrentSelection
                      ? 'rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-200'
                      : 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300'}
                  >
                    {item.leaveTypeName || leaveType?.leaveName || `假种#${item.leaveTypeId}`}
                    {leaveType?.unit ? ` / ${getUnitLabel(leaveType.unit)}` : ''}
                    {isCurrentSelection ? ' / 当前选中' : ''}
                  </div>
                );
              })}
            </div>
          </DialogSection>
        </div>
      </BaseDialog>

      <BaseDialog
        open={adjustDialogOpen && Boolean(selectedLeaveType)}
        title={`调整 ${selectedLeaveType?.leaveName || ''} 额度`}
        description={
          isCompensatorySelected
            ? '调休会精确落到某个额度桶。增加可以新建额度桶，减少时必须指定已有桶。'
            : '普通假种按当前年度汇总额度直接加减。'
        }
        onClose={() => setAdjustDialogOpen(false)}
        maxWidthClassName="max-w-3xl"
        footer={(
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} disabled={actionLoading}>
              取消
            </Button>
            <Button onClick={() => void handleSubmitAdjustment()} disabled={actionLoading}>
              {actionLoading ? '保存中...' : '保存调整'}
            </Button>
          </div>
        )}
      >
        {selectedLeaveType ? (
          <div className="space-y-4">
            <DialogSection title="当前上下文" description="调整会直接命中当前员工、当前假种和当前年度。">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/88">
                  <div className="text-xs text-slate-400 dark:text-slate-500">当前员工</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '-'}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/88">
                  <div className="text-xs text-slate-400 dark:text-slate-500">当前假种</div>
                  <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedLeaveType.leaveName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {getUnitLabel(selectedLeaveType.unit)} / {selectedYear} 年视角
                  </div>
                </div>
              </div>
            </DialogSection>

            <DialogSection title="调整内容" description="正数表示增加，负数表示减少。">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">调整额度</Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="正数增加，负数减少，例如 1 或 -0.5"
                    value={adjustForm.adjustmentAmount}
                    onChange={(event) =>
                      setAdjustForm((prev) => ({ ...prev, adjustmentAmount: event.target.value }))
                    }
                    className="h-11"
                  />
                </div>

                {!isCompensatorySelected ? (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">年度口径</Label>
                    <Input className="h-11" value={`${selectedYear} 年`} disabled />
                  </div>
                ) : null}

                {isCompensatorySelected ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">额度桶</Label>
                      <Select value={adjustForm.bucketId} onValueChange={handleAdjustBucketChange}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="选择额度桶" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEW_BUCKET_VALUE}>新增一个额度桶</SelectItem>
                          {quotaBuckets.map((item) => (
                            <SelectItem key={item.id} value={String(item.id)}>
                              {`${item.year} 年 / ${toDateInputValue(item.expiryDate) || '长期有效'} / 可用 ${formatQuotaValue(item.availableQuota, selectedLeaveType.unit)}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">额度归属年度</Label>
                      <Input
                        type="number"
                        min={2000}
                        value={adjustForm.bucketYear}
                        disabled={adjustForm.bucketId !== NEW_BUCKET_VALUE}
                        onChange={(event) =>
                          setAdjustForm((prev) => ({ ...prev, bucketYear: event.target.value }))
                        }
                        className="h-11"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">过期日期</Label>
                      <Input
                        type="date"
                        min={adjustForm.bucketId === NEW_BUCKET_VALUE ? newBucketMinExpiryDate : undefined}
                        value={adjustForm.expiryDate}
                        disabled={adjustForm.bucketId !== NEW_BUCKET_VALUE}
                        onChange={(event) =>
                          setAdjustForm((prev) => ({ ...prev, expiryDate: event.target.value }))
                        }
                        className="h-11"
                      />
                      <div className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                        {adjustForm.bucketId === NEW_BUCKET_VALUE
                          ? '新增调休额度桶时，需要明确它属于哪一年、什么时候到期。'
                          : `当前操作会直接命中已选额度桶：${selectedBucket?.year || '-'} 年 / ${toDateInputValue(selectedBucket?.expiryDate) || '长期有效'}`}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </DialogSection>

            <DialogSection title="调整原因" description="建议记录补录、核销或人工校准的业务原因。">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">原因说明</Label>
                <Textarea
                  rows={5}
                  placeholder="例如：补录历史调休、核销误发额度、员工离职前人工校准余额"
                  value={adjustForm.reason}
                  onChange={(event) =>
                    setAdjustForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                />
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-300">
                {isCompensatorySelected
                  ? '调休是按额度桶管理的，正数可以补一个新桶，负数只能从已有桶扣减。这样可以避免把冻结或已使用额度误冲掉。'
                  : '普通假种直接调年度汇总额度，系统会自动重算可用额度 = 总额度 - 已用 - 冻结。'}
              </div>
            </DialogSection>
          </div>
        ) : null}
      </BaseDialog>
    </div>
  );
};

export default HrLeaveQuotaPage;
