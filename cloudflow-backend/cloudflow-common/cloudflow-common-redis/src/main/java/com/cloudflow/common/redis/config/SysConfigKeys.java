package com.cloudflow.common.redis.config;

/**
 * Runtime sys_config key constants used by multiple backend modules.
 */
public final class SysConfigKeys {

    private SysConfigKeys() {
    }

    public static final String CONFIG_CHANGE_CHANNEL = "sys:config:change";

    public static final String GATEWAY_DEFAULT_TENANT_ID = "sys.gateway.defaultTenantId";
    public static final String GATEWAY_TENANT_STATUS_CACHE_SECONDS = "sys.gateway.tenant.statusCacheSeconds";
    public static final String GATEWAY_TENANT_STATUS_CACHE_MAX_SIZE = "sys.gateway.tenant.statusCacheMaxSize";
    public static final String GATEWAY_TENANT_STATUS_TIMEOUT_SECONDS = "sys.gateway.tenant.statusTimeoutSeconds";

    public static final String WORKFLOW_RATE_LIMIT_START_PROCESS = "sys.workflow.rateLimit.startProcess";
    public static final String WORKFLOW_RATE_LIMIT_COMPLETE_TASK = "sys.workflow.rateLimit.completeTask";
    public static final String WORKFLOW_RATE_LIMIT_URGE_TASK = "sys.workflow.rateLimit.urgeTask";
    public static final String WORKFLOW_TIMEOUT_REMIND_THRESHOLD_MS = "sys.workflow.timeout.remindThresholdMs";
    public static final String WORKFLOW_TIMEOUT_WARNING_THRESHOLD_MS = "sys.workflow.timeout.warningThresholdMs";
    public static final String WORKFLOW_TIMEOUT_CRITICAL_THRESHOLD_MS = "sys.workflow.timeout.criticalThresholdMs";
    public static final String WORKFLOW_TIMEOUT_ESCALATION_SCAN_THRESHOLD_MS = "sys.workflow.timeout.escalation.defaultScanThresholdMs";

    public static final String HR_CERTIFICATE_COMPANY_NAME = "sys.hr.certificate.companyName";
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

    public static final String CRM_TICKET_SLA_LOW_HOURS = "sys.crm.ticket.sla.lowHours";
    public static final String CRM_TICKET_SLA_MEDIUM_HOURS = "sys.crm.ticket.sla.mediumHours";
    public static final String CRM_TICKET_SLA_HIGH_HOURS = "sys.crm.ticket.sla.highHours";
    public static final String CRM_TICKET_SLA_CRITICAL_HOURS = "sys.crm.ticket.sla.criticalHours";
    public static final String CRM_NOTIFICATION_FOLLOW_UP_INACTIVE_DAYS = "sys.crm.notification.followUpInactiveDays";
    public static final String CRM_NOTIFICATION_RECEIVABLE_LOOK_AHEAD_DAYS = "sys.crm.notification.receivableLookAheadDays";
    public static final String CRM_NOTIFICATION_OPPORTUNITY_STALLED_DAYS = "sys.crm.notification.opportunityStalledDays";
    public static final String CRM_NOTIFICATION_TICKET_SLA_REMINDER_HOURS = "sys.crm.notification.ticketSlaReminderHours";
}
