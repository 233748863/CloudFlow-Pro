package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.exception.WorkflowException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;
import java.util.function.Consumer;

public final class WorkflowImCompletionContext {
    private static final ThreadLocal<Frame> CURRENT = new ThreadLocal<>();

    private WorkflowImCompletionContext() { }

    public static <Result> Result call(Command command, Supplier<Result> operation) {
        return call(command, task -> { }, operation);
    }

    public static <Result> Result call(Command command, Consumer<WfTask> guard, Supplier<Result> operation) {
        if (command == null || guard == null || operation == null || CURRENT.get() != null || WorkflowCompletionContext.isAutomatic()) throw invalid();
        identity(command);
        CURRENT.set(new Frame(command, guard));
        try { return operation.get(); }
        finally { CURRENT.remove(); }
    }

    public static void require(WfTask task, String action) {
        Frame frame = CURRENT.get();
        if (frame == null) return;
        Command command = frame.command;
        if (task != null && !command.taskId().equals(task.getTaskId()) && WorkflowCompletionContext.isAutomatic()) return;
        identity(command);
        if (WorkflowCompletionContext.isAutomatic() || task == null || !Objects.equals(task.getTenantId(), command.tenantId())
                || !command.taskId().equals(task.getTaskId()) || !command.action().equals(action)
                || !Objects.equals(task.getVersion(), command.assignmentVersion()) || !"TODO".equals(task.getStatus())
                || !Objects.equals(task.getAssignee(), command.userId()) && !Objects.equals(task.getProxyUserId(), command.userId())) throw invalid();
        if (!frame.verified) {
            frame.guard.accept(task);
            frame.verified = true;
        }
    }

    public static void correlate(WfTask task, WfTaskHistory history) {
        Frame frame = CURRENT.get();
        if (frame == null || task == null || !frame.command.taskId().equals(task.getTaskId())) return;
        Command command = frame.command;
        identity(command);
        if (frame.recorded || history == null || !Objects.equals(task.getTenantId(), command.tenantId())
                || !Objects.equals(history.getTenantId(), command.tenantId()) || !command.taskId().equals(history.getTaskId())
                || !Objects.equals(history.getOperatorId(), command.userId())
                || !Set.of(command.action(), "COUNTERSIGN_" + command.action()).contains(Objects.toString(history.getAction(), ""))) throw invalid();
        history.setHistoryId(command.historyId());
        frame.recorded = true;
    }

    private static void identity(Command command) {
        if (!Objects.equals(UserContext.getTenantId(), command.tenantId()) || !Objects.equals(UserContext.getUserId(), command.userId())) throw invalid();
    }

    private static WorkflowException invalid() { return new WorkflowException("IM_TASK_CONTEXT_INVALID", "企业通信任务状态或操作身份已变化，请进入系统核对"); }

    public record Command(long tenantId, long callbackId, String taskId, int assignmentVersion, long userId, String action) {
        public Command {
            if (tenantId <= 0 || callbackId <= 0 || taskId == null || !taskId.matches("[A-Za-z0-9_-]{1,64}")
                    || assignmentVersion < 0 || userId <= 0 || action == null || !Set.of("APPROVE", "REJECT").contains(action)) throw invalid();
        }

        public String historyId() {
            String identity = "wecom-callback\n" + tenantId + "\n" + callbackId;
            try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8))); }
            catch (NoSuchAlgorithmException failure) { throw invalid(); }
        }
    }

    private static final class Frame {
        private final Command command;
        private final Consumer<WfTask> guard;
        private boolean verified;
        private boolean recorded;
        private Frame(Command command, Consumer<WfTask> guard) { this.command = command; this.guard = guard; }
    }
}
