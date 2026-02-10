package com.cloudflow.workflow.domain.enums;

/**
 * 流程发布增强相关枚举类集合
 */
public class DeployEnums {

    /**
     * 发布窗口类型
     */
    public enum WindowType {
        DAILY("DAILY", "每日"),
        WEEKLY("WEEKLY", "每周"),
        MONTHLY("MONTHLY", "每月"),
        CUSTOM("CUSTOM", "自定义");

        private final String code;
        private final String desc;

        WindowType(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }

        public static WindowType fromCode(String code) {
            for (WindowType type : values()) {
                if (type.code.equals(code)) return type;
            }
            throw new IllegalArgumentException("Unknown WindowType: " + code);
        }
    }

    /**
     * 通知类型
     */
    public enum NotificationType {
        EMAIL("EMAIL", "邮件"),
        SMS("SMS", "短信"),
        WEBSOCKET("WEBSOCKET", "站内信"),
        WECHAT("WECHAT", "微信");

        private final String code;
        private final String desc;

        NotificationType(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }

        public static NotificationType fromCode(String code) {
            for (NotificationType type : values()) {
                if (type.code.equals(code)) return type;
            }
            throw new IllegalArgumentException("Unknown NotificationType: " + code);
        }
    }

    /**
     * 接收人类型
     */
    public enum RecipientType {
        USER("USER", "指定用户"),
        ROLE("ROLE", "角色"),
        DEPT("DEPT", "部门"),
        ALL("ALL", "所有人");

        private final String code;
        private final String desc;

        RecipientType(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }
    }

    /**
     * 发送状态
     */
    public enum SendStatus {
        PENDING("PENDING", "待发送"),
        SENDING("SENDING", "发送中"),
        SUCCESS("SUCCESS", "成功"),
        FAILED("FAILED", "失败");

        private final String code;
        private final String desc;

        SendStatus(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }
    }

    /**
     * 审批状态
     */
    public enum ApprovalStatus {
        PENDING("PENDING", "待审批"),
        APPROVED("APPROVED", "已通过"),
        REJECTED("REJECTED", "已驳回"),
        CANCELLED("CANCELLED", "已取消");

        private final String code;
        private final String desc;

        ApprovalStatus(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }

        public static ApprovalStatus fromCode(String code) {
            for (ApprovalStatus status : values()) {
                if (status.code.equals(code)) return status;
            }
            throw new IllegalArgumentException("Unknown ApprovalStatus: " + code);
        }
    }

    /**
     * 审批人类型
     */
    public enum ApproverType {
        USER("USER", "指定用户"),
        ROLE("ROLE", "角色"),
        DEPT("DEPT", "部门主管");

        private final String code;
        private final String desc;

        ApproverType(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }
    }

    /**
     * 审批模式
     */
    public enum ApprovalMode {
        ANY("ANY", "任一人审批"),
        ALL("ALL", "所有人审批"),
        SEQUENCE("SEQUENCE", "依次审批");

        private final String code;
        private final String desc;

        ApprovalMode(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }
    }

    /**
     * 影响类型
     */
    public enum ImpactType {
        RUNNING_INSTANCE("RUNNING_INSTANCE", "运行中实例"),
        PENDING_TASK("PENDING_TASK", "待办任务"),
        FORM_CHANGE("FORM_CHANGE", "表单变更"),
        NODE_CHANGE("NODE_CHANGE", "节点变更");

        private final String code;
        private final String desc;

        ImpactType(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }
    }

    /**
     * 影响级别
     */
    public enum ImpactLevel {
        LOW("LOW", "低"),
        MEDIUM("MEDIUM", "中"),
        HIGH("HIGH", "高"),
        CRITICAL("CRITICAL", "严重");

        private final String code;
        private final String desc;

        ImpactLevel(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }

        public static ImpactLevel fromCode(String code) {
            for (ImpactLevel level : values()) {
                if (level.code.equals(code)) return level;
            }
            throw new IllegalArgumentException("Unknown ImpactLevel: " + code);
        }
    }

    /**
     * 回滚类型
     */
    public enum RollbackType {
        MANUAL("MANUAL", "手动回滚"),
        AUTO("AUTO", "自动回滚");

        private final String code;
        private final String desc;

        RollbackType(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }
    }

    /**
     * 回滚状态
     */
    public enum RollbackStatus {
        SUCCESS("SUCCESS", "成功"),
        FAILED("FAILED", "失败"),
        PARTIAL("PARTIAL", "部分成功");

        private final String code;
        private final String desc;

        RollbackStatus(String code, String desc) {
            this.code = code;
            this.desc = desc;
        }

        public String getCode() { return code; }
        public String getDesc() { return desc; }

        public static RollbackStatus fromCode(String code) {
            for (RollbackStatus status : values()) {
                if (status.code.equals(code)) return status;
            }
            throw new IllegalArgumentException("Unknown RollbackStatus: " + code);
        }
    }
}
