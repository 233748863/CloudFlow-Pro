package com.cloudflow.common.security.im;

import java.time.LocalDateTime;
import java.util.Set;

public final class ImTaskCallbacks {
    private ImTaskCallbacks() { }

    public record Request(long tenantId, long callbackId, LocalDateTime claimUntil) {
        public Request {
            if (tenantId <= 0 || callbackId <= 0 || claimUntil == null) throw new IllegalArgumentException("回调处理凭据不合法");
        }
    }

    public record Actor(long tenantId, long callbackId, long configId, int configVersion, LocalDateTime claimUntil,
            long todoMappingId, int todoVersion, String taskId, int assignmentVersion, long bindingId, int bindingVersion,
            long userId, int userVersion, String action, int tenantVersion, Set<Long> entitlementMenuIds) {
        public Actor {
            if (tenantId <= 0 || callbackId <= 0 || configId <= 0 || configVersion < 0 || claimUntil == null
                    || todoMappingId <= 0 || todoVersion < 0 || taskId == null || !taskId.matches("[A-Za-z0-9_-]{1,64}")
                    || assignmentVersion < 0 || bindingId <= 0 || bindingVersion < 0 || userId <= 0 || userVersion < 0
                    || action == null || !Set.of("APPROVE", "REJECT").contains(action) || tenantVersion < 0
                    || entitlementMenuIds == null || entitlementMenuIds.stream().anyMatch(menu -> menu == null || menu <= 0)) {
                throw new IllegalArgumentException("回调操作身份不合法");
            }
            entitlementMenuIds = Set.copyOf(entitlementMenuIds);
        }

        public Request request() { return new Request(tenantId, callbackId, claimUntil); }
    }

    public record Outcome(String status, String code) {
        public Outcome {
            if (status == null || !Set.of("COMPLETED", "REJECTED", "RETRYABLE").contains(status)
                    || code == null || !code.matches("IM_[A-Z0-9_]{1,60}")) throw new IllegalArgumentException("回调结果不合法");
        }
    }
}
