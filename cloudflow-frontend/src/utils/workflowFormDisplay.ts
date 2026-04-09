const HIDDEN_WORKFLOW_KEYS = new Set([
  'formId',
  'processDefKey',
  'startUserId',
  'tenantId',
  'instanceId',
  'processInstanceId',
  'userId',
  'employeeId',
  'leaveId',
  'overtimeId',
  'tripId',
  'claimId',
  'paymentId',
  'vehicleId',
  'applicantId',
  'driverId',
  'delFlag',
  'createBy',
  'updateBy',
  'createTime',
  'updateTime',
  'status',
  'attachmentUrl',
  'id',
]);

const WORKFLOW_SUMMARY_KEYS = [
  'reason',
  'description',
  'destination',
  'payeeName',
  'attendanceDate',
  'checkType',
  'checkTime',
  'leaveTypeName',
  'leaveTypeId',
  'duration',
  'overtimeType',
  'compensationType',
  'compensationHours',
  'departure',
  'transportType',
  'tripDays',
  'estimatedCost',
  'accommodation',
  'vehiclePlate',
  'isRoundTrip',
  'passengerCount',
  'paymentType',
  'startTime',
  'startDate',
  'totalAmount',
  'amount',
] as const;

const WORKFLOW_FIELD_LABELS: Record<string, string> = {
  userName: '申请人',
  userNo: '工号',
  userDept: '部门',
  employeeName: '员工姓名',
  deptName: '部门',
  reason: '申请事由',
  description: '说明',
  remark: '备注',
  title: '标题',
  category: '类别',
  applicationNo: '申请单号',
  supplementNo: '补录单号',
  attendanceDate: '考勤日期',
  checkType: '打卡类型',
  checkTime: '打卡时间',
  originalStatus: '原始打卡状态',
  leaveTypeId: '请假类型',
  leaveTypeName: '请假类型',
  duration: '时长',
  unit: '单位',
  startTime: '开始时间',
  endTime: '结束时间',
  startDate: '开始日期',
  endDate: '结束日期',
  overtimeType: '加班类型',
  compensationType: '补偿方式',
  compensationHours: '折算时长',
  departure: '出发地',
  destination: '目的地',
  tripDays: '出差天数',
  estimatedCost: '预计费用',
  transportType: '交通方式',
  accommodation: '住宿安排',
  contactPhone: '联系电话',
  emergencyContact: '紧急联系人',
  emergencyPhone: '紧急联系人电话',
  companions: '同行人员',
  itinerary: '行程安排',
  vehiclePlate: '车牌号',
  applicantName: '申请人',
  driverName: '驾驶员',
  returnLocation: '还车地点',
  isRoundTrip: '是否往返',
  passengerCount: '乘客人数',
  passengers: '乘客',
  startMileage: '出发里程',
  endMileage: '返回里程',
  actualStartTime: '实际出发时间',
  actualEndTime: '实际返回时间',
  claimNo: '报销单号',
  totalAmount: '总金额',
  expenseType: '费用类型',
  invoiceCount: '发票数量',
  paymentNo: '付款单号',
  paymentType: '付款类型',
  payeeName: '收款方名称',
  payeeAccount: '收款账号',
  payeeBank: '开户行',
  amount: '付款金额',
  contractNo: '合同编号',
  urgency: '紧急程度',
  projectName: '项目名称',
  days: '天数',
  department: '部门',
};

const WORKFLOW_ENUMS: Record<string, Record<string, string>> = {
  checkType: {
    CHECK_IN: '签到',
    CHECK_OUT: '签退',
    '1': '签到',
    '2': '签退',
  },
  originalStatus: {
    LATE: '迟到',
    EARLY: '早退',
    ABNORMAL: '异常',
    MISSING: '缺卡',
    ABSENT: '旷工',
  },
  unit: {
    DAY: '天',
    HOUR: '小时',
  },
  overtimeType: {
    WORKDAY: '工作日',
    WEEKEND: '周末',
    HOLIDAY: '节假日',
  },
  compensationType: {
    PAYMENT: '加班费',
    TIME_OFF: '调休',
  },
  transportType: {
    PLANE: '飞机',
    TRAIN: '火车',
    CAR: '自驾',
    OTHER: '其他',
  },
  accommodation: {
    SELF: '自行安排',
    COMPANY: '公司安排',
    NONE: '无需住宿',
  },
  isRoundTrip: {
    '0': '单程',
    '1': '往返',
    false: '单程',
    true: '往返',
  },
  paymentType: {
    TRANSFER: '转账',
    CHECK: '支票',
    CASH: '现金',
  },
  category: {
    TRANSPORT: '交通',
    MEAL: '餐饮',
    HOTEL: '住宿',
    OFFICE: '办公',
    OTHER: '其他',
  },
};

const isBlankValue = (value: unknown) =>
  value == null || (typeof value === 'string' && value.trim() === '');

const toDisplayNumber = (value: unknown) => {
  if (typeof value === 'number') {
    return value.toLocaleString('zh-CN');
  }
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value).toLocaleString('zh-CN');
  }
  return null;
};

export const getWorkflowFieldLabel = (key: string) => WORKFLOW_FIELD_LABELS[key] || key;

export const isWorkflowHiddenField = (key: string, formData?: Record<string, unknown>) => {
  if (HIDDEN_WORKFLOW_KEYS.has(key)) {
    return true;
  }
  if (key === 'leaveTypeId' && !isBlankValue(formData?.leaveTypeName)) {
    return true;
  }
  if (key === 'unit' && !isBlankValue(formData?.duration)) {
    return true;
  }
  return false;
};

export const formatWorkflowFieldValue = (
  key: string,
  value: unknown,
  formData?: Record<string, unknown>,
) => {
  if (value == null) {
    return '-';
  }

  if (key === 'duration' && !isBlankValue(formData?.unit)) {
    const durationValue = toDisplayNumber(value);
    if (durationValue) {
      return `${durationValue} ${formatWorkflowFieldValue('unit', formData?.unit)}`;
    }
  }

  if (key === 'compensationHours') {
    const compensationValue = toDisplayNumber(value);
    if (compensationValue) {
      return `${compensationValue} 小时`;
    }
  }

  const normalized = String(value);

  if (key === 'paymentType') {
    const paymentTypeLabels: Record<string, string> = {
      PURCHASE: '采购',
      SERVICE: '服务',
      RENT: '租金',
      OTHER: '其他',
    };
    return paymentTypeLabels[normalized] || normalized;
  }

  if (key === 'category') {
    const categoryLabels: Record<string, string> = {
      TRAVEL: '差旅',
      OFFICE: '办公',
      ENTERTAINMENT: '招待',
      TRANSPORT: '交通',
      OTHER: '其他',
    };
    return categoryLabels[normalized] || normalized;
  }

  if (WORKFLOW_ENUMS[key]?.[normalized]) {
    return WORKFLOW_ENUMS[key][normalized];
  }

  const numberValue = toDisplayNumber(value);
  if (numberValue) {
    return numberValue;
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }

  return normalized || '-';
};

export const getWorkflowSummaryParts = (
  formData: Record<string, unknown>,
  maxParts = 2,
) => {
  const parts: string[] = [];
  const appendedKeys = new Set<string>();

  for (const key of WORKFLOW_SUMMARY_KEYS) {
    if (parts.length >= maxParts) {
      break;
    }

    if (appendedKeys.has(key)) {
      continue;
    }

    const value = formData[key];
    if (isBlankValue(value)) {
      continue;
    }

    parts.push(formatWorkflowFieldValue(key, value, formData));
    appendedKeys.add(key);
    if (key === 'duration') {
      appendedKeys.add('unit');
    }
  }

  if (parts.length > 0) {
    return parts;
  }

  for (const [key, value] of Object.entries(formData)) {
    if (parts.length >= maxParts) {
      break;
    }
    if (isWorkflowHiddenField(key, formData) || isBlankValue(value)) {
      continue;
    }
    parts.push(formatWorkflowFieldValue(key, value, formData));
  }

  return parts;
};
