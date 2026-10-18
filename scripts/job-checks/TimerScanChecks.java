package com.cloudflow.workflow.job;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.cloudflow.workflow.service.IWfTaskService;
import com.cloudflow.workflow.service.TimerSchedulerService;
import com.cloudflow.workflow.service.WorkflowGatewayService;
import com.cloudflow.workflow.service.WorkflowProcessStateService;
import com.cloudflow.workflow.service.WorkflowWaitState;
import com.cloudflow.workflow.service.impl.WfInstanceServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Real scan, timer continuation and persistent retry; storage and downstream task completion are controlled. */
public final class TimerScanChecks {
    private static int checks;
    public static void main(String[] args) throws Exception {
        successfulAndExcluded();
        invalidCacheIdentity();
        retryAndRollback();
        exhaustedNotificationRecovery();
        storageAndCleanup();
        lockAndRecovery();
        System.out.println("TIMER_SCAN_CHECKS: checks="+checks+"; failed=0; real_scan_continuation_scheduler=true; database_redis_downstream_controlled=true");
    }

    private static void successfulAndExcluded() throws Exception {
        Fixture f=new Fixture();f.add("pass",10L,"PENDING","AUTO_PASS");f.add("reject",20L,"PENDING","AUTO_REJECT");
        f.add("notice",10L,"PENDING","NOTIFY_ONLY");f.add("paused",10L,"PAUSED","AUTO_PASS");f.add("failed",10L,"FAILED","AUTO_PASS");
        f.add("future",10L,"PENDING","AUTO_PASS");f.change("future",Map.of("expireAt",System.currentTimeMillis()+3600000L));
        f.add("ended",10L,"CANCELLED","AUTO_PASS");f.add("missing",10L,"PENDING","AUTO_PASS");f.instances.remove("missing");
        f.add("foreign",20L,"PENDING","AUTO_PASS");f.instances.get("foreign").setTenantId(30L);
        JobResult result=f.job.scanTimerTasks();
        check(result.getAffectedRows()==3 && result.getResultMsg().equals("定时节点扫描完成：处理3项，移除失效3项，暂缓2项"),"actual handled counts exclude paused failed future missing terminal foreign");
        check(f.tx.tasks.size()==2 && f.tx.tasks.stream().map(WfTask::getTaskType).collect(java.util.stream.Collectors.toSet()).equals(Set.of("AUTO_PASS","AUTO_REJECT")),"both automatic actions enter real continuation");
        check(f.tx.messages.size()==3 && f.tx.messages.stream().filter(item->item.getTitle().equals("定时节点已到期")).count()==1,"notify-only sends once without completing task");
        check(Boolean.TRUE.equals(WorkflowWaitState.find(f.instances.get("notice"),"wait-notice").payload().get("notified")),"notify-only retains durable notified wait");
        check(f.job.scanTimerTasks().getAffectedRows()==0 && f.tx.messages.size()==3 && f.tx.tasks.size()==2,"repeat scan creates no task or notice");
        check(WorkflowWaitState.find(f.instances.get("paused"),"wait-paused").payload().get("retryCount")==null,"paused does not consume retry");
        TenantBroker.runAs(10L,ignored->{
            check(!f.engine.continueFromTimerNode("pass","timer",Map.of("waitId","wait-pass")),"finished wait returns false");
            check(!f.engine.continueFromTimerNode("future","timer",f.data("future")),"future deadline returns false");
            check(!f.engine.continueFromTimerNode("notice","timer",f.data("notice")),"already notified returns false");
        });
    }

    private static void retryAndRollback() throws Exception {
        Fixture f=new Fixture();f.add("bad",10L,"PENDING","AUTO_PASS");f.add("same",10L,"PENDING","AUTO_PASS");f.add("other",20L,"PENDING","AUTO_REJECT");
        f.messageFailure.add("bad");RuntimeException failure=caught(f.job::scanTimerTasks);
        check(stack(failure).contains("controlled message failure") && stack(failure).contains("定时节点扫描存在失败项"),"original message failure reaches platform failure");
        check(WorkflowWaitState.find(f.instances.get("bad"),"wait-bad")!=null && f.tx.tasks.size()==2 && f.tx.messages.size()==2,"notice failure rolls back task and wait while later tenant and item continue");
        check("PENDING".equals(f.instances.get("bad").getStatus()) && f.tx.rollbacks==1,"notice failure restores original process state");
        WorkflowWaitState.Pending retry=WorkflowWaitState.find(f.instances.get("bad"),"wait-bad");
        check(((Number)retry.payload().get("retryCount")).intValue()==1 && ((Number)retry.payload().get("nextRetryAt")).longValue()>System.currentTimeMillis()+110000L,"retry persists count and two-minute backoff");
        check(f.job.scanTimerTasks().getAffectedRows()==0 && f.attempts.get("bad")==1,"backoff does not invoke engine again");
        f.messageFailure.clear();f.change("bad",Map.of("nextRetryAt",1L));
        check(f.job.scanTimerTasks().getAffectedRows()==1 && f.tx.tasks.size()==3 && f.tx.messages.size()==3,"recovery only completes failed wait once");
        check(f.job.scanTimerTasks().getAffectedRows()==0,"recovery repeat zero");

        Fixture limit=new Fixture();limit.add("limit",10L,"PENDING","AUTO_PASS");limit.engineFailure.add("limit");
        for(int attempt=1;attempt<=4;attempt++){
            limit.change("limit",Map.of("nextRetryAt",1L));caught(limit.job::scanTimerTasks);
            WorkflowWaitState.Pending pending=WorkflowWaitState.find(limit.instances.get("limit"),"wait-limit");
            check(((Number)pending.payload().get("retryCount")).intValue()==attempt,"retry count preserved at attempt "+attempt);
            check(Boolean.TRUE.equals(pending.payload().get("blocked"))==(attempt==4),"three retries then block at attempt "+attempt);
        }
        check(limit.job.scanTimerTasks().getAffectedRows()==0 && limit.attempts.get("limit")==4,"blocked wait never starts fifth automatic attempt");
        check(limit.tx.messages.size()==2,"existing exhaustion notices preserved");
    }

    private static void invalidCacheIdentity() throws Exception {
        for (boolean cleanup : List.of(false, true)) {
            Fixture f = new Fixture();
            f.add("active", 10L, "PENDING", "AUTO_PASS");
            f.change("active", Map.of("expireAt", System.currentTimeMillis() + 3600000L));
            f.add("paused", 10L, "PAUSED", "AUTO_PASS");
            f.add("failed", 20L, "FAILED", "AUTO_PASS");
            Map<String, String> before = new HashMap<>();
            f.instances.forEach((String id, WfProcessInstance instance) -> before.put(id, instance.getVariables()));
            int stale = 0;
            for (String id : List.of("active", "paused", "failed")) {
                Long tenant = f.instances.get(id).getTenantId();
                for (String defect : List.of("missing", "blank", "number", "unknown", "node", "context", "alias")) {
                    Map<String, Object> data = new LinkedHashMap<>(f.data(id));
                    switch (defect) {
                        case "missing" -> data.remove("waitId");
                        case "blank" -> data.put("waitId", " ");
                        case "number" -> data.put("waitId", 1);
                        case "unknown" -> data.put("waitId", "old-wait");
                        case "node" -> data.put("nodeKey", "other-node");
                        case "context" -> data.put("executionContext", "other-branch");
                        default -> { }
                    }
                    String key = f.key(id) + ":" + defect;
                    f.values.get(tenant).put(key, data);
                    f.queues.get(tenant).put(key, 1D);
                    stale++;
                }
            }
            JobResult result = cleanup ? f.job.cleanupExpiredTimerKeys() : f.job.scanTimerTasks();
            check(result.getAffectedRows() == (cleanup ? stale : 0), "invalid index count for cleanup=" + cleanup);
            check(result.getResultMsg().contains(cleanup ? "移除21条" : "移除失效21项"), "all invalid identities removed");
            check(f.tx.tasks.isEmpty() && f.tx.messages.isEmpty() && f.attempts.isEmpty(), "invalid cache never executes retries or notices");
            for (String id : before.keySet()) {
                check(before.get(id).equals(f.instances.get(id).getVariables()) && f.present(id), "valid persistent wait and index retained: " + id);
            }
            check(f.values.values().stream().mapToInt(Map::size).sum() == 3
                    && f.queues.values().stream().mapToInt(Map::size).sum() == 3, "invalid payloads and exact queue members removed");
            JobResult repeat = cleanup ? f.job.cleanupExpiredTimerKeys() : f.job.scanTimerTasks();
            check(repeat.getAffectedRows() == 0 && f.tx.messages.isEmpty() && f.tx.tasks.isEmpty(), "invalid records never reappear");
        }
    }

    private static void storageAndCleanup() throws Exception {
        Fixture f=new Fixture();f.add("read",10L,"PENDING","AUTO_PASS");f.add("other",20L,"PENDING","AUTO_PASS");f.queueFailure.add(10L);
        check(stack(caught(f.job::scanTimerTasks)).contains("controlled queue failure") && f.tx.tasks.size()==1,"queue failure continues next tenant");
        f.queueFailure.clear();check(f.job.scanTimerTasks().getAffectedRows()==1,"queue recovery handles retained wait");
        Fixture cleanup=new Fixture();cleanup.add("broken",10L,"CANCELLED","AUTO_PASS");cleanup.add("same",10L,"CANCELLED","AUTO_PASS");cleanup.add("other",20L,"CANCELLED","AUTO_PASS");cleanup.add("active",10L,"PAUSED","AUTO_PASS");
        cleanup.deleteFailure.add(cleanup.key("broken"));
        check(stack(caught(cleanup.job::cleanupExpiredTimerKeys)).contains("controlled deletion failure"),"cleanup failure reaches platform");
        check(cleanup.present("broken") && !cleanup.present("same") && !cleanup.present("other") && cleanup.present("active"),"cleanup failure preserves entry and continues items and tenants");
        cleanup.deleteFailure.clear();check(cleanup.job.cleanupExpiredTimerKeys().getAffectedRows()==1,"cleanup recovery actual one");
        check(cleanup.job.cleanupExpiredTimerKeys().getAffectedRows()==0 && cleanup.present("active"),"cleanup repeat zero and active waits preserved");
        cleanup.queues.get(10L).put("\"unknown-key\"",1D);
        check(cleanup.job.cleanupExpiredTimerKeys().getAffectedRows()==1 && !cleanup.queues.get(10L).containsKey("\"unknown-key\""),"cleanup removes exact serialized queue member");
        Fixture restore=new Fixture();restore.add("restore-bad",10L,"PENDING","AUTO_PASS");restore.add("restore-good",10L,"PENDING","AUTO_PASS");restore.add("other",20L,"PENDING","AUTO_PASS");
        restore.queues.get(10L).clear();restore.values.get(10L).clear();restore.writeFailure.add(restore.key("restore-bad"));
        check(stack(caught(restore.job::scanTimerTasks)).contains("controlled index write failure") && restore.tx.tasks.size()==2,"persistent restore failure is visible and later waits continue");
        restore.writeFailure.clear();check(restore.job.scanTimerTasks().getAffectedRows()==1,"missing index restored and failed wait recovered");
    }

    private static void exhaustedNotificationRecovery() throws Exception {
        Fixture f=new Fixture();f.add("exhausted",10L,"PENDING","AUTO_PASS");f.engineFailure.add("exhausted");f.noticeFailure.add("exhausted");
        Map<String,Object> original=new LinkedHashMap<>(f.data("exhausted"));
        for(int attempt=1;attempt<=4;attempt++){f.change("exhausted",Map.of("nextRetryAt",1L));caught(f.job::scanTimerTasks);}
        WorkflowWaitState.Pending blocked=WorkflowWaitState.find(f.instances.get("exhausted"),"wait-exhausted");
        check(Boolean.TRUE.equals(blocked.payload().get("blocked")) && !Boolean.TRUE.equals(blocked.payload().get("notified")),"failed exhaustion notice keeps blocked unnotified durable wait");
        check(f.tx.messages.isEmpty() && f.tx.tasks.isEmpty(),"second receiver failure rolls back first receiver and does not complete process");
        f.change("exhausted",Map.of("nextRetryAt",1L));
        RuntimeException failure=caught(f.job::scanTimerTasks);
        check(stack(failure).contains("controlled exhaustion second-recipient failure") && f.attempts.get("exhausted")==4,"notification retry failure never retries automatic engine");
        check(((Number)WorkflowWaitState.find(f.instances.get("exhausted"),"wait-exhausted").payload().get("retryCount")).intValue()==4,"notification retry does not increase automatic counter");
        f.noticeFailure.clear();f.queues.get(10L).clear();f.values.get(10L).clear();
        check(f.job.scanTimerTasks().getAffectedRows()==1 && f.attempts.get("exhausted")==4,"missing cache reconstructed to submit notice only");
        WorkflowWaitState.Pending notified=WorkflowWaitState.find(f.instances.get("exhausted"),"wait-exhausted");
        check(Boolean.TRUE.equals(notified.payload().get("blocked")) && Boolean.TRUE.equals(notified.payload().get("notified")) && "PENDING".equals(f.instances.get("exhausted").getStatus()),"notified marker commits while waiting for manual action");
        check(f.tx.messages.size()==2 && f.tx.messages.stream().allMatch(item->"WF_TIMER_FAILURE".equals(item.getBizType()) && "exhausted".equals(item.getBizId()) && item.getDeduplicationKey().startsWith("wf:timer:failure:exhausted:wait-exhausted:")),"process reference fits message column while full per-wait receiver identity is preserved");
        check(f.tx.messages.stream().map(item->item.getReceivers().get(0).getReceiverId()).collect(java.util.stream.Collectors.toSet()).equals(Set.of(11L,12L)),"current tenant admin and initiator receive failure notices");
        f.values.get(10L).put(f.key("exhausted"),original);f.queues.get(10L).put(f.key("exhausted"),1D);
        check(f.job.scanTimerTasks().getAffectedRows()==0 && f.tx.messages.size()==2 && f.attempts.get("exhausted")==4,"already notified raw replay creates no duplicate notice or execution");
        Fixture overlap=new Fixture();overlap.add("admin",10L,"PENDING","AUTO_PASS");overlap.instances.get("admin").setStartUserId(12L);overlap.change("admin",Map.of("blocked",true,"retryCount",4));
        check(overlap.job.scanTimerTasks().getAffectedRows()==1 && overlap.tx.messages.size()==1,"initiator also admin receives one notice");
        Fixture foreign=new Fixture();foreign.add("foreign",20L,"PENDING","AUTO_PASS");foreign.change("foreign",Map.of("blocked",true,"retryCount",4));
        check(foreign.job.scanTimerTasks().getAffectedRows()==1 && foreign.tx.messages.stream().map(item->item.getReceivers().get(0).getReceiverId()).collect(java.util.stream.Collectors.toSet()).equals(Set.of(21L,22L)),"other tenant never targets first tenant administrator");
    }

    private static void lockAndRecovery() throws Exception {
        Fixture f=new Fixture();f.add("one",10L,"PENDING","AUTO_PASS");f.lockAvailable=false;
        check("SKIPPED".equals(f.job.scanTimerTasks().getExecuteStatus()) && "SKIPPED".equals(f.job.cleanupExpiredTimerKeys().getExecuteStatus()),"busy scan and cleanup are skipped");
        check(f.tx.tasks.isEmpty() && f.unlocks==0,"unacquired locks neither act nor unlock");
        f.interrupted=true;check(stack(caught(f.job::scanTimerTasks)).contains("controlled interruption") && Thread.currentThread().isInterrupted(),"interruption propagates and preserves flag");Thread.interrupted();
        f.interrupted=false;f.lockAvailable=true;
        TenantBroker.runAs(10L,ignored->{UserContext.setUserId(998L);UserContext.setUserName("original");check(f.job.scanTimerTasks().getAffectedRows()==1,"explicit tenant scope works");check(UserContext.getUserId()==998L && "original".equals(UserContext.getUserName()),"caller actor restored");});
        check(f.unlocks>=1,"owned locks released");
        Fixture platform=new Fixture();platform.add("first",10L,"PENDING","AUTO_PASS");platform.add("other",20L,"PENDING","AUTO_PASS");
        TenantBroker.runAs(10L,ignored->{
            com.cloudflow.common.job.model.JobExecuteDTO request=new com.cloudflow.common.job.model.JobExecuteDTO();request.setHandlerName("timerScan");
            try{JobResult result=com.cloudflow.common.job.config.JobInvocationContext.callWithPlatformLock(request,platform.job::scanTimerTasks);check(result.getAffectedRows()==2,"platform owner tenant does not narrow timer scan");}
            catch(Exception failure){throw new IllegalStateException(failure);}
            check(TenantContext.getTenantId()==10L && UserContext.getTenantId()==10L,"platform caller tenant restored");
        });
        Fixture platformCleanup=new Fixture();platformCleanup.add("first",10L,"CANCELLED","AUTO_PASS");platformCleanup.add("other",20L,"CANCELLED","AUTO_PASS");
        TenantBroker.runAs(10L,ignored->{
            com.cloudflow.common.job.model.JobExecuteDTO request=new com.cloudflow.common.job.model.JobExecuteDTO();request.setHandlerName("timerScanCleanup");
            try{check(com.cloudflow.common.job.config.JobInvocationContext.callWithPlatformLock(request,platformCleanup.job::cleanupExpiredTimerKeys).getAffectedRows()==2,"platform owner tenant does not narrow timer cleanup");}
            catch(Exception failure){throw new IllegalStateException(failure);}
        });
        Fixture many=new Fixture();for(int i=0;i<101;i++)many.add(String.format("page-%03d",i),10L,"PENDING","AUTO_PASS");
        many.queues.get(10L).clear();many.values.get(10L).clear();
        check(many.job.scanTimerTasks().getAffectedRows()==101 && many.pages>=3,"persistent waits paginate beyond one hundred");
    }

    private static final class Fixture {
        private final TimerScanJob job=new TimerScanJob();
        private final WfInstanceServiceImpl engine=new WfInstanceServiceImpl();
        private final Map<String,WfProcessInstance> instances=new LinkedHashMap<>();
        private final Map<Long,Map<String,Double>> queues=new HashMap<>();
        private final Map<Long,Map<String,Map<String,Object>>> values=new HashMap<>();
        private final Map<String,Integer> attempts=new HashMap<>();
        private final Set<String> messageFailure=new LinkedHashSet<>(),engineFailure=new LinkedHashSet<>(),deleteFailure=new LinkedHashSet<>(),writeFailure=new LinkedHashSet<>(),noticeFailure=new LinkedHashSet<>();
        private final Set<Long> queueFailure=new LinkedHashSet<>();
        private boolean lockAvailable=true,interrupted;private int unlocks,pages;
        private final RecordingTransactions tx=new RecordingTransactions(instances);
        private final TimerSchedulerService scheduler;

        private Fixture() throws Exception {
            queues.put(10L,new LinkedHashMap<>());queues.put(20L,new LinkedHashMap<>());values.put(10L,new HashMap<>());values.put(20L,new HashMap<>());
            RedisCache cache=new RedisCache(){
                @Override public Set<Object> getCacheZSetByScoreRange(String key,double min,double max){check(Objects.equals(TenantContext.getTenantId(),UserContext.getTenantId()),"matching tenant contexts at queue read");if(queueFailure.contains(TenantContext.getTenantId()))throw new IllegalStateException("controlled queue failure");Set<Object> result=new LinkedHashSet<>();queues.get(TenantContext.getTenantId()).forEach((String member,Double score)->{if(score>=min&&score<=max)result.add(member);});return result;}
                @Override @SuppressWarnings("unchecked") public <T>T getCacheObject(String key){return (T)values.get(TenantContext.getTenantId()).get(key);}
                @Override public <T>void setCacheObject(String key,T value){if(writeFailure.contains(key))throw new IllegalStateException("controlled index write failure");Map<String,Object> data=new LinkedHashMap<>();((Map<?,?>)value).forEach((Object name,Object item)->data.put((String)name,item));values.get(TenantContext.getTenantId()).put(key,data);}
                @Override public boolean setCacheZSet(String key,Object member,double score){return queues.get(TenantContext.getTenantId()).put(member.toString(),score)==null;}
                @Override public long removeCacheZSet(String key,Object... members){long removed=0;for(Object member:members)if(queues.get(TenantContext.getTenantId()).remove(member.toString())!=null)removed++;return removed;}
                @Override public boolean deleteObject(String key){if(deleteFailure.contains(key))throw new IllegalStateException("controlled deletion failure");return values.get(TenantContext.getTenantId()).remove(key)!=null;}
            };
            RLock lock=proxy(RLock.class,(target,method,args)->{if(method.getName().equals("tryLock")){check(args.length==2 && args[1]==TimeUnit.SECONDS,"renewable scan and instance locks");if(interrupted)throw new InterruptedException("controlled interruption");return lockAvailable;}if(method.getName().equals("isHeldByCurrentThread"))return lockAvailable;if(method.getName().equals("unlock")){unlocks++;return null;}throw new AssertionError(method.getName());});
            RedissonClient redisson=proxy(RedissonClient.class,(target,method,args)->lock);
            WfProcessInstanceMapper mapper=proxy(WfProcessInstanceMapper.class,(target,method,args)->{
                if(method.getName().equals("selectWaitingInstances")){pages++;return instances.values().stream().filter(item->Objects.equals(item.getTenantId(),args[0]) && item.getInstanceId().compareTo((String)args[1])>0 && WfProcessStatus.isOpen(item.getStatus()) && !WorkflowWaitState.list(item,null).isEmpty()).sorted(java.util.Comparator.comparing(WfProcessInstance::getInstanceId)).limit((Integer)args[2]).toList();}
                if(method.getName().equals("updateById"))return 1;
                if(method.getName().equals("selectForExecution")){check(Objects.equals(args[0],TenantContext.getTenantId()),"execution query scoped to tenant");return instances.get((String)args[1]);}
                if(method.getName().equals("selectById"))return instances.get((String)args[0]);
                throw new AssertionError(method.getName());
            });
            TransactionTemplate template=new TransactionTemplate(tx);scheduler=new TimerSchedulerService(cache,null,mapper,template);
            MessageSender sender=request->{if(messageFailure.stream().anyMatch(id->request.getContent().contains("「"+id+"」")))throw new IllegalStateException("controlled message failure");
                if("WF_TIMER_FAILURE".equals(request.getBizType())){check(TransactionSynchronizationManager.isActualTransactionActive(),"failure notification shares marker transaction");if(request.getReceivers().get(0).getReceiverId()==TenantContext.getTenantId()+1 && noticeFailure.stream().anyMatch(id->request.getContent().contains("「"+id+"」")))throw new IllegalStateException("controlled exhaustion second-recipient failure");}
                if(request.getTitle().equals("定时节点触发通知") || request.getTitle().equals("定时节点已到期"))check(TransactionSynchronizationManager.isActualTransactionActive(),"successful notification shares timer transaction");if(TransactionSynchronizationManager.isActualTransactionActive())tx.pendingMessages.add(request);else tx.messages.add(request);};
            com.cloudflow.workflow.mapper.system.SysUserMapper users=proxy(com.cloudflow.workflow.mapper.system.SysUserMapper.class,(target,method,args)->{check(method.getName().equals("selectTimerFailureAdminIds") && Objects.equals(args[0],TenantContext.getTenantId()),"admin selection is tenant scoped");return ((Long)args[1])==0L?List.of(TenantContext.getTenantId()+2):List.of();});
            inject(job,"timerFailureNotifications",new com.cloudflow.workflow.service.TimerFailureNotifications(users,sender));
            WfProcessDefinition definition=new WfProcessDefinition();definition.setDefinitionId("def");definition.setModelJson("{\"nodes\":[{\"id\":\"start\",\"type\":\"START\"},{\"id\":\"timer\",\"type\":\"TIMER\",\"delayValue\":1},{\"id\":\"end\",\"type\":\"END\"}],\"edges\":[{\"id\":\"a\",\"source\":\"start\",\"target\":\"timer\"},{\"id\":\"b\",\"source\":\"timer\",\"target\":\"end\"}]}");
            WfProcessDefinitionMapper definitions=proxy(WfProcessDefinitionMapper.class,(target,method,args)->{definition.setTenantId(TenantContext.getTenantId());return definition;});
            WfTaskMapper tasks=proxy(WfTaskMapper.class,(target,method,args)->{check(method.getName().equals("insert"),"timer creates ordinary task");WfTask task=(WfTask)args[0];check(Objects.equals(task.getAssignee(),instances.get(task.getInstanceId()).getStartUserId()),"timer acts as initiator");tx.pendingTasks.add(task);return 1;});
            IWfTaskService downstream=proxy(IWfTaskService.class,(target,method,args)->{check(method.getName().equals("completeAutomaticTask"),"automatic task completion used");WfTask task=tx.pendingTasks.get(tx.pendingTasks.size()-1);attempts.merge(task.getInstanceId(),1,Integer::sum);if(engineFailure.contains(task.getInstanceId()))throw new IllegalStateException("controlled downstream failure");return R.ok();});
            WorkflowProcessStateService states=new WorkflowProcessStateService(null,null,null,null,null,null,null){@Override public void transition(WfProcessInstance instance,WfProcessStatus state){instance.setStatus(state.getCode());}};
            INodeExecutionService nodes=proxy(INodeExecutionService.class,(target,method,args)->{WfNodeConfig timer=new WfNodeConfig();timer.setId("timer");timer.setType("TIMER");timer.setTitle("timer");return timer;});
            inject(engine,"businessLocks",com.cloudflow.workflow.service.WorkflowBusinessLockFixture.create(redisson));
            inject(engine,"redissonClient",redisson);inject(engine,"processInstanceMapper",mapper);inject(engine,"processDefinitionMapper",definitions);inject(engine,"taskMapper",tasks);inject(engine,"timerTaskService",downstream);inject(engine,"sysNoticeService",sender);inject(engine,"transactionTemplate",template);inject(engine,"timerSchedulerService",scheduler);inject(engine,"processStateService",states);inject(engine,"nodeExecutionService",nodes);inject(engine,"workflowGraphModelResolver",new WorkflowGraphModelResolver());inject(engine,"gateways",new WorkflowGatewayService(null,null,new ObjectMapper(),null));
            inject(job,"redissonClient",redisson);inject(job,"redisCache",cache);inject(job,"processInstanceMapper",mapper);inject(job,"instanceService",engine);inject(job,"timerScheduler",scheduler);inject(job,"sysConfigHelper",new SysConfigHelper(){@Override public int getConfigInt(String key,int fallback){return fallback;}});inject(job,"tenantIterator",new TenantIterator(null){@Override public List<Long> listActiveTenantIds(){return List.of(10L,20L);}});
        }
        private void add(String id,Long tenant,String status,String action){WfProcessInstance instance=new WfProcessInstance();instance.setInstanceId(id);instance.setTenantId(tenant);instance.setStatus(status);instance.setTitle(id);instance.setDefinitionId("def");instance.setStartUserId(tenant+1);instance.setStartUserName("initiator");instances.put(id,instance);WorkflowWaitState.Pending pending=WorkflowWaitState.register(instance,Map.of(),"wait-"+id,"TIMER","timer",Map.of("expireAt",1L,"timerAction",action));TenantBroker.runAs(tenant,ignored->scheduler.scheduleAfterCommit(instance,pending));}
        private String key(String id){return "sys:wf:timer:"+id+":timer:root:wait-"+id;}
        private Map<String,Object> data(String id){return values.get(instances.get(id).getTenantId()).get(key(id));}
        private boolean present(String id){return queues.get(instances.get(id).getTenantId()).containsKey(key(id));}
        private void change(String id,Map<String,Object> patch){WfProcessInstance instance=instances.get(id);WorkflowWaitState.Pending pending=WorkflowWaitState.find(instance,"wait-"+id);Map<String,Object> payload=new LinkedHashMap<>(pending.payload());payload.putAll(patch);WorkflowWaitState.Pending changed=WorkflowWaitState.change(instance,null,pending,payload);TenantBroker.runAs(instance.getTenantId(),ignored->scheduler.scheduleAfterCommit(instance,changed));}
    }

    private static final class RecordingTransactions extends AbstractPlatformTransactionManager {
        private final Map<String,WfProcessInstance> instances;
        private final List<WfTask> tasks=new ArrayList<>(),pendingTasks=new ArrayList<>();
        private final List<MessageSendRequest> messages=new ArrayList<>(),pendingMessages=new ArrayList<>();
        private final Map<String,String> beforeVariables=new HashMap<>(),beforeStates=new HashMap<>();private int rollbacks;
        private RecordingTransactions(Map<String,WfProcessInstance> instances){this.instances=instances;}
        @Override protected Object doGetTransaction(){return new Object();}
        @Override protected void doBegin(Object transaction,TransactionDefinition definition){pendingTasks.clear();pendingMessages.clear();beforeVariables.clear();beforeStates.clear();instances.forEach((String id,WfProcessInstance instance)->{beforeVariables.put(id,instance.getVariables());beforeStates.put(id,instance.getStatus());});}
        @Override protected void doCommit(DefaultTransactionStatus status){tasks.addAll(pendingTasks);messages.addAll(pendingMessages);}
        @Override protected void doRollback(DefaultTransactionStatus status){instances.forEach((String id,WfProcessInstance instance)->{instance.setVariables(beforeVariables.get(id));instance.setStatus(beforeStates.get(id));});pendingTasks.clear();pendingMessages.clear();rollbacks++;}
    }
    private static void inject(Object target,String name,Object value)throws Exception{Field field=target.getClass().getDeclaredField(name);field.setAccessible(true);field.set(target,value);}
    private static RuntimeException caught(Runnable operation){try{operation.run();}catch(RuntimeException failure){return failure;}throw new AssertionError("expected failure");}
    private static String stack(Throwable failure){java.io.StringWriter output=new java.io.StringWriter();failure.printStackTrace(new java.io.PrintWriter(output));return output.toString();}
    private static <T>T proxy(Class<T> type,InvocationHandler handler){return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler));}
    private static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
}
