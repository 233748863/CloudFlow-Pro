/**
 * 系统配置键名常量
 * 与后端 sys_config 表的 config_key 一一对应
 * scope: 0=全局配置（所有租户共享） 1=租户配置（每租户独立）
 */

// ================= 用户管理（租户级） =================

/** 新用户初始密码 */
export const SYS_USER_INIT_PASSWORD = 'sys.user.initPassword';
/** 密码最小长度 */
export const SYS_USER_PASSWORD_MIN_LENGTH = 'sys.user.password.minLength';
/** 密码最大长度 */
export const SYS_USER_PASSWORD_MAX_LENGTH = 'sys.user.password.maxLength';
/** 登录失败锁定次数 */
export const SYS_USER_LOGIN_MAX_RETRY = 'sys.user.login.maxRetry';
/** 账号锁定时间（分钟） */
export const SYS_USER_LOGIN_LOCK_TIME = 'sys.user.login.lockTime';

// ================= 系统管理 =================

/** 是否开启验证码（全局） */
export const SYS_CAPTCHA_ENABLED = 'sys.captcha.enabled';
/** 是否开启用户注册（租户级） */
export const SYS_ACCOUNT_REGISTER_USER = 'sys.account.registerUser';

// ================= 文件上传（全局） =================

/** 单文件大小限制（MB） */
export const SYS_UPLOAD_MAX_FILE_SIZE = 'sys.upload.maxFileSize';
/** 允许的文件类型 */
export const SYS_UPLOAD_ALLOWED_TYPES = 'sys.upload.allowedTypes';

// ================= 验证码（全局） =================

/** 滑块容错值（像素） */
export const SYS_CAPTCHA_TOLERANCE = 'sys.captcha.tolerance';
/** 验证码有效期（秒） */
export const SYS_CAPTCHA_TTL = 'sys.captcha.ttl';
/** 每日单IP验证次数限制 */
export const SYS_CAPTCHA_DAILY_LIMIT = 'sys.captcha.dailyLimit';
/** 验证通过Token有效期（秒） */
export const SYS_CAPTCHA_PASS_TOKEN_TTL = 'sys.captcha.passTokenTtl';

// ================= 考勤管理（租户级） =================

/** 上班时间 */
export const SYS_ATTENDANCE_WORK_START_TIME = 'sys.attendance.workStartTime';
/** 下班时间 */
export const SYS_ATTENDANCE_WORK_END_TIME = 'sys.attendance.workEndTime';
/** 迟到阈值（分钟） */
export const SYS_ATTENDANCE_LATE_THRESHOLD = 'sys.attendance.lateThreshold';
/** 早退阈值（分钟） */
export const SYS_ATTENDANCE_EARLY_LEAVE_THRESHOLD = 'sys.attendance.earlyLeaveThreshold';
/** 加班阈值（分钟） */
export const SYS_ATTENDANCE_OVERTIME_THRESHOLD = 'sys.attendance.overtimeThreshold';
/** 打卡半径（米） */
export const SYS_ATTENDANCE_CHECK_IN_RADIUS = 'sys.attendance.checkInRadius';

// ================= 公告管理（租户级） =================

/** 公告默认过期天数 */
export const SYS_ANNOUNCEMENT_DEFAULT_EXPIRE_DAYS = 'sys.announcement.defaultExpireDays';
/** 公告最大附件大小（MB） */
export const SYS_ANNOUNCEMENT_MAX_ATTACHMENT_SIZE = 'sys.announcement.maxAttachmentSize';

// ================= 车辆管理（租户级） =================

/** 最大预订天数 */
export const SYS_VEHICLE_MAX_BOOKING_DAYS = 'sys.vehicle.maxBookingDays';
/** 提前预订小时数 */
export const SYS_VEHICLE_ADVANCE_BOOKING_HOURS = 'sys.vehicle.advanceBookingHours';

// ================= 会议室管理（租户级） =================

/** 最大预订小时数 */
export const SYS_MEETING_ROOM_MAX_BOOKING_HOURS = 'sys.meetingRoom.maxBookingHours';
/** 自动释放分钟数 */
export const SYS_MEETING_ROOM_AUTO_RELEASE_MINUTES = 'sys.meetingRoom.autoReleaseMinutes';

// ================= 资产管理（租户级） =================

/** 二维码前缀 */
export const SYS_ASSET_QR_CODE_PREFIX = 'sys.asset.qrCodePrefix';
/** 折旧方法 */
export const SYS_ASSET_DEPRECIATION_METHOD = 'sys.asset.depreciationMethod';

// ================= 工作流（混合） =================

/** 流程最大深度（全局） */
export const SYS_WORKFLOW_MAX_DEPTH = 'sys.workflow.maxDepth';
/** 撤回时间窗口（小时）（租户级） */
export const SYS_WORKFLOW_RECALL_TIMEOUT_HOURS = 'sys.workflow.recallTimeoutHours';
/** 失败最大重试次数（全局） */
export const SYS_WORKFLOW_MAX_RETRY_COUNT = 'sys.workflow.maxRetryCount';

// ================= 日志管理（全局） =================

/** 请求参数最大记录长度 */
export const SYS_LOG_MAX_LENGTH = 'sys.log.maxLength';
/** 是否开启操作日志 */
export const SYS_LOG_ENABLED = 'sys.log.enabled';
/** 是否记录请求报文体 */
export const SYS_LOG_REQUEST_ENABLED = 'sys.log.requestEnabled';

// ================= 安全认证（全局） =================

/** Token过期时间（分钟） */
export const SYS_SECURITY_TOKEN_EXPIRATION = 'sys.security.token.expiration';
/** Token刷新时间（分钟） */
export const SYS_SECURITY_TOKEN_REFRESH_TIME = 'sys.security.token.refreshTime';

// ================= 验证码图片（全局） =================

/** 背景图宽度（像素） */
export const SYS_CAPTCHA_WIDTH = 'sys.captcha.width';
/** 背景图高度（像素） */
export const SYS_CAPTCHA_HEIGHT = 'sys.captcha.height';
/** 拼图块大小（像素） */
export const SYS_CAPTCHA_PUZZLE_SIZE = 'sys.captcha.puzzleSize';
/** 圆弧半径（像素） */
export const SYS_CAPTCHA_CIRCLE_RADIUS = 'sys.captcha.circleRadius';

// ================= 工作流引擎扩展（全局） =================

/** 定时器扫描最大重试次数 */
export const SYS_WORKFLOW_TIMER_MAX_RETRY = 'sys.workflow.timerMaxRetry';
/** 定时器重试间隔（分钟） */
export const SYS_WORKFLOW_TIMER_RETRY_INTERVAL = 'sys.workflow.timerRetryInterval';
/** 事务重试基数（秒） */
export const SYS_WORKFLOW_RETRY_BASE_INTERVAL = 'sys.workflow.retryBaseInterval';
/** 异步状态过期（分钟） */
export const SYS_WORKFLOW_ASYNC_STATUS_EXPIRE = 'sys.workflow.asyncStatusExpire';
/** Nonce防重放过期（分钟） */
export const SYS_WORKFLOW_NONCE_EXPIRE_MINUTES = 'sys.workflow.nonceExpireMinutes';
/** Stream Key */
export const SYS_WORKFLOW_STREAM_KEY = 'sys.workflow.stream.key';
/** Stream消费组 */
export const SYS_WORKFLOW_STREAM_GROUP = 'sys.workflow.stream.group';

// ================= 分布式锁（全局） =================

/** 会签锁等待（秒） */
export const SYS_LOCK_COUNTERSIGN_WAIT_SECONDS = 'sys.lock.countersign.waitSeconds';
/** 会签锁持有（秒） */
export const SYS_LOCK_COUNTERSIGN_LEASE_SECONDS = 'sys.lock.countersign.leaseSeconds';
/** 死锁检测超时（秒） */
export const SYS_LOCK_DEADLOCK_TIMEOUT_THRESHOLD = 'sys.lock.deadlockTimeoutThreshold';
/** 死锁牺牲记录上限 */
export const SYS_LOCK_MAX_VICTIM_RECORDS = 'sys.lock.maxVictimRecords';

// ================= SSE实时推送（全局） =================

/** SSE连接超时时间（毫秒） */
export const SYS_SSE_TIMEOUT = 'sys.sse.timeout';

// ================= 分页（全局） =================

/** 默认页码 */
export const SYS_PAGE_DEFAULT_PAGE_NUM = 'sys.page.defaultPageNum';
/** 默认每页条数 */
export const SYS_PAGE_DEFAULT_PAGE_SIZE = 'sys.page.defaultPageSize';

// ================= 租户（全局） =================

/** 默认租户ID */
export const SYS_TENANT_DEFAULT_ID = 'sys.tenant.defaultId';
/** 默认用户数量限制 */
export const SYS_TENANT_DEFAULT_USER_LIMIT = 'sys.tenant.defaultUserLimit';
/** 默认存储空间（MB） */
export const SYS_TENANT_DEFAULT_STORAGE_LIMIT = 'sys.tenant.defaultStorageLimit';

// ================= OA补充（租户级） =================

/** 是否允许匿名阅读公告 */
export const SYS_ANNOUNCEMENT_ALLOW_ANONYMOUS = 'sys.announcement.allowAnonymous';
/** 资产二维码大小（像素） */
export const SYS_ASSET_QR_CODE_SIZE = 'sys.asset.qrCodeSize';
/** 是否启用资产二维码 */
export const SYS_ASSET_ENABLE_QR_CODE = 'sys.asset.enableQrCode';
/** 车辆是否允许并发预订 */
export const SYS_VEHICLE_ALLOW_CONCURRENT = 'sys.vehicle.allowConcurrent';
/** 油价更新Cron表达式 */
export const SYS_VEHICLE_FUEL_PRICE_UPDATE_CRON = 'sys.vehicle.fuelPriceUpdateCron';
/** 会议室提前预订小时数 */
export const SYS_MEETING_ROOM_ADVANCE_BOOKING_HOURS = 'sys.meetingRoom.advanceBookingHours';
/** 会议室是否允许并发预订 */
export const SYS_MEETING_ROOM_ALLOW_CONCURRENT = 'sys.meetingRoom.allowConcurrent';

// ================= 加密（全局） =================

/** 是否启用字段加密 */
export const SYS_ENCRYPT_ENABLED = 'sys.encrypt.enabled';

// ================= 数据权限（全局） =================

/** 部门字段名 */
export const SYS_DATASCOPE_DEPT_COLUMN = 'sys.datascope.deptColumn';
/** 用户字段名 */
export const SYS_DATASCOPE_USER_COLUMN = 'sys.datascope.userColumn';

// ================= 网关（全局） =================

/** 网关默认租户ID */
export const SYS_GATEWAY_DEFAULT_TENANT_ID = 'sys.gateway.defaultTenantId';

// ================= OSS对象存储（全局） =================

/** 是否启用HTTPS */
export const SYS_OSS_IS_HTTPS = 'sys.oss.isHttps';
/** 默认访问策略 */
export const SYS_OSS_ACCESS_POLICY = 'sys.oss.accessPolicy';

// ================= 作用域常量 =================

/** 全局配置（所有租户共享） */
export const CONFIG_SCOPE_GLOBAL = '0';
/** 租户配置（每租户独立） */
export const CONFIG_SCOPE_TENANT = '1';

/**
 * 配置键与作用域的映射表
 * 用于前端判断某个配置是全局还是租户级
 */
export const CONFIG_SCOPE_MAP: Record<string, string> = {
  // 全局配置
  [SYS_CAPTCHA_ENABLED]: CONFIG_SCOPE_GLOBAL,
  [SYS_UPLOAD_MAX_FILE_SIZE]: CONFIG_SCOPE_GLOBAL,
  [SYS_UPLOAD_ALLOWED_TYPES]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_TOLERANCE]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_TTL]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_DAILY_LIMIT]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_PASS_TOKEN_TTL]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_MAX_DEPTH]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_MAX_RETRY_COUNT]: CONFIG_SCOPE_GLOBAL,
  [SYS_LOG_MAX_LENGTH]: CONFIG_SCOPE_GLOBAL,
  [SYS_LOG_ENABLED]: CONFIG_SCOPE_GLOBAL,
  [SYS_LOG_REQUEST_ENABLED]: CONFIG_SCOPE_GLOBAL,
  [SYS_SECURITY_TOKEN_EXPIRATION]: CONFIG_SCOPE_GLOBAL,
  [SYS_SECURITY_TOKEN_REFRESH_TIME]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_WIDTH]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_HEIGHT]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_PUZZLE_SIZE]: CONFIG_SCOPE_GLOBAL,
  [SYS_CAPTCHA_CIRCLE_RADIUS]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_TIMER_MAX_RETRY]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_TIMER_RETRY_INTERVAL]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_RETRY_BASE_INTERVAL]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_ASYNC_STATUS_EXPIRE]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_NONCE_EXPIRE_MINUTES]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_STREAM_KEY]: CONFIG_SCOPE_GLOBAL,
  [SYS_WORKFLOW_STREAM_GROUP]: CONFIG_SCOPE_GLOBAL,
  [SYS_LOCK_COUNTERSIGN_WAIT_SECONDS]: CONFIG_SCOPE_GLOBAL,
  [SYS_LOCK_COUNTERSIGN_LEASE_SECONDS]: CONFIG_SCOPE_GLOBAL,
  [SYS_LOCK_DEADLOCK_TIMEOUT_THRESHOLD]: CONFIG_SCOPE_GLOBAL,
  [SYS_LOCK_MAX_VICTIM_RECORDS]: CONFIG_SCOPE_GLOBAL,
  [SYS_SSE_TIMEOUT]: CONFIG_SCOPE_GLOBAL,
  [SYS_PAGE_DEFAULT_PAGE_NUM]: CONFIG_SCOPE_GLOBAL,
  [SYS_PAGE_DEFAULT_PAGE_SIZE]: CONFIG_SCOPE_GLOBAL,
  [SYS_TENANT_DEFAULT_ID]: CONFIG_SCOPE_GLOBAL,
  [SYS_TENANT_DEFAULT_USER_LIMIT]: CONFIG_SCOPE_GLOBAL,
  [SYS_TENANT_DEFAULT_STORAGE_LIMIT]: CONFIG_SCOPE_GLOBAL,
  [SYS_ENCRYPT_ENABLED]: CONFIG_SCOPE_GLOBAL,
  [SYS_DATASCOPE_DEPT_COLUMN]: CONFIG_SCOPE_GLOBAL,
  [SYS_DATASCOPE_USER_COLUMN]: CONFIG_SCOPE_GLOBAL,
  [SYS_GATEWAY_DEFAULT_TENANT_ID]: CONFIG_SCOPE_GLOBAL,
  [SYS_OSS_IS_HTTPS]: CONFIG_SCOPE_GLOBAL,
  [SYS_OSS_ACCESS_POLICY]: CONFIG_SCOPE_GLOBAL,

  // 租户配置
  [SYS_USER_INIT_PASSWORD]: CONFIG_SCOPE_TENANT,
  [SYS_USER_PASSWORD_MIN_LENGTH]: CONFIG_SCOPE_TENANT,
  [SYS_USER_PASSWORD_MAX_LENGTH]: CONFIG_SCOPE_TENANT,
  [SYS_USER_LOGIN_MAX_RETRY]: CONFIG_SCOPE_TENANT,
  [SYS_USER_LOGIN_LOCK_TIME]: CONFIG_SCOPE_TENANT,
  [SYS_ACCOUNT_REGISTER_USER]: CONFIG_SCOPE_TENANT,
  [SYS_ATTENDANCE_WORK_START_TIME]: CONFIG_SCOPE_TENANT,
  [SYS_ATTENDANCE_WORK_END_TIME]: CONFIG_SCOPE_TENANT,
  [SYS_ATTENDANCE_LATE_THRESHOLD]: CONFIG_SCOPE_TENANT,
  [SYS_ATTENDANCE_EARLY_LEAVE_THRESHOLD]: CONFIG_SCOPE_TENANT,
  [SYS_ATTENDANCE_OVERTIME_THRESHOLD]: CONFIG_SCOPE_TENANT,
  [SYS_ATTENDANCE_CHECK_IN_RADIUS]: CONFIG_SCOPE_TENANT,
  [SYS_ANNOUNCEMENT_DEFAULT_EXPIRE_DAYS]: CONFIG_SCOPE_TENANT,
  [SYS_ANNOUNCEMENT_MAX_ATTACHMENT_SIZE]: CONFIG_SCOPE_TENANT,
  [SYS_VEHICLE_MAX_BOOKING_DAYS]: CONFIG_SCOPE_TENANT,
  [SYS_VEHICLE_ADVANCE_BOOKING_HOURS]: CONFIG_SCOPE_TENANT,
  [SYS_MEETING_ROOM_MAX_BOOKING_HOURS]: CONFIG_SCOPE_TENANT,
  [SYS_MEETING_ROOM_AUTO_RELEASE_MINUTES]: CONFIG_SCOPE_TENANT,
  [SYS_ASSET_QR_CODE_PREFIX]: CONFIG_SCOPE_TENANT,
  [SYS_ASSET_DEPRECIATION_METHOD]: CONFIG_SCOPE_TENANT,
  [SYS_WORKFLOW_RECALL_TIMEOUT_HOURS]: CONFIG_SCOPE_TENANT,
  [SYS_ANNOUNCEMENT_ALLOW_ANONYMOUS]: CONFIG_SCOPE_TENANT,
  [SYS_ASSET_QR_CODE_SIZE]: CONFIG_SCOPE_TENANT,
  [SYS_ASSET_ENABLE_QR_CODE]: CONFIG_SCOPE_TENANT,
  [SYS_VEHICLE_ALLOW_CONCURRENT]: CONFIG_SCOPE_TENANT,
  [SYS_VEHICLE_FUEL_PRICE_UPDATE_CRON]: CONFIG_SCOPE_TENANT,
  [SYS_MEETING_ROOM_ADVANCE_BOOKING_HOURS]: CONFIG_SCOPE_TENANT,
  [SYS_MEETING_ROOM_ALLOW_CONCURRENT]: CONFIG_SCOPE_TENANT,
};
