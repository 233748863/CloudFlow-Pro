package com.cloudflow.crm.constant;

/**
 * CRM 模块业务常量集中地。
 * 按域归类，替换原来散落在各 Service 的魔法字符串。
 */
public final class CrmConstants {

    private CrmConstants() {
    }

    /** 共用：逻辑删除标记。 */
    public static final class DelFlag {
        private DelFlag() {}
        public static final String NORMAL = "0";
        public static final String DELETED = "1";
    }

    /** 客户健康等级。 */
    public static final class HealthLevel {
        private HealthLevel() {}
        public static final String GREEN = "GREEN";
        public static final String YELLOW = "YELLOW";
        public static final String RED = "RED";
    }

    /** 客户状态。 */
    public static final class CustomerStatus {
        private CustomerStatus() {}
        public static final String ACTIVE = "ACTIVE";
    }

    /** 商机阶段。 */
    public static final class OpportunityStage {
        private OpportunityStage() {}
        public static final String LEAD = "LEAD";
        public static final String QUALIFIED = "QUALIFIED";
        public static final String PROPOSAL = "PROPOSAL";
        public static final String NEGOTIATION = "NEGOTIATION";
        public static final String WON = "WON";
        public static final String LOST = "LOST";
    }

    /** 商机状态。 */
    public static final class OpportunityStatus {
        private OpportunityStatus() {}
        public static final String OPEN = "OPEN";
        public static final String CLOSED = "CLOSED";
    }

    /** 报价状态。 */
    public static final class QuoteStatus {
        private QuoteStatus() {}
        public static final String DRAFT = "DRAFT";
        public static final String PENDING = "PENDING";
        public static final String APPROVED = "APPROVED";
        public static final String REJECTED = "REJECTED";
        public static final String SENT = "SENT";
        public static final String ACCEPTED = "ACCEPTED";
        public static final String EXPIRED = "EXPIRED";
    }

    /** 续约状态。 */
    public static final class RenewalStatus {
        private RenewalStatus() {}
        public static final String PLANNED = "PLANNED";
        public static final String NEGOTIATING = "NEGOTIATING";
        public static final String PENDING = "PENDING";
        public static final String WON = "WON";
        public static final String LOST = "LOST";
        public static final String CLOSED = "CLOSED";
    }

    /** 回款状态。 */
    public static final class ReceivableStatus {
        private ReceivableStatus() {}
        public static final String PLANNED = "PLANNED";
        public static final String PARTIAL_RECEIVED = "PARTIAL_RECEIVED";
        public static final String RECEIVED = "RECEIVED";
    }

    /** 发票状态（CRM 侧同步 OA 写回的值）。 */
    public static final class InvoiceStatus {
        private InvoiceStatus() {}
        public static final String NONE = "NONE";
        public static final String BOUND = "BOUND";
        public static final String WRITEOFF_PARTIAL = "WRITEOFF_PARTIAL";
        public static final String WRITEOFF_FULL = "WRITEOFF_FULL";
        public static final String VOID = "VOID";
    }

    /** 服务工单严重度。 */
    public static final class TicketSeverity {
        private TicketSeverity() {}
        public static final String LOW = "LOW";
        public static final String MEDIUM = "MEDIUM";
        public static final String HIGH = "HIGH";
        public static final String CRITICAL = "CRITICAL";
    }

    /** 服务工单状态。 */
    public static final class TicketStatus {
        private TicketStatus() {}
        public static final String OPEN = "OPEN";
        public static final String IN_PROGRESS = "IN_PROGRESS";
        public static final String RESOLVED = "RESOLVED";
        public static final String CLOSED = "CLOSED";
    }

    /** 合同 / 项目 / 预算统一风险等级。 */
    public static final class RiskLevel {
        private RiskLevel() {}
        public static final String LOW = "LOW";
        public static final String MEDIUM = "MEDIUM";
        public static final String HIGH = "HIGH";
        public static final String RED = "RED";
    }

    /** 预算阈值状态（OA 回传）。 */
    public static final class BudgetThreshold {
        private BudgetThreshold() {}
        public static final String WARN = "WARN";
        public static final String ALERT = "ALERT";
        public static final String BLOCK = "BLOCK";
    }

    /** 本服务标识，用于调 OA 时的 X-From-Service。 */
    public static final String SERVICE_NAME = "cloudflow-service-crm";

    /** 单据编号前缀。 */
    public static final class NoPrefix {
        private NoPrefix() {}
        public static final String CUSTOMER = "KH";
        public static final String QUOTE = "BJ";
        public static final String RENEWAL = "XY";
        public static final String RECEIVABLE = "SK";
        public static final String TICKET = "GD";
    }
}
