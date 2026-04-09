import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Coins, Hourglass, RefreshCcw, Search, Wallet } from 'lucide-react';
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
  Textarea,
} from '@/components/ui';
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
import {
  WorkspaceInlineState,
  WorkspaceTableStateRow,
} from '@/components/workspace/WorkspacePrimitives';
import {
  HrEmployee,
  HrLeaveQuotaInitResult,
  HrLeaveQuotaVO,
  HrLeaveTypeOption,
  adjustHrLeaveQuota,
  initHrLeaveQuota,
  listEmployees,
  listHrLeaveQuotaBuckets,
  listHrLeaveQuotas,
  listHrLeaveTypes,
} from '@/services/api/hr';
import { buildEmployeeLabel, matchEmployeeKeyword, normalizeRows, toDateInputValue } from './hrShared';

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
  return numericValue.toFixed(Number.isInteger(numericValue) ? 0 : 2).replace(/\.?0+$/, '');
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
      ? parsedValue as Record<string, T>
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
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  const diffDays = Math.ceil(
    (new Date(`${expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0))
      / (1000 * 60 * 60 * 24),
  );

  if (availableQuota > 0 && diffDays <= 30) {
    return 'bg-amber-50 text-amber-700 border-amber-100';
  }
  if (frozenQuota > 0) {
    return 'bg-violet-50 text-violet-700 border-violet-100';
  }
  return 'bg-emerald-50 text-emerald-700 border-emerald-100';
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
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'REFRESHED':
      return 'bg-sky-50 text-sky-700 border-sky-100';
    case 'SKIPPED':
    default:
      return 'bg-amber-50 text-amber-700 border-amber-100';
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
  const [adjustForm, setAdjustForm] = useState<AdjustFormState>(createDefaultAdjustForm(String(currentYear)));

  const yearOptions = useMemo(() => buildYearOptions(currentYear), [currentYear]);

  const quotaEnabledLeaveTypes = useMemo(
    () => leaveTypes.filter(item => item.needQuota !== false && item.status !== 0),
    [leaveTypes],
  );

  const leaveTypeMap = useMemo(
    () => new Map(quotaEnabledLeaveTypes.map(item => [item.id, item])),
    [quotaEnabledLeaveTypes],
  );

  const selectedEmployee = useMemo(
    () => employees.find(item => String(item.id) === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );
  const currentInitResultKey = useMemo(
    () => (selectedEmployeeId && selectedYear ? `${selectedEmployeeId}-${selectedYear}` : ''),
    [selectedEmployeeId, selectedYear],
  );
  const visibleInitResult = useMemo(
    () => (currentInitResultKey && !dismissedInitResultKeys[currentInitResultKey]
      ? initResultHistory[currentInitResultKey] || null
      : null),
    [currentInitResultKey, dismissedInitResultKeys, initResultHistory],
  );
  const hiddenInitResult = useMemo(
    () => (currentInitResultKey && dismissedInitResultKeys[currentInitResultKey]
      ? initResultHistory[currentInitResultKey] || null
      : null),
    [currentInitResultKey, dismissedInitResultKeys, initResultHistory],
  );

  const filteredEmployees = useMemo(() => {
    const rows = employees.filter(item => matchEmployeeKeyword(item, employeeKeyword));
    if (!selectedEmployee) return rows;
    if (rows.some(item => item.id === selectedEmployee.id)) return rows;
    return [selectedEmployee, ...rows];
  }, [employeeKeyword, employees, selectedEmployee]);

  const selectedLeaveType = useMemo(
    () => quotaEnabledLeaveTypes.find(item => String(item.id) === selectedLeaveTypeId) || null,
    [quotaEnabledLeaveTypes, selectedLeaveTypeId],
  );

  const selectedQuotaSummary = useMemo(
    () => quotaSummary.find(item => String(item.leaveTypeId) === selectedLeaveTypeId) || null,
    [quotaSummary, selectedLeaveTypeId],
  );

  const selectedBucket = useMemo(
    () => quotaBuckets.find(item => String(item.id) === adjustForm.bucketId) || null,
    [adjustForm.bucketId, quotaBuckets],
  );
  const newBucketMinExpiryDate = useMemo(() => {
    const bucketYear = Number(adjustForm.bucketYear);
    const yearStart = Number.isInteger(bucketYear) && bucketYear > 0
      ? `${bucketYear}-01-01`
      : todayDateInputValue;
    return yearStart > todayDateInputValue ? yearStart : todayDateInputValue;
  }, [adjustForm.bucketYear, todayDateInputValue]);

  useEffect(() => {
    writeSessionStorageRecord(INIT_RESULT_HISTORY_STORAGE_KEY, initResultHistory as Record<string, unknown>);
  }, [initResultHistory]);

  useEffect(() => {
    writeSessionStorageRecord(DISMISSED_INIT_RESULT_STORAGE_KEY, dismissedInitResultKeys as Record<string, unknown>);
  }, [dismissedInitResultKeys]);

  const isCompensatorySelected = isCompensatoryLeaveType(selectedLeaveType);
  const selectedQuotaInitialized = selectedQuotaSummary?.id != null;
  const selectedQuotaPendingInit = Boolean(selectedQuotaSummary && !selectedQuotaInitialized && !isCompensatorySelected);
  const initializedQuotaCount = useMemo(
    () => quotaSummary.filter(item => item.id != null).length,
    [quotaSummary],
  );
  const pendingQuotaCount = useMemo(
    () => quotaSummary.filter(item => {
      const leaveType = leaveTypeMap.get(item.leaveTypeId);
      return item.id == null && !isCompensatoryLeaveType(leaveType);
    }).length,
    [leaveTypeMap, quotaSummary],
  );
  const pendingAnnualQuotaSummaries = useMemo(
    () => quotaSummary.filter(item => {
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
  const showBulkInitButton = canInitAllAnnualQuota && (pendingQuotaCount > 1 || !canInitCurrentAnnualQuota);

  const metrics = useMemo(() => {
    const unit = selectedLeaveType?.unit;
    const expiringBuckets = quotaBuckets.filter(item => {
      const expiryDate = toDateInputValue(item.expiryDate);
      const availableQuota = Number(item.availableQuota ?? 0);
      if (!expiryDate || availableQuota <= 0) return false;
      const diffDays = Math.ceil(
        (new Date(`${expiryDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0))
          / (1000 * 60 * 60 * 24),
      );
      return diffDays <= 30;
    });

    return [
      {
        label: '可管理假种',
        value: quotaSummary.length,
        hint: pendingQuotaCount
          ? `员工 ${selectedEmployee?.name || '--'} 在 ${selectedYear} 年共有 ${quotaSummary.length} 类可管理假种，已初始化 ${initializedQuotaCount} 类，待初始化 ${pendingQuotaCount} 类`
          : `员工 ${selectedEmployee?.name || '--'} 在 ${selectedYear} 年已有 ${initializedQuotaCount} 类额度记录`,
        iconTone: 'bg-slate-100 text-slate-600',
        icon: <Wallet size={18} />,
      },
      {
        label: '当前假种总额',
        value: selectedQuotaPendingInit ? '待初始化' : selectedQuotaSummary ? formatQuotaValue(selectedQuotaSummary.totalQuota, unit) : '--',
        hint: selectedQuotaPendingInit
          ? `${selectedLeaveType?.leaveName || '当前假种'} 还没有年度额度记录，可先初始化再进行调整`
          : selectedLeaveType ? `${selectedLeaveType.leaveName} 当前累计总额` : '先从右侧选择一个假种',
        iconTone: 'bg-sky-50 text-sky-600',
        icon: <Coins size={18} />,
      },
      {
        label: '当前可用额度',
        value: selectedQuotaSummary ? formatQuotaValue(selectedQuotaSummary.availableQuota, unit) : '--',
        hint: selectedQuotaPendingInit
          ? '初始化完成后，系统才会生成可用额度和冻结额度口径'
          : selectedQuotaSummary
          ? `已用 ${formatQuotaValue(selectedQuotaSummary.usedQuota, unit)}，冻结 ${formatQuotaValue(selectedQuotaSummary.frozenQuota, unit)}`
          : '当前假种暂无额度汇总记录',
        iconTone: 'bg-emerald-50 text-emerald-600',
        icon: <CalendarRange size={18} />,
      },
      {
        label: '快到期额度桶',
        value: expiringBuckets.length,
        hint: expiringBuckets.length
          ? `${formatQuotaValue(
            expiringBuckets.reduce((sum, item) => sum + Number(item.availableQuota ?? 0), 0),
            unit,
          )} 待优先消耗`
          : '当前选中假种没有 30 天内到期的可用额度',
        iconTone: 'bg-amber-50 text-amber-600',
        icon: <Hourglass size={18} />,
      },
    ];
  }, [initializedQuotaCount, pendingQuotaCount, quotaBuckets, quotaSummary.length, selectedEmployee?.name, selectedLeaveType, selectedQuotaPendingInit, selectedQuotaSummary, selectedYear]);

  useEffect(() => {
    const bootstrap = async () => {
      setPageLoading(true);
      try {
        const [employeeRes, leaveTypeRes] = await Promise.all([
          listEmployees({ pageNum: 1, pageSize: 200 }),
          listHrLeaveTypes(),
        ]);
        const employeeList = normalizeRows<HrEmployee>(employeeRes);
        const leaveTypeList = (Array.isArray(leaveTypeRes) ? leaveTypeRes : []).filter(item => item.status !== 0);

        setEmployees(employeeList);
        setLeaveTypes(leaveTypeList);
        setSelectedEmployeeId(prev => (prev && employeeList.some(item => String(item.id) === prev)
          ? prev
          : String(employeeList[0]?.id || '')));
        setSelectedLeaveTypeId(prev => {
          const quotaTypes = leaveTypeList.filter(item => item.needQuota !== false && item.status !== 0);
          return prev && quotaTypes.some(item => String(item.id) === prev)
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
    if (selectedEmployeeId && employees.some(item => String(item.id) === selectedEmployeeId)) {
      return;
    }
    setSelectedEmployeeId(String(employees[0]?.id || ''));
  }, [employees, selectedEmployeeId]);

  useEffect(() => {
    if (!quotaEnabledLeaveTypes.length) {
      setSelectedLeaveTypeId('');
      return;
    }
    if (selectedLeaveTypeId && quotaEnabledLeaveTypes.some(item => String(item.id) === selectedLeaveTypeId)) {
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
    if (selectedLeaveTypeId && quotaEnabledLeaveTypes.some(item => String(item.id) === selectedLeaveTypeId)) {
      return;
    }
    if (quotaSummary[0]?.leaveTypeId) {
      setSelectedLeaveTypeId(String(quotaSummary[0].leaveTypeId));
      return;
    }
    setSelectedLeaveTypeId(String(quotaEnabledLeaveTypes[0]?.id || ''));
  }, [quotaEnabledLeaveTypes, quotaSummary, selectedLeaveTypeId]);

  const handleRefresh = () => {
    setReloadToken(value => value + 1);
  };

  const persistInitResult = (result: HrLeaveQuotaInitResult) => {
    const resultKey = `${result.employeeId}-${result.year}`;
    setInitResultHistory(prev => ({ ...prev, [resultKey]: result }));
    setDismissedInitResultKeys(prev => {
      if (!prev[resultKey]) return prev;
      const next = { ...prev };
      delete next[resultKey];
      return next;
    });
  };

  const dismissVisibleInitResult = () => {
    if (!currentInitResultKey) return;
    setDismissedInitResultKeys(prev => ({ ...prev, [currentInitResultKey]: true }));
  };

  const restoreVisibleInitResult = () => {
    if (!currentInitResultKey) return;
    setDismissedInitResultKeys(prev => {
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
      const result = await initHrLeaveQuota({ employeeId, year, leaveTypeId: Number(selectedLeaveTypeId) });
      persistInitResult(result);
      const item = result.items[0];
      toast.success(
        item
          ? `${item.leaveTypeName || selectedLeaveType.leaveName} ${year} 年度处理完成：${initActionLabel(item.action)}`
          : `${selectedLeaveType.leaveName} ${year} 年度处理完成`,
      );
      setReloadToken(value => value + 1);
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
      setReloadToken(value => value + 1);
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

    // 调休额度按“额度桶”管理：允许直接挂到已有桶，也允许新增一个新的过期桶。
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
    const matchedBucket = quotaBuckets.find(item => String(item.id) === value);
    setAdjustForm(prev => ({
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

      expiryDate = isNewBucket ? adjustForm.expiryDate : toDateInputValue(selectedBucket?.expiryDate);
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
      setReloadToken(value => value + 1);
    } catch (error) {
      console.error(error);
      toast.error((error as Error)?.message || '额度调整失败');
    } finally {
      setActionLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className="space-y-6">
        <WorkspaceHeroCard
          badge={<div className="inline-flex rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">Leave Quota</div>}
          title="假期额度管理"
          description="正在加载员工、假种和额度配置..."
        />
        <WorkspaceInlineState type="loading" title="正在准备额度管理工作台..." />
      </div>
    );
  }

  if (!employees.length) {
    return (
      <div className="space-y-6">
        <WorkspaceHeroCard
          badge={<div className="inline-flex rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">Leave Quota</div>}
          title="假期额度管理"
          description="当前租户还没有 HR 员工档案，暂时无法进入额度管理。"
        />
        <WorkspaceInlineState
          title="暂无可管理员工"
          description="先在 HR 员工档案里补齐员工资料，再回来查看假期额度。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WorkspaceHeroCard
        badge={(
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-600">
            <Wallet size={14} />
            Leave Quota
          </div>
        )}
        title="假期额度管理"
        description={`围绕员工年度额度、调休额度桶和人工加减做统一管理。当前查看：${selectedEmployee?.name || '--'} / ${selectedYear} 年`}
        actions={(
          <>
            <Button variant="outline" className="rounded-2xl" onClick={handleRefresh} disabled={summaryLoading || bucketLoading}>
              <RefreshCcw size={16} className="mr-2" />
              刷新额度
            </Button>
            {canInitCurrentAnnualQuota ? (
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={() => void handleInitAnnualQuota()}
                disabled={actionLoading}
              >
                <CalendarRange size={16} className="mr-2" />
                补齐当前假种额度
              </Button>
            ) : null}
            {showBulkInitButton ? (
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleOpenBulkInitDialog}
                disabled={actionLoading}
              >
                <CalendarRange size={16} className="mr-2" />
                批量补齐待初始化
              </Button>
            ) : null}
            <Button className="rounded-2xl" onClick={handleOpenAdjustDialog} disabled={!selectedLeaveTypeId}>
              <Coins size={16} className="mr-2" />
              手工调整
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-4 pt-2 lg:grid-cols-[1.1fr_1.3fr_220px]">
          <div>
            <Label className="text-slate-500">员工筛选</Label>
            <div className="relative mt-2">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="按工号、姓名、部门筛选"
                value={employeeKeyword}
                onChange={event => setEmployeeKeyword(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-500">员工档案</Label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="选择员工" />
              </SelectTrigger>
              <SelectContent>
                {filteredEmployees.map(item => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {buildEmployeeLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-500">年度口径</Label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="选择年份" />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map(item => (
                  <SelectItem key={item} value={String(item)}>
                    {item} 年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
            <div className="text-xs text-slate-400">当前员工</div>
            <div className="mt-2 font-semibold text-slate-900">{selectedEmployee?.name || '-'}</div>
            <div className="mt-1 text-sm text-slate-500">{selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '-'}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
            <div className="text-xs text-slate-400">当前假种</div>
            <div className="mt-2 font-semibold text-slate-900">{selectedLeaveType?.leaveName || '未选择'}</div>
            <div className="mt-1 text-sm text-slate-500">
              {selectedLeaveType
                ? `${getUnitLabel(selectedLeaveType.unit)} / ${isCompensatorySelected ? '按过期桶管理' : '按年度汇总管理'}`
                : '先从下方选择需要查看的假种'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
            <div className="text-xs text-slate-400">操作提醒</div>
            <div className="mt-2 font-semibold text-slate-900">
              {isCompensatorySelected ? '调休调整需要落到具体额度桶' : '普通假种直接按年度额度调整'}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              调休支持跨年有效，减少额度时必须指定已有桶，避免把冻结或已使用额度冲坏。
            </div>
          </div>
        </div>
      </WorkspaceHeroCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(metric => (
          <WorkspaceMetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            aside={<div className={`rounded-2xl p-3 ${metric.iconTone}`}>{metric.icon}</div>}
          />
        ))}
      </div>

      {!visibleInitResult && hiddenInitResult ? (
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-slate-900">最近一次补齐结果已隐藏</div>
            <div className="mt-1 text-xs leading-6 text-slate-500">
              {`${hiddenInitResult.employeeName || selectedEmployee?.name || '--'} / ${hiddenInitResult.year} 年 / ${hiddenInitResult.mode === 'BATCH' ? '批量补齐' : '单假种补齐'} / 共处理 ${hiddenInitResult.requestedCount} 类假种`}
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full md:w-auto" onClick={restoreVisibleInitResult}>
            重新显示
          </Button>
        </div>
      ) : null}

      {visibleInitResult ? (
        <WorkspaceSectionCard
          title="最近一次补齐结果"
          description={`${visibleInitResult.employeeName || selectedEmployee?.name || '--'} / ${visibleInitResult.year} 年 / ${visibleInitResult.mode === 'BATCH' ? '批量补齐' : '单假种补齐'}`}
          eyebrow="Init Result"
          headerAside={(
            <Button variant="outline" size="sm" onClick={dismissVisibleInitResult}>
              关闭结果
            </Button>
          )}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
              <div className="text-xs text-slate-400">纳入处理</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">{visibleInitResult.requestedCount}</div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
              <div className="text-xs text-emerald-700">新建</div>
              <div className="mt-2 text-xl font-semibold text-emerald-900">{visibleInitResult.createdCount}</div>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3">
              <div className="text-xs text-sky-700">刷新</div>
              <div className="mt-2 text-xl font-semibold text-sky-900">{visibleInitResult.refreshedCount}</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
              <div className="text-xs text-amber-700">跳过</div>
              <div className="mt-2 text-xl font-semibold text-amber-900">{visibleInitResult.skippedCount}</div>
            </div>
          </div>

          <div className="mt-4">
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
                {visibleInitResult.items.map(item => {
                  const leaveType = leaveTypeMap.get(item.leaveTypeId);
                  return (
                    <TableRow key={`init-result-${item.leaveTypeId}-${item.action}`}>
                      <TableCell className="font-medium text-slate-900">
                        {item.leaveTypeName || leaveType?.leaveName || `假种#${item.leaveTypeId}`}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${initActionToneClassName(item.action)}`}>
                          {initActionLabel(item.action)}
                        </span>
                      </TableCell>
                      <TableCell>{formatQuotaValue(item.totalQuota, leaveType?.unit)}</TableCell>
                      <TableCell>{toDateInputValue(item.expiryDate) || '长期有效'}</TableCell>
                      <TableCell className="text-slate-600">{item.message || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </WorkspaceSectionCard>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
        <WorkspaceSectionCard
          title="年度额度总览"
          description="按员工和年度查看所有需要额度控制的假种汇总，点击行即可切到右侧额度桶明细。"
          eyebrow="Summary"
        >
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
              {quotaSummary.map(item => {
                const leaveType = leaveTypeMap.get(item.leaveTypeId);
                const selected = String(item.leaveTypeId) === selectedLeaveTypeId;
                const pendingInit = !isCompensatoryLeaveType(leaveType) && item.id == null;
                return (
                  <TableRow
                    key={`${item.leaveTypeId}-${item.year}`}
                    className={selected
                      ? pendingInit
                        ? 'bg-amber-50/80 cursor-pointer'
                        : 'bg-pink-50/70 cursor-pointer'
                      : pendingInit
                        ? 'bg-amber-50/30 cursor-pointer'
                        : 'cursor-pointer'}
                    onClick={() => setSelectedLeaveTypeId(String(item.leaveTypeId))}
                  >
                    <TableCell className="font-medium text-slate-900">{item.leaveTypeName || leaveType?.leaveName || '-'}</TableCell>
                    <TableCell>{pendingInit ? '按年度 / 待初始化' : isCompensatoryLeaveType(leaveType) ? '按过期桶' : '按年度'}</TableCell>
                    <TableCell>{formatQuotaValue(item.totalQuota, leaveType?.unit)}</TableCell>
                    <TableCell>{formatQuotaValue(item.usedQuota, leaveType?.unit)}</TableCell>
                    <TableCell>{formatQuotaValue(item.frozenQuota, leaveType?.unit)}</TableCell>
                    <TableCell className="font-medium text-emerald-700">{formatQuotaValue(item.availableQuota, leaveType?.unit)}</TableCell>
                  </TableRow>
                );
              })}
              {summaryLoading && (
                <WorkspaceTableStateRow
                  colSpan={6}
                  type="loading"
                  title="正在加载年度额度汇总..."
                />
              )}
              {!summaryLoading && !quotaSummary.length && (
                <WorkspaceTableStateRow
                  colSpan={6}
                  title="当前年度没有额度记录"
                  description="如果是普通假种，先补齐当前假种的本年度额度；如果是调休，等加班审批入账或手工新增额度桶后，这里就会出现记录。"
                />
              )}
            </TableBody>
          </Table>
        </WorkspaceSectionCard>

        <WorkspaceSectionCard
          title="额度桶明细"
          description={isCompensatorySelected
            ? '调休会按额度桶展示，便于查看不同过期日的可用余额。'
            : '普通假种默认只有年度汇总记录，这里会显示当前年度对应的单条额度。'}
          eyebrow="Buckets"
          headerAside={(
            <div className="flex flex-wrap items-center gap-3">
              <Select value={selectedLeaveTypeId} onValueChange={setSelectedLeaveTypeId}>
                <SelectTrigger className="w-[220px] bg-white/80">
                  <SelectValue placeholder="选择假种" />
                </SelectTrigger>
                <SelectContent>
                  {quotaEnabledLeaveTypes.map(item => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.leaveName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canInitCurrentAnnualQuota ? (
                <Button variant="outline" onClick={() => void handleInitAnnualQuota()} disabled={actionLoading}>
                  补齐当前假种额度
                </Button>
              ) : null}
              {showBulkInitButton ? (
                <Button variant="outline" onClick={handleOpenBulkInitDialog} disabled={actionLoading}>
                  批量补齐待初始化
                </Button>
              ) : null}
              <Button variant="outline" onClick={handleOpenAdjustDialog} disabled={!selectedLeaveTypeId}>
                手工调整
              </Button>
            </div>
          )}
        >
          {!selectedLeaveType && (
            <WorkspaceInlineState
              title="还没有可查看的假种"
              description="先在左侧选择员工，或者确认假种配置里已开启额度管理。"
            />
          )}
          {selectedLeaveType && (
            <div className="space-y-4">
              {canInitCurrentAnnualQuota || showBulkInitButton ? (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">
                      {canInitCurrentAnnualQuota ? '当前假种还没有年度额度记录' : '当前员工还有待初始化年度额度'}
                    </div>
                    <div className="mt-1 text-xs leading-6 text-amber-800">
                      {canInitCurrentAnnualQuota
                        ? `可以先补齐 ${selectedLeaveType?.leaveName || '当前假种'} 在 ${selectedYear} 年的年度额度，再继续做人工调整或核对。`
                        : `当前员工在 ${selectedYear} 年还有 ${pendingQuotaCount} 类普通假种待初始化，可直接批量补齐，调休额度不会受影响。`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canInitCurrentAnnualQuota ? (
                      <Button variant="outline" className="border-amber-200 bg-white/80" onClick={() => void handleInitAnnualQuota()} disabled={actionLoading}>
                        补齐当前假种额度
                      </Button>
                    ) : null}
                    {showBulkInitButton ? (
                      <Button variant="outline" className="border-amber-200 bg-white/80" onClick={handleOpenBulkInitDialog} disabled={actionLoading}>
                        批量补齐待初始化
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

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
                  {quotaBuckets.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-slate-900">{item.year} 年</TableCell>
                      <TableCell>{formatQuotaValue(item.totalQuota, selectedLeaveType.unit)}</TableCell>
                      <TableCell>{formatQuotaValue(item.usedQuota, selectedLeaveType.unit)}</TableCell>
                      <TableCell>{formatQuotaValue(item.frozenQuota, selectedLeaveType.unit)}</TableCell>
                      <TableCell className="font-medium text-emerald-700">{formatQuotaValue(item.availableQuota, selectedLeaveType.unit)}</TableCell>
                      <TableCell>{toDateInputValue(item.expiryDate) || '长期有效'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${bucketStatusToneClassName(item)}`}>
                          {bucketStatusLabel(item)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {bucketLoading && (
                    <WorkspaceTableStateRow
                      colSpan={7}
                      type="loading"
                      title="正在加载额度桶明细..."
                    />
                  )}
                  {!bucketLoading && !quotaBuckets.length && (
                    <WorkspaceTableStateRow
                      colSpan={7}
                      title="当前假种没有额度桶明细"
                      description={isCompensatorySelected
                        ? '调休还没有入账或手工新增额度桶。'
                        : '当前年度还没有对应的年度额度记录。'}
                    />
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </WorkspaceSectionCard>
      </div>

      {bulkInitDialogOpen && (
        <WorkspaceDialogShell
          title={`批量补齐 ${selectedYear} 年度额度`}
          description="执行后会一次性为当前员工补齐所有待初始化的普通假种年度额度，调休等按额度桶管理的假种不会受影响。"
          onClose={() => setBulkInitDialogOpen(false)}
          maxWidthClassName="max-w-3xl"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs text-slate-400">当前员工</div>
                <div className="mt-2 font-semibold text-slate-900">{selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs text-slate-400">年度口径</div>
                <div className="mt-2 font-semibold text-slate-900">{selectedYear} 年</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                <div className="text-xs text-amber-700">待补齐假种</div>
                <div className="mt-2 font-semibold text-amber-900">{pendingAnnualQuotaSummaries.length} 类</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="text-sm font-medium text-slate-900">本次会补齐以下普通假种</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {pendingAnnualQuotaSummaries.map(item => {
                  const leaveType = leaveTypeMap.get(item.leaveTypeId);
                  const isCurrentSelection = String(item.leaveTypeId) === selectedLeaveTypeId;
                  return (
                    <div
                      key={`bulk-init-${item.leaveTypeId}`}
                      className={isCurrentSelection
                        ? 'rounded-full border border-pink-200 bg-pink-50 px-3 py-1.5 text-sm text-pink-700'
                        : 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700'}
                    >
                      {item.leaveTypeName || leaveType?.leaveName || `假种#${item.leaveTypeId}`}
                      {leaveType?.unit ? ` / ${getUnitLabel(leaveType.unit)}` : ''}
                      {isCurrentSelection ? ' / 当前选中' : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
              批量补齐只会创建或刷新普通按年控额假种的年度额度记录，不会改动调休额度桶，也不会自动触发请假申请或加班申请的状态变化。
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setBulkInitDialogOpen(false)} disabled={actionLoading}>
                取消
              </Button>
              <Button onClick={() => void handleInitAllAnnualQuota()} disabled={actionLoading}>
                {actionLoading ? '补齐中...' : `确认补齐 ${pendingAnnualQuotaSummaries.length} 类假种`}
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      )}

      {adjustDialogOpen && selectedLeaveType && (
        <WorkspaceDialogShell
          title={`调整 ${selectedLeaveType.leaveName} 额度`}
          description={isCompensatorySelected
            ? '调休会精确落到某个额度桶。增加可以新建额度桶，减少时必须指定已有桶。'
            : '普通假种按当前年度汇总额度直接加减。'}
          onClose={() => setAdjustDialogOpen(false)}
          maxWidthClassName="max-w-3xl"
        >
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs text-slate-400">当前员工</div>
                <div className="mt-2 font-semibold text-slate-900">{selectedEmployee ? buildEmployeeLabel(selectedEmployee) : '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="text-xs text-slate-400">当前假种</div>
                <div className="mt-2 font-semibold text-slate-900">{selectedLeaveType.leaveName}</div>
                <div className="mt-1 text-sm text-slate-500">{getUnitLabel(selectedLeaveType.unit)} / {selectedYear} 年视角</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>调整额度</Label>
                <Input
                  className="mt-2"
                  type="number"
                  step="0.5"
                  placeholder="正数增加，负数减少，例如 1 或 -0.5"
                  value={adjustForm.adjustmentAmount}
                  onChange={event => setAdjustForm(prev => ({ ...prev, adjustmentAmount: event.target.value }))}
                />
              </div>

              {!isCompensatorySelected && (
                <div>
                  <Label>年度口径</Label>
                  <Input className="mt-2" value={`${selectedYear} 年`} disabled />
                </div>
              )}

              {isCompensatorySelected && (
                <>
                  <div>
                    <Label>额度桶</Label>
                    <Select value={adjustForm.bucketId} onValueChange={handleAdjustBucketChange}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="选择额度桶" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW_BUCKET_VALUE}>新增一个额度桶</SelectItem>
                        {quotaBuckets.map(item => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {`${item.year} 年 / ${toDateInputValue(item.expiryDate) || '长期有效'} / 可用 ${formatQuotaValue(item.availableQuota, selectedLeaveType.unit)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>额度归属年度</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={2000}
                      value={adjustForm.bucketYear}
                      disabled={adjustForm.bucketId !== NEW_BUCKET_VALUE}
                      onChange={event => setAdjustForm(prev => ({ ...prev, bucketYear: event.target.value }))}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label>过期日期</Label>
                    <Input
                      className="mt-2"
                      type="date"
                      min={adjustForm.bucketId === NEW_BUCKET_VALUE ? newBucketMinExpiryDate : undefined}
                      value={adjustForm.expiryDate}
                      disabled={adjustForm.bucketId !== NEW_BUCKET_VALUE}
                      onChange={event => setAdjustForm(prev => ({ ...prev, expiryDate: event.target.value }))}
                    />
                    <div className="mt-2 text-xs leading-6 text-slate-500">
                      {adjustForm.bucketId === NEW_BUCKET_VALUE
                        ? '新增调休额度桶时，需要明确它属于哪一年、什么时候到期。'
                        : `当前操作会直接命中已选额度桶：${selectedBucket?.year || '-'} 年 / ${toDateInputValue(selectedBucket?.expiryDate) || '长期有效'}`}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div>
              <Label>调整原因</Label>
              <Textarea
                className="mt-2 min-h-[120px]"
                placeholder="例如：补录历史调休、核销误发额度、员工离职前人工校准余额"
                value={adjustForm.reason}
                onChange={event => setAdjustForm(prev => ({ ...prev, reason: event.target.value }))}
              />
            </div>

            {/* 这里把调休与普通假种的提示拆开，避免 HR 在弹窗里误把“年度”与“额度桶”当成一回事。 */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
              {isCompensatorySelected
                ? '调休是按额度桶管理的，正数可以补一个新桶，负数只能从已有桶扣减。这样才能保证冻结和已使用额度不会被误冲掉。'
                : '普通假种直接调年度汇总额度，系统会自动重算可用额度 = 总额度 - 已用 - 冻结。'}
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setAdjustDialogOpen(false)} disabled={actionLoading}>
                取消
              </Button>
              <Button onClick={() => void handleSubmitAdjustment()} disabled={actionLoading}>
                {actionLoading ? '保存中...' : '保存调整'}
              </Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      )}
    </div>
  );
};

export default HrLeaveQuotaPage;
