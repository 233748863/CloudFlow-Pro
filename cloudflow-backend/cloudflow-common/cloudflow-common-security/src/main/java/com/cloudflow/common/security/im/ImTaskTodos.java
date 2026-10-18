package com.cloudflow.common.security.im;

import java.util.List;
import java.util.Set;

public final class ImTaskTodos {
    private ImTaskTodos() { }

    public record Scan(String afterTaskId) {
        public Scan {
            if (afterTaskId == null) afterTaskId = "";
            if (!afterTaskId.isEmpty() && !afterTaskId.matches("[A-Za-z0-9_-]{1,64}")) throw new IllegalArgumentException("待办扫描位置无效");
        }
    }

    public record Candidate(long tenantId, String taskId, int assignmentVersion, List<Long> receivers) {
        public Candidate {
            if (tenantId <= 0 || taskId == null || !taskId.matches("[A-Za-z0-9_-]{1,64}") || assignmentVersion < 0
                    || receivers == null || receivers.isEmpty() || receivers.size() > 2
                    || receivers.stream().anyMatch(receiver -> receiver == null || receiver <= 0)
                    || receivers.stream().distinct().count() != receivers.size()) throw new IllegalArgumentException("待办扫描结果无效");
            receivers = List.copyOf(receivers);
        }
    }

    public record Page(String nextTaskId, List<Candidate> candidates) {
        public Page {
            new Scan(nextTaskId);
            if (candidates == null || candidates.size() > 100 || candidates.stream().anyMatch(candidate -> candidate == null)) {
                throw new IllegalArgumentException("待办扫描批次无效");
            }
            candidates = List.copyOf(candidates);
        }
    }

    public record Request(long tenantId, long mappingId) {
        public Request {
            if (tenantId <= 0 || mappingId <= 0) throw new IllegalArgumentException("待办映射标识无效");
        }
    }

    public record Status(Request request, String state) {
        public Status {
            if (request == null || state == null || !Set.of("ACTIVE", "COMPLETED", "CANCELLED").contains(state)) throw new IllegalArgumentException("待办状态无效");
        }
    }

    public record Actor(Request request, int mappingVersion, long configId, int configVersion,
            String taskId, int assignmentVersion, long bindingId, int bindingVersion,
            long userId, int userVersion, int tenantVersion, Set<String> permissions) {
        public Actor {
            if (request == null || mappingVersion < 0 || configId <= 0 || configVersion < 0
                    || taskId == null || !taskId.matches("[A-Za-z0-9_-]{1,64}") || assignmentVersion < 0
                    || bindingId <= 0 || bindingVersion < 0 || userId <= 0 || userVersion < 0 || tenantVersion < 0
                    || permissions == null || permissions.stream().anyMatch(permission -> permission == null || permission.isBlank())) {
                throw new IllegalArgumentException("待办接收人身份无效");
            }
            permissions = Set.copyOf(permissions);
        }
    }

    public record Field(String label, String value) {
        public Field {
            if (label == null || label.isBlank() || label.codePointCount(0, label.length()) > 16
                    || value == null || value.isBlank() || value.codePointCount(0, value.length()) > 128) {
                throw new IllegalArgumentException("待办摘要字段无效");
            }
        }
        @Override public String toString() { return "ImTaskTodos.Field[protected]"; }
    }

    public record Projection(Request request, String state, String instanceId, String title, String initiator,
            boolean directAction, List<Field> fields) {
        public Projection {
            if (request == null || state == null || !Set.of("ACTIVE", "COMPLETED", "CANCELLED").contains(state)
                    || fields == null || fields.size() > 5 || fields.stream().anyMatch(field -> field == null)) {
                throw new IllegalArgumentException("待办展示内容无效");
            }
            if ("ACTIVE".equals(state)) {
                if (instanceId == null || !instanceId.matches("[A-Za-z0-9_-]{1,64}") || title == null || title.isBlank()
                        || initiator == null || initiator.isBlank()) throw new IllegalArgumentException("待办详情无效");
            } else if (instanceId != null || title != null || initiator != null || directAction || !fields.isEmpty()) {
                throw new IllegalArgumentException("已失效待办不得携带表单内容");
            }
            fields = List.copyOf(fields);
        }
        @Override public String toString() { return "ImTaskTodos.Projection[protected]"; }
        public static Projection terminal(Request request, String state) { return new Projection(request, state, null, null, null, false, List.of()); }
    }
}
