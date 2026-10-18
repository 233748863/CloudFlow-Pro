package com.cloudflow.workflow.job;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
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
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实催办扫描与事务模板；Redis、锁、映射器和消息资源为受控输入。 */
public final class TaskReminderScanChecks {
    private static int checks;
    public static void main(String[] args) throws Exception {
        TenantContext.setTenantId(9001L); UserContext.setTenantId(9002L);
        try {
            verify();
            check(Objects.equals(TenantContext.getTenantId(),9001L) && Objects.equals(UserContext.getTenantId(),9002L),"caller contexts restored");
            System.out.println("TASK_REMINDER_SCAN_CHECKS: checks="+checks+"; failed=0; real_job_and_spring_transaction_template=true; controlled_redis_locks_mappers_and_messages=true; actual_database=false");
        } finally {TenantContext.clear();UserContext.clear();Thread.interrupted();}
    }
    private static void verify() throws Exception {
        Map<Long,Set<Object>> queues=new HashMap<>();
        queues.put(10L,new LinkedHashSet<>(List.of("failed:10","cleanup:30","done:10","no-owner:10","malformed","foreign:10")));
        queues.put(20L,new LinkedHashSet<>(List.of("other:10")));
        boolean[] registrationFailure={true},cleanupFailure={true},readFailure={false},held={true},interrupted={false};
        RuntimeException registrationError=new IllegalStateException("controlled message registration failure");
        RuntimeException cleanupError=new IllegalStateException("controlled reminder removal failure");
        RecordingTransactions transactions=new RecordingTransactions();
        RedisCache cache=new RedisCache(){
            @Override public Set<Object> getCacheZSetByScoreRange(String key,double min,double max){
                Long tenant=TenantContext.getTenantId();check(Objects.equals(tenant,UserContext.getTenantId()),"queue read has both tenant contexts");
                check(TaskReminderJob.REMINDER_ZSET_KEY.equals(key),"only reminder index read");
                if(readFailure[0] && tenant==10L)throw new IllegalStateException("controlled tenant queue failure");
                return new LinkedHashSet<>(queues.getOrDefault(tenant,Set.of()));
            }
            @Override public long removeCacheZSet(String key,Object... members){
                check(!TransactionSynchronizationManager.isActualTransactionActive(),"queue removal occurs after database commit");
                if(cleanupFailure[0] && members[0].equals("cleanup:30"))throw cleanupError;
                return queues.get(TenantContext.getTenantId()).remove(members[0])?1:0;
            }
        };
        RLock lock=proxy(RLock.class,(proxy,method,values)->{
            if(method.getName().equals("tryLock")){if(interrupted[0])throw new InterruptedException("controlled interrupt");return held[0];}
            if(method.getName().equals("isHeldByCurrentThread"))return held[0];
            if(method.getName().equals("unlock"))return null;
            throw new AssertionError(method.getName());
        });
        WfTaskMapper tasks=proxy(WfTaskMapper.class,(proxy,method,values)->{
            check(method.getName().equals("selectForUpdate") && TransactionSynchronizationManager.isActualTransactionActive(),"current task locked within transaction");
            Long tenant=TenantContext.getTenantId();check(Objects.equals(tenant,values[0]),"locked task query has exact tenant");
            String id=(String)values[1];if(id.equals("foreign"))return null;
            WfTask row=new WfTask();row.setTaskId(id);row.setTenantId(tenant);row.setAssignee(id.equals("no-owner")?null:tenant+1);
            row.setNodeName("review");row.setInstanceId("instance");row.setStatus(id.equals("done")?"DONE":"TODO");row.setDueTime(LocalDateTime.of(2026,10,3,18,0));return row;
        });
        WfProcessInstanceMapper instances=proxy(WfProcessInstanceMapper.class,(proxy,method,values)->{WfProcessInstance row=new WfProcessInstance();row.setTitle("review");return row;});
        MessageSender sender=request->{
            check(TransactionSynchronizationManager.isActualTransactionActive(),"message registration shares task transaction");
            check("WF_TASK_URGE".equals(request.getTemplateCode()) && "WF_TASK_URGE".equals(request.getBizType()),"approved reminder template and business type");
            check(request.getParams().containsKey("processTitle") && request.getParams().containsKey("nodeName"),"template required parameters complete");
            check(request.getReceivers().get(0).getReceiverId().equals(TenantContext.getTenantId()+1),"current task assignee is receiver");
            if(registrationFailure[0] && request.getBizId().startsWith("failed:"))throw registrationError;
            transactions.pending.add(request);
        };
        TaskReminderJob job=new TaskReminderJob();
        inject(job,"redisCache",cache);inject(job,"redissonClient",proxy(RedissonClient.class,(proxy,method,values)->lock));
        inject(job,"taskMapper",tasks);inject(job,"processInstanceMapper",instances);inject(job,"sysNoticeService",sender);
        inject(job,"transactionTemplate",new TransactionTemplate(transactions));
        inject(job,"tenantIterator",new TenantIterator(null){@Override public List<Long> listActiveTenantIds(){return List.of(10L,20L);}});
        RuntimeException failed=caught(job::scanTaskReminders);
        check(failed.getSuppressed().length==2 && failed.getSuppressed()[0].getCause()==registrationError && failed.getSuppressed()[1].getCause()==cleanupError,"both original item failures reported");
        check(queues.get(10L).equals(Set.of("failed:10","cleanup:30")) && queues.get(20L).isEmpty(),"failed items retained while stale and successful items removed across tenants");
        check(transactions.committed.size()==2 && transactions.rollbacks==1,"registration failure rolls back but other messages commit");
        registrationFailure[0]=false;cleanupFailure[0]=false;
        JobResult recovered=job.scanTaskReminders();
        check(recovered.getAffectedRows()==2 && "催办扫描完成：已提交2条提醒请求".equals(recovered.getResultMsg()),"recovery reports submitted request count");
        check(transactions.committed.size()==3 && transactions.replays==1 && queues.values().stream().allMatch(Set::isEmpty),"postcommit cleanup retry uses identical message identity and empties queues");
        check(job.scanTaskReminders().getAffectedRows()==0,"empty queues produce zero requests");
        readFailure[0]=true;queues.get(20L).add("another:10");
        check(caught(job::scanTaskReminders).getSuppressed().length==1 && queues.get(20L).isEmpty(),"failed tenant queue does not stop other tenant");
        readFailure[0]=false;held[0]=false;
        check("SKIPPED".equals(job.scanTaskReminders().getExecuteStatus()),"unavailable lock reported as skipped");
        held[0]=true;interrupted[0]=true;
        check(caught(job::scanTaskReminders).getCause() instanceof InterruptedException && Thread.currentThread().isInterrupted(),"lock interruption fails and retains interrupt flag");
        Thread.interrupted();interrupted[0]=false;
        inject(job,"tenantIterator",new TenantIterator(null){@Override public List<Long> listActiveTenantIds(){return List.of();}});
        check(job.scanTaskReminders().getAffectedRows()==0,"empty tenant list produces zero requests");
        registration(job);
    }
    private static void registration(TaskReminderJob job)throws Exception {
        Map<String,Set<Object>> indexes=new LinkedHashMap<>();
        inject(job,"redisCache",new RedisCache(){
            @Override public boolean setCacheZSet(String key,Object value,double score){return indexes.computeIfAbsent(key,ignored->new LinkedHashSet<>()).add(value);}
            @Override public long removeCacheZSet(String key,Object... values){long count=0;for(Object value:values)if(indexes.getOrDefault(key,Set.of()).remove(value))count++;return count;}
        });
        for(boolean commit:List.of(false,true)){
            TransactionSynchronizationManager.initSynchronization();
            try{job.registerAfterCommit("registered",2);check(indexes.isEmpty(),"uncommitted task creates no indexes");
                if(commit)for(TransactionSynchronization synchronization:TransactionSynchronizationManager.getSynchronizations())synchronization.afterCommit();
            }finally{TransactionSynchronizationManager.clearSynchronization();}
            check(commit==!indexes.isEmpty(),"only committed registration creates indexes");
        }
        check(indexes.get(TaskReminderJob.REMINDER_ZSET_KEY).size()==3 && indexes.get("sys:task:timeouts").size()==1,"three reminder points and timeout retained");
        job.cancelReminders("registered");check(indexes.values().stream().allMatch(Set::isEmpty),"cancellation removes reminder and timeout indexes");
    }
    private static final class RecordingTransactions extends AbstractPlatformTransactionManager{
        private final Map<String,MessageSendRequest> committed=new LinkedHashMap<>();private List<MessageSendRequest> pending;private int rollbacks,replays;
        @Override protected Object doGetTransaction(){return new Object();}
        @Override protected void doBegin(Object transaction,TransactionDefinition definition){pending=new ArrayList<>();}
        @Override protected void doCommit(DefaultTransactionStatus status){for(MessageSendRequest request:pending){MessageSendRequest old=committed.putIfAbsent(request.getDeduplicationKey(),request);if(old!=null){check(old.equals(request),"replay payload remains identical");replays++;}}}
        @Override protected void doRollback(DefaultTransactionStatus status){pending.clear();rollbacks++;}
    }
    private static void inject(Object target,String name,Object value)throws Exception{Field field=target.getClass().getDeclaredField(name);field.setAccessible(true);field.set(target,value);}
    private static RuntimeException caught(Runnable operation){try{operation.run();}catch(RuntimeException failure){return failure;}throw new AssertionError("expected failure");}
    private static <T>T proxy(Class<T> type,InvocationHandler handler){return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler));}
    private static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
}
