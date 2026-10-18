import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.WorkflowCompletionContext;
import com.cloudflow.workflow.service.WorkflowImCompletionContext;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public final class WorkflowImCompletionChecks {
    private static final AtomicInteger CHECKS = new AtomicInteger();

    public static void run() {
        Long previousTenant = UserContext.getTenantId();
        Long previousUser = UserContext.getUserId();
        UserContext.setTenantId(991901L); UserContext.setUserId(991903L);
        try {
            WorkflowImCompletionContext.Command command = command(1, "task", 3, "APPROVE");
            WfTask task = task();
            WfTaskHistory ordinary = history("APPROVE");
            WorkflowImCompletionContext.correlate(task, ordinary);
            check("original-history".equals(ordinary.getHistoryId()), "ordinary task history remains unchanged");
            WorkflowImCompletionContext.require(null, null);
            WorkflowImCompletionContext.call(command, () -> {
                WorkflowImCompletionContext.require(task, "APPROVE");
                WfTaskHistory history = history("APPROVE");
                WorkflowImCompletionContext.correlate(task, history);
                check(command.historyId().equals(history.getHistoryId()), "verified primary history receives server event identity");
                rejected(() -> WorkflowImCompletionContext.correlate(task, history("APPROVE")), "one external operation cannot label two primary histories");
                rejected(() -> WorkflowImCompletionContext.call(command, () -> null), "nested external operation rejected");
                return null;
            });
            check(command.historyId().equals(command(1, "task", 3, "REJECT").historyId()), "same callback cannot create separate approve and reject histories");
            check(!command.historyId().equals(command(2, "task", 3, "APPROVE").historyId()), "different callback histories differ");
            check(!command.historyId().equals(new WorkflowImCompletionContext.Command(991902, 1, "task", 3, 991903, "APPROVE").historyId()), "tenant boundaries separate callback histories");
            for (String action : List.of("APPROVE", "REJECT")) WorkflowImCompletionContext.call(command(2, "task", 3, action), () -> {
                WfTaskHistory history = history("COUNTERSIGN_" + action);
                WorkflowImCompletionContext.correlate(task, history);
                check(command(2, "task", 3, action).historyId().equals(history.getHistoryId()), "countersign action keeps event identity");
                return null;
            });
            rejected(() -> WorkflowImCompletionContext.call(command(1, "task", 2, "APPROVE"), () -> { WorkflowImCompletionContext.require(task, "APPROVE"); return null; }), "old assignment version rejected");
            rejected(() -> WorkflowImCompletionContext.call(command(1, "other-task", 3, "APPROVE"), () -> { WorkflowImCompletionContext.require(task, "APPROVE"); return null; }), "other task rejected");
            rejected(() -> WorkflowImCompletionContext.call(command, () -> { WorkflowImCompletionContext.require(task, "REJECT"); return null; }), "different action rejected");
            task.setStatus("DONE");
            rejected(() -> WorkflowImCompletionContext.call(command, () -> { WorkflowImCompletionContext.require(task, "APPROVE"); return null; }), "completed task rejected");
            task.setStatus("TODO"); task.setAssignee(991904L);
            rejected(() -> WorkflowImCompletionContext.call(command, () -> { WorkflowImCompletionContext.require(task, "APPROVE"); return null; }), "unassigned administrator identity receives no bypass");
            task.setAssignee(991903L);
            rejected(() -> WorkflowImCompletionContext.call(command, () -> {
                UserContext.setUserId(991904L);
                WorkflowImCompletionContext.require(task, "APPROVE");
                return null;
            }), "identity change inside operation rejected");
            UserContext.setUserId(991903L);
            WorkflowImCompletionContext.call(command, () -> {
                WfTask child = task(); child.setTaskId("automatic-child");
                WorkflowCompletionContext.automatically(() -> { WorkflowImCompletionContext.require(child, "APPROVE"); return null; });
                WfTaskHistory childHistory = history("APPROVE"); childHistory.setTaskId(child.getTaskId());
                WorkflowImCompletionContext.correlate(child, childHistory);
                check("original-history".equals(childHistory.getHistoryId()), "automatic child history remains independent");
                rejected(() -> WorkflowCompletionContext.automatically(() -> { WorkflowImCompletionContext.require(task, "APPROVE"); return null; }), "external primary cannot impersonate automatic approval");
                return null;
            });
            WorkflowImCompletionContext.correlate(task, ordinary);
            check("original-history".equals(ordinary.getHistoryId()), "context cleared after successful and failed calls");
            System.out.println("G4_IM_WORKFLOW_CONTEXT: assertions=" + CHECKS.get() + "; failed=0; thread_scope=true; database=false; http=false");
        } finally { UserContext.setTenantId(previousTenant); UserContext.setUserId(previousUser); }
    }

    private static WorkflowImCompletionContext.Command command(long callback, String task, int version, String action) {
        return new WorkflowImCompletionContext.Command(991901, callback, task, version, 991903, action);
    }
    private static WfTask task() {
        WfTask task = new WfTask(); task.setTaskId("task"); task.setTenantId(991901L); task.setVersion(3); task.setAssignee(991903L); task.setStatus("TODO"); return task;
    }
    private static WfTaskHistory history(String action) {
        WfTaskHistory history = new WfTaskHistory(); history.setHistoryId("original-history"); history.setTenantId(991901L); history.setTaskId("task"); history.setOperatorId(991903L); history.setAction(action); return history;
    }
    private static void rejected(Runnable operation, String message) {
        boolean rejected = false;
        try { operation.run(); } catch (WorkflowException failure) { rejected = "IM_TASK_CONTEXT_INVALID".equals(failure.getCode()); }
        check(rejected, message);
    }
    private static void check(boolean value, String message) { CHECKS.incrementAndGet(); if (!value) throw new AssertionError(message); }
}
