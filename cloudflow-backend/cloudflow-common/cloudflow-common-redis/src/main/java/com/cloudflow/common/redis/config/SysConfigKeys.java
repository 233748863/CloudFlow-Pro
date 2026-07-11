package com.cloudflow.common.redis.config;

/**
 * Runtime sys_config key constants used by multiple backend modules.
 */
public final class SysConfigKeys {

    private SysConfigKeys() {
    }

    public static final String CONFIG_CHANGE_CHANNEL = "sys:config:change";

    public static final String GATEWAY_DEFAULT_TENANT_ID = "sys.gateway.defaultTenantId";
    public static final String GATEWAY_AUTH_WHITELIST = "sys.gateway.auth.whitelist";
    public static final String GATEWAY_TENANT_STATUS_CACHE_SECONDS = "sys.gateway.tenant.statusCacheSeconds";
    public static final String GATEWAY_TENANT_STATUS_CACHE_MAX_SIZE = "sys.gateway.tenant.statusCacheMaxSize";
    public static final String GATEWAY_TENANT_STATUS_TIMEOUT_SECONDS = "sys.gateway.tenant.statusTimeoutSeconds";

    public static final String AUTH_FILE_UPLOAD_MAX_SIZE = "sys.auth.fileUpload.maxSize";
    public static final String AUTH_FILE_UPLOAD_ALLOWED_EXTENSIONS = "sys.auth.fileUpload.allowedExtensions";

    public static final String SECURITY_TOKEN_EXPIRATION = "sys.security.token.expiration";
    public static final String SECURITY_TOKEN_REFRESH_TIME = "sys.security.token.refreshTime";

    public static final String CAPTCHA_TOLERANCE = "sys.captcha.tolerance";
    public static final String CAPTCHA_TTL = "sys.captcha.ttl";
    public static final String CAPTCHA_DAILY_LIMIT = "sys.captcha.dailyLimit";
    public static final String CAPTCHA_PASS_TOKEN_TTL = "sys.captcha.passTokenTtl";
    public static final String CAPTCHA_WIDTH = "sys.captcha.width";
    public static final String CAPTCHA_HEIGHT = "sys.captcha.height";
    public static final String CAPTCHA_PUZZLE_SIZE = "sys.captcha.puzzleSize";
    public static final String CAPTCHA_CIRCLE_RADIUS = "sys.captcha.circleRadius";

    public static final String WORKFLOW_RATE_LIMIT_START_PROCESS = "sys.workflow.rateLimit.startProcess";
    public static final String WORKFLOW_RATE_LIMIT_START_PROCESS_WINDOW_SECONDS = "sys.workflow.rateLimit.startProcess.windowSeconds";
    public static final String WORKFLOW_RATE_LIMIT_COMPLETE_TASK = "sys.workflow.rateLimit.completeTask";
    public static final String WORKFLOW_RATE_LIMIT_COMPLETE_TASK_WINDOW_SECONDS = "sys.workflow.rateLimit.completeTask.windowSeconds";
    public static final String WORKFLOW_RATE_LIMIT_URGE_TASK = "sys.workflow.rateLimit.urgeTask";
    public static final String WORKFLOW_RATE_LIMIT_URGE_TASK_WINDOW_SECONDS = "sys.workflow.rateLimit.urgeTask.windowSeconds";
    public static final String WORKFLOW_TASK_STRICT_OWNER = "sys.workflow.task.strictOwner";
    public static final String WORKFLOW_TASK_OVERRIDE_PERMISSION = "sys.workflow.task.overridePermission";
    public static final String WORKFLOW_SCRIPT_ENABLED = "sys.workflow.script.enabled";
    public static final String WORKFLOW_SCRIPT_TIMEOUT_MS = "sys.workflow.script.timeoutMs";
    public static final String WORKFLOW_TIMEOUT_REMIND_THRESHOLD_MS = "sys.workflow.timeout.remindThresholdMs";
    public static final String WORKFLOW_TIMEOUT_WARNING_THRESHOLD_MS = "sys.workflow.timeout.warningThresholdMs";
    public static final String WORKFLOW_TIMEOUT_CRITICAL_THRESHOLD_MS = "sys.workflow.timeout.criticalThresholdMs";
    public static final String WORKFLOW_TIMEOUT_ESCALATION_SCAN_THRESHOLD_MS = "sys.workflow.timeout.escalation.defaultScanThresholdMs";

    public static final String HR_CERTIFICATE_COMPANY_NAME = "sys.hr.certificate.companyName";
    public static final String HR_EMPLOYEE_DEFAULT_CREATE_MODE = "sys.hr.employee.defaultCreateMode";
    public static final String HR_ONBOARDING_PROCESS_KEY = "sys.hr.onboarding.processKey";
    public static final String HR_CERTIFICATE_PROCESS_KEY = "sys.hr.certificate.processKey";
    public static final String HR_BENEFIT_REQUEST_PROCESS_KEY = "sys.hr.benefit.requestProcessKey";
    public static final String HR_CONTRACT_SIGN_PROCESS_KEY = "sys.hr.contract.signProcessKey";
    public static final String HR_CONTRACT_DEFAULT_EXPIRE_DAYS = "sys.hr.contract.defaultExpireDays";
    public static final String HR_DISPUTE_PROCESS_KEY = "sys.hr.dispute.processKey";
    public static final String HR_MALL_ORDER_PROCESS_KEY = "sys.hr.mall.orderProcessKey";
    public static final String HR_MALL_APPROVAL_THRESHOLD = "sys.hr.mall.approvalThreshold";
    public static final String HR_TALENT_REVIEW_PROCESS_KEY = "sys.hr.talent.reviewProcessKey";
    public static final String HR_TALENT_SUCCESSION_PROCESS_KEY = "sys.hr.talent.successionProcessKey";
    public static final String HR_TRAINING_ENROLLMENT_PROCESS_KEY = "sys.hr.training.enrollmentProcessKey";
    public static final String HR_INJURY_DETERMINATION_PROCESS_KEY = "sys.hr.injury.determinationProcessKey";
    public static final String HR_BUSINESS_RULE_FALLBACK_PREFIX = "sys.hr.businessRule.fallback.";

    public static final String ANNOUNCEMENT_DEFAULT_EXPIRE_DAYS = "sys.announcement.defaultExpireDays";
    public static final String ANNOUNCEMENT_MAX_ATTACHMENT_SIZE = "sys.announcement.maxAttachmentSize";
    public static final String ANNOUNCEMENT_ALLOW_ANONYMOUS = "sys.announcement.allowAnonymous";
    public static final String ASSET_QR_CODE_PREFIX = "sys.asset.qrCodePrefix";
    public static final String ASSET_DEPRECIATION_METHOD = "sys.asset.depreciationMethod";
    public static final String ASSET_ENABLE_QR_CODE = "sys.asset.enableQrCode";
    public static final String ASSET_QR_CODE_SIZE = "sys.asset.qrCodeSize";
    public static final String VEHICLE_MAX_BOOKING_DAYS = "sys.vehicle.maxBookingDays";
    public static final String VEHICLE_ADVANCE_BOOKING_HOURS = "sys.vehicle.advanceBookingHours";
    public static final String VEHICLE_ALLOW_CONCURRENT = "sys.vehicle.allowConcurrent";
    public static final String VEHICLE_FUEL_PRICE_UPDATE_CRON = "sys.vehicle.fuelPriceUpdateCron";
    public static final String MEETING_ROOM_MAX_BOOKING_HOURS = "sys.meetingRoom.maxBookingHours";
    public static final String MEETING_ROOM_AUTO_RELEASE_MINUTES = "sys.meetingRoom.autoReleaseMinutes";
    public static final String MEETING_ROOM_ADVANCE_BOOKING_HOURS = "sys.meetingRoom.advanceBookingHours";
    public static final String MEETING_ROOM_ALLOW_CONCURRENT = "sys.meetingRoom.allowConcurrent";
    public static final String VISITOR_WORKFLOW_ENABLED = "sys.visitor.workflowEnabled";
    public static final String VISITOR_WORKFLOW_PROCESS_KEY = "sys.visitor.workflowProcessKey";
    public static final String ERROR_REPORT_ENABLED = "sys.errorReport.enabled";
    public static final String ERROR_REPORT_ALLOW_ANONYMOUS_PATH = "sys.errorReport.allowAnonymousPath";
    public static final String SYNC_CONFLICT_STRATEGY = "sys.sync.conflictStrategy";
    public static final String SYNC_TIME_TOLERANCE_SECONDS = "sys.sync.timeToleranceSeconds";

    public static final String CRM_TICKET_SLA_LOW_HOURS = "sys.crm.ticket.sla.lowHours";
    public static final String CRM_TICKET_SLA_MEDIUM_HOURS = "sys.crm.ticket.sla.mediumHours";
    public static final String CRM_TICKET_SLA_HIGH_HOURS = "sys.crm.ticket.sla.highHours";
    public static final String CRM_TICKET_SLA_CRITICAL_HOURS = "sys.crm.ticket.sla.criticalHours";
    public static final String CRM_NOTIFICATION_FOLLOW_UP_INACTIVE_DAYS = "sys.crm.notification.followUpInactiveDays";
    public static final String CRM_NOTIFICATION_RECEIVABLE_LOOK_AHEAD_DAYS = "sys.crm.notification.receivableLookAheadDays";
    public static final String CRM_NOTIFICATION_OPPORTUNITY_STALLED_DAYS = "sys.crm.notification.opportunityStalledDays";
    public static final String CRM_NOTIFICATION_TICKET_SLA_REMINDER_HOURS = "sys.crm.notification.ticketSlaReminderHours";
}
