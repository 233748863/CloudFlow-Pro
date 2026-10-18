package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.entity.HrGrievance;
import com.cloudflow.hr.exception.HrBusinessException;

import java.util.Objects;
import java.util.Set;

public final class HrGrievanceRules {
    private HrGrievanceRules() { }

    public static boolean targeted(HrGrievance grievance, Long userId) {
        return userId != null && "USER".equals(grievance.getAgainstType())
                && Objects.equals(userId, grievance.getAgainstId());
    }

    public static boolean canManage(HrGrievance grievance, Long userId, Long employeeId, boolean humanResources) {
        return userId != null && !targeted(grievance, userId)
                && !Objects.equals(employeeId, grievance.getEmployeeId())
                && (humanResources || Objects.equals(userId, grievance.getHandlerId()));
    }

    public static boolean canRead(HrGrievance grievance, Long userId, Long employeeId, boolean humanResources) {
        return userId != null && !targeted(grievance, userId)
                && (Objects.equals(employeeId, grievance.getEmployeeId())
                || canManage(grievance, userId, employeeId, humanResources));
    }

    public static String nextStatus(HrGrievance grievance, String action, Boolean satisfied) {
        String status = String.valueOf(grievance.getStatus());
        String target = switch (String.valueOf(action)) {
            case "accept" -> "SUBMITTED".equals(status) ? "ACCEPTED" : null;
            case "investigate" -> "ACCEPTED".equals(status) ? "INVESTIGATING" : null;
            case "resolve" -> "INVESTIGATING".equals(status) ? "RESOLVED" : null;
            case "withdraw" -> "SUBMITTED".equals(status) ? "WITHDRAWN" : null;
            case "escalate" -> Set.of("ACCEPTED", "INVESTIGATING").contains(status) ? "ESCALATED" : null;
            case "confirm" -> "RESOLVED".equals(status) && satisfied != null
                    ? (satisfied ? "CLOSED" : (Integer.valueOf(0).equals(grievance.getSatisfiedFlag()) ? null : "INVESTIGATING")) : null;
            default -> null;
        };
        if (target == null) throw new HrBusinessException("GRIEVANCE_STATUS_INVALID", "当前状态不允许该操作；结论最多退回调查一次");
        return target;
    }

    public static boolean terminal(String status) {
        return status != null && Set.of("CLOSED", "ESCALATED", "WITHDRAWN").contains(status);
    }
}
