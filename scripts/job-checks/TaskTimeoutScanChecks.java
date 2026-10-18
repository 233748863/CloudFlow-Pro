package com.cloudflow.workflow.job;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.service.IWfTaskService;
import com.cloudflow.workflow.service.TaskTimeoutNotifications;
import com.cloudflow.workflow.service.WorkflowCompletionContext;
import com.cloudflow.workflow.service.WorkflowNodePolicy;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Real job, notification builder and Spring transactions; engine and storage resources are controlled. */
public final class TaskTimeoutScanChecks {
    private static int checks;
    public static void main(String[] args) throws Exception {
        TenantContext.setTenantId(9001L); UserContext.setTenantId(9002L); UserContext.setUserId(9003L); UserContext.setUserName("caller");
        try {
            contexts(); failuresAndRecovery(); manualLimit(); cleanupAndBoundaries(); storageAndLocks();
            check(Objects.equals(TenantContext.getTenantId(),9001L) && Objects.equals(UserContext.getTenantId(),9002L),"tenant contexts restored");
            check(Objects.equals(UserContext.getUserId(),9003L) && "caller".equals(UserContext.getUserName()),"actor restored");
            System.out.println("TASK_TIMEOUT_SCAN_CHECKS: checks="+checks+"; failed=0; real_job_notifications_and_spring_transactions=true; controlled_engine_redis_locks_and_mappers=true; actual_database=false");
        } finally {TenantContext.clear();UserContext.clear();Thread.interrupted();}
    }

    private static void contexts() {
        check(!WorkflowCompletionContext.isTimeoutTask("one"),"no inherited timeout identity");
        WorkflowCompletionContext.forTimeout("one",()->{
            check(!WorkflowCompletionContext.isTimeoutTask("one"),"manual operation cannot obtain automatic timeout privilege");
            WorkflowCompletionContext.automatically(()->{
                check(WorkflowCompletionContext.isTimeoutTask("one") && !WorkflowCompletionContext.isTimeoutTask("next"),"only matching automatic task may notify");
                caught(()->WorkflowCompletionContext.forTimeout("two",()->{check(WorkflowCompletionContext.isTimeoutTask("two"),"nested identity");throw new IllegalStateException("nested");}));
                check(WorkflowCompletionContext.isTimeoutTask("one"),"nested failure restores parent identity");return null;
            });return null;
        });
        check(!WorkflowCompletionContext.isAutomatic() && !WorkflowCompletionContext.isTimeoutTask("one"),"automatic source fully restored");
    }

    private static void failuresAndRecovery() throws Exception {
        Fixture fixture=new Fixture();
        fixture.add("notify",10L,"RUNNING","AUTO_PASS");fixture.add("same",10L,"RUNNING","AUTO_PASS");fixture.add("other",20L,"RUNNING","AUTO_REJECT");
        fixture.messageFailure.add("notify");long before=System.currentTimeMillis();
        RuntimeException failure=caught(fixture.job::scanTimeoutTasks);
        check(failure.getSuppressed().length==1,"single original task failure reported");
        check(!fixture.transactions.done.contains("notify") && fixture.transactions.done.containsAll(Set.of("same","other")),"failed notification rolls back engine effect while other tenants continue");
        check(fixture.transactions.committed.size()==4 && fixture.transactions.rollbacks==1,"second recipient failure rolls back first message");
        check(fixture.retries.get("10:notify")==1 && fixture.queues.get(10L).get("notify")>=before+300000 && fixture.queues.get(10L).get("notify")<=System.currentTimeMillis()+300000,"five minute backoff and first failure count");
        check(fixture.job.scanTimeoutTasks().getAffectedRows()==0 && fixture.attempts.get("notify")==1,"backoff prevents premature retry");
        fixture.messageFailure.clear();fixture.due("notify",10L);
        JobResult recovered=fixture.job.scanTimeoutTasks();
        check(recovered.getAffectedRows()==1 && recovered.getResultMsg().equals("超时扫描完成：自动处理1项，转人工0项，移除失效0项，暂缓0项"),"recovery counts only actual automatic completion");
        check(fixture.transactions.committed.size()==6 && !fixture.retries.containsKey("10:notify"),"all messages committed and retry key cleared");
        fixture.due("notify",10L);
        JobResult replay=fixture.job.scanTimeoutTasks();
        check(replay.getAffectedRows()==0 && replay.getResultMsg().contains("移除失效1项") && fixture.attempts.get("notify")==2 && fixture.transactions.committed.size()==6,"replayed completed task neither executes nor notifies again");
        check(fixture.transactions.committed.values().stream().anyMatch((MessageSendRequest request)->request.getContent().contains("自动驳回")),"reject action remains visible in request");
    }

    private static void manualLimit() throws Exception {
        Fixture fixture=new Fixture();fixture.add("manual",10L,"RUNNING","AUTO_PASS");fixture.engineFailure.add("manual");
        for(int attempt=1;attempt<=2;attempt++) {
            fixture.due("manual",10L);caught(fixture.job::scanTimeoutTasks);
            check(fixture.attempts.get("manual")==attempt && fixture.retries.get("10:manual")==attempt,"automatic failure counted exactly once");
        }
        fixture.manualFailure.add("manual");fixture.due("manual",10L);caught(fixture.job::scanTimeoutTasks);
        check(fixture.attempts.get("manual")==3 && fixture.retries.get("10:manual")==3 && fixture.queues.get(10L).containsKey("manual"),"third failure retains pending manual notice and cap");
        check(fixture.transactions.committed.isEmpty(),"failed manual notice rolls back all recipients");
        int calls=fixture.messageAttempts;
        caught(fixture.job::scanTimeoutTasks);
        check(fixture.attempts.get("manual")==3 && fixture.retries.get("10:manual")==3 && fixture.messageAttempts==calls+2,"subsequent scan retries notice once without fourth engine call");
        fixture.manualFailure.clear();fixture.cleanupFailure.add("manual");caught(fixture.job::scanTimeoutTasks);
        check(fixture.transactions.committed.size()==2 && fixture.retries.get("10:manual")==3,"committed notice survives queue cleanup failure");
        fixture.cleanupFailure.clear();JobResult result=fixture.job.scanTimeoutTasks();
        check(result.getAffectedRows()==0 && result.getResultMsg().contains("转人工1项"),"manual transfer never counted as automatic completion");
        check(fixture.attempts.get("manual")==3 && fixture.transactions.committed.size()==2 && fixture.transactions.replays==2,"manual replay keeps stable identities and no fourth attempt");
        check(fixture.queues.get(10L).isEmpty() && !fixture.retries.containsKey("10:manual"),"manual success finally removes queue and counter");
        check(fixture.transactions.committed.values().stream().allMatch((MessageSendRequest request)->request.getContent().contains("人工处理")),"manual intervention wording preserved");
    }

    private static void cleanupAndBoundaries() throws Exception {
        Fixture fixture=new Fixture();
        fixture.add("paused",10L,"PAUSED","AUTO_PASS");fixture.add("failed",10L,"FAILED","AUTO_PASS");fixture.add("ended",10L,"PASSED","AUTO_PASS");
        fixture.add("missing-instance",10L,"RUNNING","AUTO_PASS");fixture.instances.remove("missing-instance");fixture.due("missing-task",10L);
        fixture.add("foreign",20L,"RUNNING","AUTO_PASS");fixture.queues.get(20L).remove("foreign");fixture.due("foreign",10L);
        fixture.add("future",10L,"RUNNING","AUTO_PASS");fixture.queues.get(10L).put("future",System.currentTimeMillis()+3600000D);
        JobResult result=fixture.job.scanTimeoutTasks();
        check(result.getAffectedRows()==0 && result.getResultMsg().contains("移除失效4项，暂缓2项"),"paused failed completed missing and foreign boundaries");
        check(fixture.attempts.isEmpty() && fixture.retries.isEmpty() && fixture.transactions.committed.isEmpty(),"excluded tasks consume no retry and send no notification");
        fixture.queues.get(10L).put("negative",-1D);fixture.queues.get(10L).put("zero",0D);fixture.queues.get(20L).put("other-negative",-2D);
        fixture.readFailure.add(10L);caught(fixture.job::cleanupExpiredKeys);
        check(!fixture.queues.get(20L).containsKey("other-negative") && fixture.queues.get(10L).containsKey("zero"),"cleanup failure continues other tenant");
        fixture.readFailure.clear();result=fixture.job.cleanupExpiredKeys();
        check(result.getAffectedRows()==2 && result.getResultMsg().equals("超时队列清理完成：移除2条异常记录"),"cleanup reports actual removed count");
        check(fixture.queues.get(10L).keySet().equals(Set.of("paused","failed","future")),"cleanup preserves positive scores including paused and future");
        check(fixture.job.cleanupExpiredKeys().getAffectedRows()==0,"cleanup repeat reports zero");
        Fixture owner=new Fixture();owner.add("owner",10L,"RUNNING","AUTO_PASS");owner.instances.get("owner").setStartUserId(11L);
        check(owner.job.scanTimeoutTasks().getAffectedRows()==1 && owner.transactions.committed.size()==1,"assignee initiator same person notified once");
    }

    private static void storageAndLocks() throws Exception {
        Fixture fixture=new Fixture();fixture.add("first",10L,"RUNNING","AUTO_PASS");fixture.add("second",20L,"RUNNING","AUTO_PASS");fixture.readFailure.add(10L);
        caught(fixture.job::scanTimeoutTasks);check(fixture.attempts.equals(Map.of("second",1)),"queue read failure does not stop other tenant");
        fixture.readFailure.clear();fixture.cleanupFailure.add("first");caught(fixture.job::scanTimeoutTasks);
        check(fixture.transactions.done.contains("first") && fixture.retries.isEmpty(),"postcommit cleanup failure is not an engine retry");
        fixture.cleanupFailure.clear();check(fixture.job.scanTimeoutTasks().getAffectedRows()==0 && fixture.attempts.get("first")==1,"postcommit replay only clears stale index");
        fixture.add("counter",10L,"RUNNING","AUTO_PASS");fixture.engineFailure.add("counter");fixture.incrementFailure=true;caught(fixture.job::scanTimeoutTasks);
        check(!fixture.retries.containsKey("10:counter") && fixture.queues.get(10L).containsKey("counter"),"failed counter does not fabricate one or remove work");
        fixture.incrementFailure=false;fixture.held=false;
        check(fixture.job.scanTimeoutTasks().getExecuteStatus().equals("SKIPPED") && fixture.job.cleanupExpiredKeys().getExecuteStatus().equals("SKIPPED"),"unavailable locks return skipped");
        fixture.held=true;fixture.interrupted=true;
        check(caught(fixture.job::scanTimeoutTasks).getCause() instanceof InterruptedException && Thread.currentThread().isInterrupted(),"scan interruption preserved");Thread.interrupted();
        check(caught(fixture.job::cleanupExpiredKeys).getCause() instanceof InterruptedException && Thread.currentThread().isInterrupted(),"cleanup interruption preserved");Thread.interrupted();fixture.interrupted=false;
        WfTask task=fixture.tasks.get("counter");WfProcessInstance instance=fixture.instances.get("counter");
        caught(()->fixture.notifications.manual(task,instance));
        TenantBroker.runAs(20L,ignored->caught(()->fixture.template.execute(status->{fixture.notifications.manual(task,instance);return null;})));
        check(fixture.transactions.committed.size()==4,"outside transaction or foreign tenant cannot register messages");
    }

    private static final class Fixture {
        private final TaskTimeoutJob job=new TaskTimeoutJob();
        private final Map<Long,Map<String,Double>> queues=new LinkedHashMap<>();
        private final Map<String,Long> retries=new HashMap<>();
        private final Map<String,WfTask> tasks=new HashMap<>();private final Map<String,WfProcessInstance> instances=new HashMap<>();
        private final Map<String,String> actions=new HashMap<>();private final Map<String,Integer> attempts=new HashMap<>();
        private final Set<String> engineFailure=new LinkedHashSet<>(),messageFailure=new LinkedHashSet<>(),manualFailure=new LinkedHashSet<>(),cleanupFailure=new LinkedHashSet<>();
        private final Set<Long> readFailure=new LinkedHashSet<>();
        private boolean held=true,interrupted,incrementFailure;private int messageAttempts;
        private final RecordingTransactions transactions=new RecordingTransactions();
        private final TransactionTemplate template=new TransactionTemplate(transactions);
        private final TaskTimeoutNotifications notifications;

        private Fixture() throws Exception {
            queues.put(10L,new LinkedHashMap<>());queues.put(20L,new LinkedHashMap<>());
            MessageSender sender=request->{
                messageAttempts++;check(TransactionSynchronizationManager.isActualTransactionActive(),"notice registered inside transaction");
                check("WF_TASK_TIMEOUT".equals(request.getTemplateCode()) && "WF_TASK_TIMEOUT".equals(request.getBizType()),"approved timeout template and business source");
                check(request.getTitle().equals(request.getParams().get("title")) && request.getContent().equals(request.getParams().get("content")),"template receives action-specific title and content");
                Long receiver=request.getReceivers().get(0).getReceiverId();Long tenant=TenantContext.getTenantId();
                check(receiver==tenant+1 || receiver==tenant+2,"receiver remains in task tenant");
                String taskId=(String)request.getParams().get("taskId");
                if(receiver==tenant+2 && (messageFailure.contains(taskId) && request.getBizId().contains("automatic:") || manualFailure.contains(taskId) && request.getBizId().endsWith(":manual"))) throw new IllegalStateException("controlled second-recipient registration failure");
                transactions.pending.add(request);
            };
            notifications=new TaskTimeoutNotifications(sender);
            RedisCache cache=new RedisCache(){
                @Override public Set<Object> getCacheZSetByScoreRange(String key,double min,double max){check(Objects.equals(TenantContext.getTenantId(),UserContext.getTenantId()),"queue has matching tenant contexts");if(readFailure.contains(TenantContext.getTenantId()))throw new IllegalStateException("controlled queue read failure");Set<Object> result=new LinkedHashSet<>();queues.get(TenantContext.getTenantId()).forEach((String id,Double score)->{if(score>=min&&score<=max)result.add(id);});return result;}
                @Override @SuppressWarnings("unchecked") public <T>T getCacheObject(String key){return (T)retries.get(TenantContext.getTenantId()+":"+key.substring("sys:task:timeout:retry:".length()));}
                @Override public long increment(String key){if(incrementFailure)throw new IllegalStateException("controlled increment failure");return retries.merge(TenantContext.getTenantId()+":"+key.substring("sys:task:timeout:retry:".length()),1L,Long::sum);}
                @Override public boolean setCacheZSet(String key,Object member,double score){return queues.get(TenantContext.getTenantId()).put(member.toString(),score)==null;}
                @Override public long removeCacheZSet(String key,Object... members){check(!TransactionSynchronizationManager.isActualTransactionActive(),"queue removal after database commit");String id=members[0].toString();if(cleanupFailure.contains(id))throw new IllegalStateException("controlled cleanup failure");return queues.get(TenantContext.getTenantId()).remove(id)==null?0:1;}
                @Override public boolean deleteObject(String key){return retries.remove(TenantContext.getTenantId()+":"+key.substring("sys:task:timeout:retry:".length()))!=null;}
                @Override public long removeCacheZSetByScoreRange(String key,double min,double max){if(readFailure.contains(TenantContext.getTenantId()))throw new IllegalStateException("controlled cleanup read failure");Map<String,Double> queue=queues.get(TenantContext.getTenantId());int before=queue.size();queue.entrySet().removeIf((Map.Entry<String,Double> entry)->entry.getValue()>=min&&entry.getValue()<=max);return before-queue.size();}
            };
            RLock lock=proxy(RLock.class,(target,method,values)->{if(method.getName().equals("tryLock")){check(values.length==2 && values[1]==java.util.concurrent.TimeUnit.SECONDS,"scan and cleanup retain renewable locks until completion");if(interrupted)throw new InterruptedException("controlled lock interruption");return held;}if(method.getName().equals("isHeldByCurrentThread"))return held;if(method.getName().equals("unlock"))return null;throw new AssertionError(method.getName());});
            WfTaskMapper mapper=proxy(WfTaskMapper.class,(target,method,values)->{
                String id;if(method.getName().equals("selectForUpdate")){check(TransactionSynchronizationManager.isActualTransactionActive() && Objects.equals(values[0],TenantContext.getTenantId()),"manual notification locks current tenant task");id=(String)values[1];}else{check(method.getName().equals("selectById"),"expected task query");id=(String)values[0];}
                WfTask task=tasks.get(id);return task==null || transactions.done.contains(id) || !Objects.equals(task.getTenantId(),TenantContext.getTenantId())?null:task;
            });
            WfProcessInstanceMapper processes=proxy(WfProcessInstanceMapper.class,(target,method,values)->instances.get((String)values[0]));
            WorkflowNodePolicy policy=new WorkflowNodePolicy(null,null,null){@Override public WfNodeConfig resolveNode(WfProcessInstance instance,String node){WfNodeConfig result=new WfNodeConfig();result.setSlaAction(actions.get(instance.getInstanceId()));return result;}};
            IWfTaskService engine=proxy(IWfTaskService.class,(target,method,values)->{
                check(method.getName().equals("completeAutomaticTask"),"full automatic engine entry only");String id=(String)values[0];attempts.merge(id,1,Integer::sum);
                check(Objects.equals(UserContext.getUserId(),tasks.get(id).getAssignee()) && "系统自动处理".equals(UserContext.getUserName()),"automatic actor remains assignee");
                if(engineFailure.contains(id))throw new IllegalStateException("controlled engine failure");
                return WorkflowCompletionContext.automatically(()->template.execute(status->{check(WorkflowCompletionContext.isTimeoutTask(id),"engine receives exact timeout source");transactions.pendingDone.add(id);notifications.completed(tasks.get(id),instances.get(id),(String)values[1]);return R.ok();}));
            });
            inject(job,"redisCache",cache);inject(job,"redissonClient",proxy(RedissonClient.class,(target,method,values)->lock));inject(job,"taskMapper",mapper);inject(job,"processInstanceMapper",processes);
            inject(job,"taskService",engine);inject(job,"nodePolicy",policy);inject(job,"transactionTemplate",template);inject(job,"timeoutNotifications",notifications);
            inject(job,"tenantIterator",new TenantIterator(null){@Override public List<Long> listActiveTenantIds(){return List.of(10L,20L);}});
        }
        private void add(String id,Long tenant,String status,String action){WfTask task=new WfTask();task.setTaskId(id);task.setInstanceId(id);task.setTenantId(tenant);task.setStatus("TODO");task.setNodeKey("review");task.setNodeName("review");task.setAssignee(tenant+1);task.setDueTime(LocalDateTime.of(2026,10,3,1,0));tasks.put(id,task);WfProcessInstance instance=new WfProcessInstance();instance.setInstanceId(id);instance.setTenantId(tenant);instance.setStatus(status);instance.setStartUserId(tenant+2);instance.setTitle(id);instances.put(id,instance);actions.put(id,action);due(id,tenant);}
        private void due(String id,Long tenant){queues.get(tenant).put(id,1D);}
    }
    private static final class RecordingTransactions extends AbstractPlatformTransactionManager {
        private final Map<String,MessageSendRequest> committed=new LinkedHashMap<>();private final Set<String> done=new LinkedHashSet<>();
        private List<MessageSendRequest> pending;private Set<String> pendingDone;private int rollbacks,replays;
        @Override protected Object doGetTransaction(){return new Object();}
        @Override protected void doBegin(Object transaction,TransactionDefinition definition){pending=new ArrayList<>();pendingDone=new LinkedHashSet<>();}
        @Override protected void doCommit(DefaultTransactionStatus status){done.addAll(pendingDone);for(MessageSendRequest request:pending){MessageSendRequest old=committed.putIfAbsent(request.getDeduplicationKey(),request);if(old!=null){check(old.equals(request),"stable retry payload");replays++;}}}
        @Override protected void doRollback(DefaultTransactionStatus status){pending.clear();pendingDone.clear();rollbacks++;}
    }
    private static void inject(Object target,String name,Object value)throws Exception{Field field=target.getClass().getDeclaredField(name);field.setAccessible(true);field.set(target,value);}
    private static RuntimeException caught(Runnable operation){try{operation.run();}catch(RuntimeException failure){return failure;}throw new AssertionError("expected failure");}
    private static <T>T proxy(Class<T> type,InvocationHandler handler){return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler));}
    private static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
}
