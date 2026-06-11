import { Award, BadgeDollarSign, BriefcaseMedical, CalendarCheck, FileSignature, Gift, GraduationCap, HeartHandshake, IdCard, MessageSquareText, Scale, ShieldCheck, Star, Trophy, Users, WalletCards } from 'lucide-vue-next'
import {
  activeOptions,
  date,
  dateTime,
  number,
  select,
  text,
  workflowOptions,
  type RecordPageConfig
} from '@/pages/shared/recordPageConfig'

const hrStatusOptions = [
  ...workflowOptions,
  { value: 'ACTIVE', label: '进行中' },
  { value: 'PASSED', label: '已通过' },
  { value: 'FAILED', label: '未通过' },
  { value: 'CONFIRMED', label: '已确认' }
]

const hrConfig = (
  config: Omit<RecordPageConfig, 'eyebrow' | 'searchPlaceholder'>
): RecordPageConfig => ({
  eyebrow: 'HR',
  searchPlaceholder: '姓名/编号/关键字',
  updateMode: 'path',
  deleteMode: 'single',
  ...config
})

export const hrAdvancedPageConfigs: RecordPageConfig[] = [
  hrConfig({
    path: '/hr/attendance',
    title: '考勤记录',
    description: '查看员工打卡、异常和月度考勤记录。',
    icon: CalendarCheck,
    listPath: '/hr/attendance/records',
    createPath: '/hr/attendance/records',
    idKey: 'id',
    primaryKey: 'employeeName',
    fields: [
      text('employeeName', '员工', { filter: true }),
      text('employeeNo', '工号', { filter: true }),
      date('attendanceDate', '考勤日期', { filter: true }),
      text('checkType', '打卡类型'),
      dateTime('checkTime', '打卡时间'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/attendance/appeals',
    title: '考勤申诉',
    description: '处理员工补充说明、经理复核和 HR 复核。',
    icon: MessageSquareText,
    listPath: '/hr/attendance/appeals',
    createPath: '/hr/attendance/appeals',
    idKey: 'id',
    primaryKey: 'appealNo',
    fields: [
      text('appealNo', '申诉单号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      date('attendanceDate', '考勤日期'),
      text('reason', '原因', { type: 'textarea', table: false }),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/ess',
    title: '员工自助',
    description: '承接员工自助消息、薪资、证明、合同和福利入口。',
    icon: IdCard,
    listPath: '/hr/ess/messages',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'title',
    fields: [
      text('title', '消息标题', { filter: true }),
      text('messageType', '类型', { filter: true }),
      dateTime('createTime', '时间'),
      select('readStatus', '状态', activeOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/ess/slips',
    title: '工资条',
    description: '查看员工工资条、期间和确认状态。',
    icon: WalletCards,
    listPath: '/hr/ess/salary-slips',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'periodMonth',
    fields: [
      text('employeeName', '员工', { filter: true }),
      text('periodMonth', '薪资月份', { filter: true }),
      number('netPay', '实发工资'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '确认', tone: 'success', path: (row) => `/hr/ess/salary-slips/${row.id}/confirm` }
    ]
  }),
  hrConfig({
    path: '/hr/ess/certificates',
    title: '证明申请',
    description: '处理收入证明、在职证明等员工自助申请。',
    icon: FileSignature,
    listPath: '/hr/ess/certificates',
    createPath: '/hr/ess/certificates',
    idKey: 'id',
    primaryKey: 'requestNo',
    fields: [
      text('requestNo', '申请编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      text('certificateType', '证明类型'),
      dateTime('createTime', '申请时间'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '取消', tone: 'warning', visible: (row) => ['DRAFT', 'PENDING'].includes(String(row.status)), path: (row) => `/hr/ess/certificates/${row.id}/cancel` }
    ]
  }),
  hrConfig({
    path: '/hr/ess/profile',
    title: '个人信息维护',
    description: '展示个人资料变更、银行卡和家庭成员维护入口。',
    icon: IdCard,
    listPath: '/hr/ess/bank-cards',
    createPath: '/hr/ess/bank-cards',
    updatePath: '/hr/ess/bank-cards',
    deletePath: '/hr/ess/bank-cards',
    idKey: 'id',
    primaryKey: 'bankName',
    fields: [
      text('bankName', '开户行', { filter: true }),
      text('accountNo', '银行卡号', { filter: true }),
      text('accountName', '户名'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/ess/leave-balance',
    title: '假期余额',
    description: '查看员工假期额度、已用额度和剩余额度。',
    icon: CalendarCheck,
    listPath: '/hr/attendance/leave-quotas',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'leaveTypeName',
    fields: [
      text('employeeName', '员工', { filter: true }),
      text('leaveTypeName', '假期类型', { filter: true }),
      number('totalQuota', '总额度'),
      number('usedQuota', '已用'),
      number('remainingQuota', '剩余')
    ]
  }),
  hrConfig({
    path: '/hr/ess/benefit',
    title: '福利明细',
    description: '查看员工福利发放、月份和确认状态。',
    icon: Gift,
    listPath: '/hr/ess/benefit-payments',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'periodMonth',
    fields: [
      text('employeeName', '员工', { filter: true }),
      text('periodMonth', '月份', { filter: true }),
      number('amount', '金额'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/ess/contract',
    title: '电子合同',
    description: '查看员工合同签署请求和签署状态。',
    icon: FileSignature,
    listPath: '/hr/ess/contracts/signatures',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'contractName',
    fields: [
      text('contractName', '合同名称', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      dateTime('signTime', '签署时间'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/training',
    title: '培训总览',
    description: '培训计划、课程、场次、报名、考试和证书入口。',
    icon: GraduationCap,
    listPath: '/hr/training/plans',
    createPath: '/hr/training/plans',
    updatePath: '/hr/training/plans',
    deletePath: '/hr/training/plans',
    idKey: 'id',
    primaryKey: 'planName',
    fields: [
      text('planName', '计划名称', { required: true, filter: true }),
      text('ownerName', '负责人', { filter: true }),
      date('startDate', '开始日期'),
      date('endDate', '结束日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/training/plans',
    title: '培训计划',
    description: '维护培训计划、负责人和执行状态。',
    icon: GraduationCap,
    listPath: '/hr/training/plans',
    createPath: '/hr/training/plans',
    updatePath: '/hr/training/plans',
    deletePath: '/hr/training/plans',
    idKey: 'id',
    primaryKey: 'planName',
    fields: [
      text('planName', '计划名称', { required: true, filter: true }),
      text('planCode', '计划编码', { filter: true }),
      date('startDate', '开始日期'),
      date('endDate', '结束日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '发布', tone: 'success', path: (row) => `/hr/training/plans/${row.id}/publish` }
    ]
  }),
  hrConfig({
    path: '/hr/training/courses',
    title: '培训课程',
    description: '维护课程目录、讲师、课时和启停状态。',
    icon: GraduationCap,
    listPath: '/hr/training/courses',
    createPath: '/hr/training/courses',
    updatePath: '/hr/training/courses',
    deletePath: '/hr/training/courses',
    idKey: 'id',
    primaryKey: 'courseName',
    fields: [
      text('courseName', '课程名称', { required: true, filter: true }),
      text('categoryName', '分类', { filter: true }),
      text('instructorName', '讲师'),
      number('durationHours', '课时'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/training/sessions',
    title: '培训场次',
    description: '维护培训场次、地点、容量和签到状态。',
    icon: CalendarCheck,
    listPath: '/hr/training/sessions',
    createPath: '/hr/training/sessions',
    updatePath: '/hr/training/sessions',
    deletePath: '/hr/training/sessions',
    idKey: 'id',
    primaryKey: 'sessionName',
    fields: [
      text('sessionName', '场次名称', { required: true, filter: true }),
      text('courseName', '课程', { filter: true }),
      dateTime('startTime', '开始时间'),
      dateTime('endTime', '结束时间'),
      number('capacity', '容量'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/training/enrollments',
    title: '培训报名',
    description: '管理员工报名、签到、完成和取消状态。',
    icon: Users,
    listPath: '/hr/training/enrollments',
    createPath: '/hr/training/enrollments',
    idKey: 'id',
    primaryKey: 'employeeName',
    fields: [
      text('employeeName', '员工', { filter: true }),
      text('sessionName', '场次', { filter: true }),
      dateTime('enrollTime', '报名时间'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '签到', tone: 'success', path: (row) => `/hr/training/enrollments/${row.id}/check-in` },
      { label: '完成', tone: 'success', path: (row) => `/hr/training/enrollments/${row.id}/complete`, payload: () => ({ score: 100 }) }
    ]
  }),
  hrConfig({
    path: '/hr/training/exams',
    title: '培训考试',
    description: '管理试卷、答题记录和评分状态。',
    icon: Award,
    listPath: '/hr/training/papers',
    createPath: '/hr/training/papers',
    updatePath: '/hr/training/papers',
    deletePath: '/hr/training/papers',
    idKey: 'id',
    primaryKey: 'paperName',
    fields: [
      text('paperName', '试卷名称', { required: true, filter: true }),
      text('courseName', '课程', { filter: true }),
      number('totalScore', '总分'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/training/certificates',
    title: '培训证书',
    description: '发放、撤销和查看培训证书。',
    icon: Award,
    listPath: '/hr/training/certificates',
    createPath: '/hr/training/certificates/issue',
    idKey: 'id',
    primaryKey: 'certificateName',
    fields: [
      text('certificateName', '证书名称', { required: true, filter: true }),
      text('employeeName', '员工', { filter: true }),
      date('issueDate', '发放日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/training/archive',
    title: '培训档案',
    description: '查看员工培训记录、证书和考试归档。',
    icon: IdCard,
    listPath: '/hr/training/certificates/mine',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'certificateName',
    fields: [
      text('certificateName', '证书/课程', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      date('issueDate', '归档日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/talent',
    title: '人才盘点',
    description: '人才评审、九宫格、校准会、继任和人才档案总览。',
    icon: Star,
    listPath: '/hr/talent/reviews',
    createPath: '/hr/talent/reviews',
    updatePath: '/hr/talent/reviews',
    idKey: 'id',
    primaryKey: 'reviewName',
    fields: [
      text('reviewName', '盘点名称', { required: true, filter: true }),
      text('periodName', '周期', { filter: true }),
      text('ownerName', '负责人'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/talent/reviews',
    title: '盘点活动',
    description: '维护人才盘点活动和发布状态。',
    icon: Star,
    listPath: '/hr/talent/reviews',
    createPath: '/hr/talent/reviews',
    updatePath: '/hr/talent/reviews',
    idKey: 'id',
    primaryKey: 'reviewName',
    fields: [
      text('reviewName', '盘点名称', { required: true, filter: true }),
      text('periodName', '周期'),
      date('startDate', '开始日期'),
      date('endDate', '结束日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '发布', tone: 'success', path: (row) => `/hr/talent/reviews/${row.id}/publish` }
    ]
  }),
  hrConfig({
    path: '/hr/talent/nine-box',
    title: '九宫格校准',
    description: '按盘点活动查看绩效/潜力分布。',
    icon: Trophy,
    listPath: '/hr/talent/reviews',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'reviewName',
    fields: [
      text('reviewName', '盘点活动', { filter: true }),
      text('periodName', '周期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/talent/calibration',
    title: '校准会议',
    description: '管理人才校准会议、主持人和会议状态。',
    icon: Users,
    listPath: '/hr/talent/calibration-sessions',
    createPath: '/hr/talent/calibration-sessions',
    updatePath: '/hr/talent/calibration-sessions',
    idKey: 'id',
    primaryKey: 'sessionName',
    fields: [
      text('sessionName', '会议名称', { required: true, filter: true }),
      text('reviewName', '盘点活动', { filter: true }),
      text('hostName', '主持人'),
      dateTime('startTime', '开始时间'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/talent/succession',
    title: '继任计划',
    description: '维护关键岗位继任计划、候选人和发布状态。',
    icon: ShieldCheck,
    listPath: '/hr/talent/succession-plans',
    createPath: '/hr/talent/succession-plans',
    updatePath: '/hr/talent/succession-plans',
    deletePath: '/hr/talent/succession-plans',
    idKey: 'id',
    primaryKey: 'planName',
    fields: [
      text('planName', '计划名称', { required: true, filter: true }),
      text('positionName', '关键岗位', { filter: true }),
      text('ownerName', '负责人'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '发布', tone: 'success', path: (row) => `/hr/talent/succession-plans/${row.id}/publish` }
    ]
  }),
  hrConfig({
    path: '/hr/talent/pools',
    title: '人才池',
    description: '查看人才池成员、标签和培养状态。',
    icon: Users,
    listPath: '/hr/talent/pools',
    createPath: '/hr/talent/pools',
    updatePath: '/hr/talent/pools',
    deletePath: '/hr/talent/pools',
    idKey: 'id',
    primaryKey: 'poolName',
    fields: [
      text('poolName', '人才池', { required: true, filter: true }),
      text('ownerName', '负责人'),
      number('memberCount', '成员数'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/talent/development',
    title: '培养行动',
    description: '跟踪人才培养动作、负责人和完成情况。',
    icon: HeartHandshake,
    listPath: '/hr/talent/development',
    createPath: '/hr/talent/development',
    updatePath: '/hr/talent/development',
    deletePath: '/hr/talent/development',
    idKey: 'id',
    primaryKey: 'actionName',
    fields: [
      text('actionName', '行动名称', { required: true, filter: true }),
      text('employeeName', '员工', { filter: true }),
      text('ownerName', '负责人'),
      date('dueDate', '截止日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '完成', tone: 'success', path: (row) => `/hr/talent/development/${row.id}/complete`, payload: () => ({ summary: '培养行动已完成' }) }
    ]
  }),
  hrConfig({
    path: '/hr/talent/archive',
    title: '人才档案',
    description: '查看员工人才档案和盘点历史。',
    icon: IdCard,
    listPath: '/hr/talent/archive/employees',
    readOnly: true,
    idKey: 'employeeId',
    primaryKey: 'employeeName',
    fields: [
      text('employeeName', '员工', { filter: true }),
      text('employeeNo', '工号', { filter: true }),
      text('talentLevel', '人才等级'),
      text('latestReview', '最近盘点')
    ]
  }),
  hrConfig({
    path: '/hr/benefit',
    title: '福利积分总览',
    description: '福利申请、积分账户、商城和订单入口。',
    icon: Gift,
    listPath: '/hr/benefit/requests',
    createPath: '/hr/benefit/requests',
    updatePath: '/hr/benefit/requests',
    idKey: 'id',
    primaryKey: 'requestNo',
    fields: [
      text('requestNo', '申请编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      text('requestType', '类型'),
      number('amount', '金额'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/benefit/mine',
    title: '我的福利',
    description: '查看个人福利申请和发放记录。',
    icon: Gift,
    listPath: '/hr/benefit/requests/mine',
    createPath: '/hr/benefit/requests',
    updatePath: '/hr/benefit/requests',
    idKey: 'id',
    primaryKey: 'requestNo',
    fields: [
      text('requestNo', '申请编号', { filter: true }),
      text('requestType', '类型', { filter: true }),
      number('amount', '金额'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/benefit/requests',
    title: '福利申请',
    description: '管理福利申请、审批流和取消原因。',
    icon: Gift,
    listPath: '/hr/benefit/requests',
    createPath: '/hr/benefit/requests',
    updatePath: '/hr/benefit/requests',
    idKey: 'id',
    primaryKey: 'requestNo',
    fields: [
      text('requestNo', '申请编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      text('requestType', '类型'),
      number('amount', '金额'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', path: (row) => `/hr/benefit/requests/${row.id}/submit` }
    ]
  }),
  hrConfig({
    path: '/hr/benefit/points',
    title: '积分账户',
    description: '查看员工积分账户和交易流水。',
    icon: BadgeDollarSign,
    listPath: '/hr/benefit/points/transactions',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'employeeName',
    fields: [
      text('employeeName', '员工', { filter: true }),
      text('transactionType', '交易类型'),
      number('points', '积分'),
      dateTime('createTime', '时间')
    ]
  }),
  hrConfig({
    path: '/hr/benefit/mall',
    title: '福利商城',
    description: '浏览福利商品、库存和上下架状态。',
    icon: Gift,
    listPath: '/hr/benefit/mall/items',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'itemName',
    fields: [
      text('itemName', '商品名称', { filter: true }),
      number('pointsPrice', '积分价'),
      number('stock', '库存'),
      select('status', '状态', activeOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/benefit/orders',
    title: '福利订单',
    description: '管理福利商城订单、发货和完成状态。',
    icon: WalletCards,
    listPath: '/hr/benefit/mall/orders',
    createPath: '/hr/benefit/mall/orders',
    idKey: 'id',
    primaryKey: 'orderNo',
    fields: [
      text('orderNo', '订单号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      number('totalPoints', '积分'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '发货', tone: 'success', path: (row) => `/hr/benefit/mall/orders/${row.id}/ship` },
      { label: '完成', tone: 'success', path: (row) => `/hr/benefit/mall/orders/${row.id}/complete` }
    ]
  }),
  hrConfig({
    path: '/hr/benefit/mall/admin',
    title: '商品管理',
    description: '维护福利商品、积分价格和上下架状态。',
    icon: Gift,
    listPath: '/hr/benefit/mall/items',
    createPath: '/hr/benefit/mall/items',
    updatePath: '/hr/benefit/mall/items',
    idKey: 'id',
    primaryKey: 'itemName',
    fields: [
      text('itemName', '商品名称', { required: true, filter: true }),
      number('pointsPrice', '积分价'),
      number('stock', '库存'),
      select('status', '状态', activeOptions, { filter: true })
    ],
    actions: [
      { label: '上架', tone: 'success', path: (row) => `/hr/benefit/mall/items/${row.id}/on-shelf` },
      { label: '下架', tone: 'warning', path: (row) => `/hr/benefit/mall/items/${row.id}/off-shelf` }
    ]
  }),
  hrConfig({
    path: '/hr/work-injury',
    title: '工伤管理',
    description: '工伤登记、调查、治疗、赔付和康复入口。',
    icon: BriefcaseMedical,
    listPath: '/hr/labor/work-injuries',
    createPath: '/hr/labor/work-injuries',
    updatePath: '/hr/labor/work-injuries',
    idKey: 'id',
    primaryKey: 'injuryNo',
    fields: [
      text('injuryNo', '工伤编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      date('injuryDate', '发生日期'),
      text('injuryType', '类型'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/work-injury/list',
    title: '工伤台账',
    description: '维护工伤主记录、认定状态和关闭状态。',
    icon: BriefcaseMedical,
    listPath: '/hr/labor/work-injuries',
    createPath: '/hr/labor/work-injuries',
    updatePath: '/hr/labor/work-injuries',
    idKey: 'id',
    primaryKey: 'injuryNo',
    fields: [
      text('injuryNo', '工伤编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      date('injuryDate', '发生日期'),
      text('injuryType', '类型'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '提交认定', tone: 'success', path: (row) => `/hr/labor/work-injuries/${row.id}/submit-determination` }
    ]
  }),
  hrConfig({
    path: '/hr/work-injury/investigations',
    title: '工伤调查',
    description: '按工伤主记录查看调查动作，默认展示工伤台账。',
    icon: BriefcaseMedical,
    listPath: '/hr/labor/work-injuries',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'injuryNo',
    fields: [
      text('injuryNo', '工伤编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/work-injury/treatments',
    title: '工伤治疗',
    description: '按工伤主记录查看治疗过程，默认展示工伤台账。',
    icon: BriefcaseMedical,
    listPath: '/hr/labor/work-injuries',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'injuryNo',
    fields: [
      text('injuryNo', '工伤编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/work-injury/compensations',
    title: '工伤赔付',
    description: '按工伤主记录查看赔付动作，默认展示工伤台账。',
    icon: BriefcaseMedical,
    listPath: '/hr/labor/work-injuries',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'injuryNo',
    fields: [
      text('injuryNo', '工伤编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/work-injury/rehabilitation',
    title: '工伤康复',
    description: '按工伤主记录查看康复计划，默认展示工伤台账。',
    icon: BriefcaseMedical,
    listPath: '/hr/labor/work-injuries',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'injuryNo',
    fields: [
      text('injuryNo', '工伤编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/labor-dispute',
    title: '劳动争议',
    description: '劳动争议、调解、仲裁和证据归档入口。',
    icon: Scale,
    listPath: '/hr/labor/disputes',
    createPath: '/hr/labor/disputes',
    updatePath: '/hr/labor/disputes',
    idKey: 'id',
    primaryKey: 'disputeNo',
    fields: [
      text('disputeNo', '争议编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      text('disputeType', '类型'),
      date('occurDate', '发生日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/labor-dispute/list',
    title: '争议台账',
    description: '维护劳动争议主记录和处理状态。',
    icon: Scale,
    listPath: '/hr/labor/disputes',
    createPath: '/hr/labor/disputes',
    updatePath: '/hr/labor/disputes',
    idKey: 'id',
    primaryKey: 'disputeNo',
    fields: [
      text('disputeNo', '争议编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      text('disputeType', '类型'),
      date('occurDate', '发生日期'),
      select('status', '状态', hrStatusOptions, { filter: true })
    ],
    actions: [
      { label: '提交', tone: 'success', visible: (row) => String(row.status) === 'DRAFT', path: (row) => `/hr/labor/disputes/${row.id}/submit` }
    ]
  }),
  hrConfig({
    path: '/hr/labor-dispute/mediations',
    title: '争议调解',
    description: '按争议主记录查看调解过程，默认展示争议台账。',
    icon: Scale,
    listPath: '/hr/labor/disputes',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'disputeNo',
    fields: [
      text('disputeNo', '争议编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  }),
  hrConfig({
    path: '/hr/labor-dispute/arbitrations',
    title: '争议仲裁',
    description: '按争议主记录查看仲裁过程，默认展示争议台账。',
    icon: Scale,
    listPath: '/hr/labor/disputes',
    readOnly: true,
    idKey: 'id',
    primaryKey: 'disputeNo',
    fields: [
      text('disputeNo', '争议编号', { filter: true }),
      text('employeeName', '员工', { filter: true }),
      select('status', '状态', hrStatusOptions, { filter: true })
    ]
  })
]

export const hrAdvancedPageConfigByPath = new Map(hrAdvancedPageConfigs.map((config) => [config.path, config]))
