package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.config.JobInvocationContext;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.redisson.api.RScript;
import org.redisson.api.RBucket;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.RedisSerializer;
import java.nio.charset.StandardCharsets;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Actual detection and notification transactions; Redis, locks and user queries are controlled. */
public final class DeadlockScanChecks {
    private static int checks;
    public static void main(String[] args) throws Exception {
        timeoutRecovery(); releaseRecovery(); cycles(); isolationAndLocks(); pagingAndCleanup();
        System.out.println("DEADLOCK_SCAN_CHECKS: checks="+checks+"; failed=0; real_detector=true; redis_locks_users_controlled=true");
    }
    private static void timeoutRecovery() throws Exception {
        Fixture f=new Fixture(); f.add(10,"same","first",70); f.add(20,"same","other",70); f.failRecipient=12L;
        RuntimeException failure=caught(f.service::detectDeadlocks);
        check(stack(failure).contains("controlled notice failure"),"notification exception reaches aggregate result");
        check(f.held("10:same")&&!f.held("20:same"),"same logical lock names isolated and other tenant continues");
        check(f.size(10)==1&&f.size(20)==0&&f.tx.committed.size()==2&&f.tx.rollbacks==1,"failed second recipient rolls back all messages and retains holder");
        f.failRecipient=null; JobResult result=f.service.detectDeadlocks();
        check(result.getAffectedRows()==1&&result.getResultMsg().equals("死锁巡检完成：释放锁1个，解除循环等待0条，清理过期记录0条"),"recovery reports actual release");
        check(f.tx.committed.size()==4&&f.size(10)==0,"recovery notifies only failed tenant");
        check(f.service.detectDeadlocks().getAffectedRows()==0&&f.tx.committed.size()==4,"repeat has no release or duplicate reminder");
        check(f.tx.committed.values().stream().allMatch(item->item.getBizId().length()==36&&item.getDeduplicationKey().startsWith("wf:deadlock:")&&!item.getContent().contains("已自动恢复")),"bounded identity and truthful notification before release");
    }
    private static void releaseRecovery() throws Exception {
        Fixture f=new Fixture();f.add(10,"bad","a",70);f.add(10,"good","b",70);f.failedRelease.add("10:bad");
        check(stack(caught(f.service::detectDeadlocks)).contains("controlled release failure"),"failed unlock reported");
        check(f.size(10)==1&&f.held("10:bad")&&!f.held("10:good"),"failed holder retained and other lock continues");
        int messages=f.tx.committed.size();f.failedRelease.clear();
        check(f.service.detectDeadlocks().getAffectedRows()==1&&f.tx.committed.size()==messages,"release retry reuses stable messages");
        Fixture none=new Fixture();none.adminCount=0;none.add(10,"none","a",70);
        check(stack(caught(none.service::detectDeadlocks)).contains("缺少有效租户管理员")&&none.held("10:none"),"missing administrator is a visible failure with retained lock");
    }
    private static void cycles() throws Exception {
        Fixture f=new Fixture();f.add(10,"a","A",10);f.add(10,"b","B",5);f.add(10,"prefix","X",1);
        f.values.put("10:sys:lock:waiter:a",new LinkedHashSet<>(List.of("B","X")));
        f.values.put("10:sys:lock:waiter:b",new LinkedHashSet<>(List.of("A")));
        Map<String,Object> preview=TenantBroker.applyAs(10L,ignored->f.service.manualDetect());
        List<?> chains=(List<?>)preview.get("deadlockChains");
        check(chains.size()==1&&!chains.toString().contains("X"),"cycle excludes incoming path and deduplicates rotations");
        JobResult result=f.service.detectDeadlocks();
        check(result.getAffectedRows()==1&&result.getResultMsg().contains("解除循环等待1条"),"one actual lock release breaks one cycle");
        check(f.held("10:a")&&!f.held("10:b")&&f.held("10:prefix"),"youngest cycle member selected without touching non-cycle waiter");
        check(f.tx.committed.size()==2&&f.service.detectDeadlocks().getAffectedRows()==0,"cycle alerts once and repeat remains empty");
        check(TenantBroker.applyAs(10L,ignored->f.service.getRecentVictimEvents(10)).size()==1,"physical Redis event key read once within tenant");
    }
    private static void isolationAndLocks() throws Exception {
        Fixture f=new Fixture();f.add(10,"first","a",70);f.add(20,"other","b",70);
        TenantBroker.runAs(10L,ignored->{check(f.service.detectDeadlocks().getAffectedRows()==1,"internal call remains current tenant only");check(f.held("20:other"),"other tenant retained on internal call");});
        JobExecuteDTO dto=new JobExecuteDTO();dto.setHandlerName("deadlockDetection");
        TenantBroker.runAs(10L,ignored->{try{check(JobInvocationContext.callWithPlatformLock(dto,f.service::detectDeadlocks).getAffectedRows()==1,"platform owner tenant scans all tenants");}catch(Exception error){throw new IllegalStateException(error);}check(TenantContext.getTenantId()==10L&&UserContext.getTenantId()==10L,"caller contexts restored");});
        Fixture reads=new Fixture();reads.add(20,"other","b",70);reads.failedKeysTenant=10L;
        check(stack(caught(reads.service::detectDeadlocks)).contains("controlled keys failure")&&!reads.held("20:other"),"failed tenant query does not block later tenant");
        Fixture lock=new Fixture();lock.scanAvailable=false;
        check(stack(caught(lock.service::getLockStatistics)).contains("缺少租户上下文")&&lock.keysReads==0,"missing tenant rejected before shared cache query");
        check(lock.service.detectDeadlocks().getExecuteStatus().equals("SKIPPED")&&lock.keysReads==0,"contended scan skipped without reading records");
        lock.scanAvailable=true;lock.interrupted=true;
        check(stack(caught(lock.service::detectDeadlocks)).contains("被中断")&&Thread.currentThread().isInterrupted(),"interruption is visible and thread flag retained");Thread.interrupted();
    }
    private static void pagingAndCleanup() throws Exception {
        Fixture many=new Fixture();many.adminCount=501;many.add(10,"paged","a",70);
        check(many.service.detectDeadlocks().getAffectedRows()==1&&many.tx.committed.size()==501&&many.adminPages==2,"all administrator pages delivered once");
        Fixture deletion=new Fixture();deletion.add(10,"delete","a",70);deletion.failedDelete.add("10:sys:lock:holder:delete");
        check(stack(caught(deletion.service::detectDeadlocks)).contains("controlled delete failure")&&deletion.size(10)==1&&!deletion.held("10:delete"),"failed record cleanup retains local retry entry after real release");
        int count=deletion.tx.committed.size();deletion.failedDelete.clear();
        check(deletion.service.detectDeadlocks().getAffectedRows()==0&&deletion.size(10)==0&&deletion.tx.committed.size()==count,"cleanup retry does not count a new release or send again");
    }
    private static final class Fixture {
        private final DeadlockDetectionService service=new DeadlockDetectionService();
        private final Map<String,Object> values=new LinkedHashMap<>();
        private final Map<String,Boolean> locks=new HashMap<>();
        private final Map<String,String> generations=new HashMap<>();
        private final Set<String> failedRelease=new LinkedHashSet<>(),failedDelete=new LinkedHashSet<>();
        private final RecordingTransactions tx=new RecordingTransactions();
        private Long failRecipient,failedKeysTenant;private int adminCount=2,adminPages,keysReads;private boolean scanAvailable=true,interrupted;
        @SuppressWarnings("unchecked")
        private Fixture() throws Exception {
            RedisCache redis=new RedisCache(){
                @Override @SuppressWarnings("unchecked") public <T>T getCacheObject(String key){Object value=values.get(TenantContext.getTenantId()+":"+key);if(value instanceof Set<?> set)value=new LinkedHashSet<>(set);if(value instanceof Map<?,?> map)value=new LinkedHashMap<>(map);return (T)value;}
                @Override public <T>void setCacheObject(String key,T value,long timeout,TimeUnit unit){values.put(TenantContext.getTenantId()+":"+key,value);}
                @Override public boolean deleteObject(String key){String physical=TenantContext.getTenantId()+":"+key;if(failedDelete.contains(physical))throw new IllegalStateException("controlled delete failure");return values.remove(physical)!=null;}
                @Override public Collection<String> keys(String pattern){keysReads++;if(Objects.equals(failedKeysTenant,TenantContext.getTenantId()))throw new IllegalStateException("controlled keys failure");String prefix=TenantContext.getTenantId()+":"+pattern.substring(0,pattern.length()-1);return values.keySet().stream().filter(key->key.startsWith(prefix)).toList();}
            };
            redis.redisTemplate=new com.cloudflow.common.config.RedisConfig().redisTemplate(proxy(RedisConnectionFactory.class,(target,method,args)->{throw new AssertionError("controlled rules must not open Redis connection");}));
            RedisSerializer<Object> serializer=(RedisSerializer<Object>)redis.redisTemplate.getValueSerializer();
            RedissonClient redisson=proxy(RedissonClient.class,(target,method,args)->{
                if(method.getName().equals("getId"))return "controlled-client";
                if(method.getName().equals("getBucket"))return proxy(RBucket.class,(bucket,operation,parameters)->{
                    check(operation.getName().equals("get"),"statistics snapshot uses one read");Object value=values.get((String)args[0]);
                    return value==null?null:((String)args[0]).contains(":sys:lock:waiter-stamp:")?(String)value:new String(serializer.serialize(value),StandardCharsets.UTF_8);
                });
                if(method.getName().equals("getScript"))return proxy(RScript.class,(script,operation,parameters)->{
                    check(operation.getName().equals("eval"),"generation operations use atomic Redis script");
                    String source=(String)parameters[1];List<?> keys=(List<?>)parameters[3];String key=(String)keys.get(0);Object[] valuesArgs=(Object[])parameters[4];
                    if(source.contains("deadlock-waiter-state")){
                        String stampKey=(String)keys.get(1);
                        if(!Objects.equals(values.getOrDefault(stampKey,""),valuesArgs[0]))return 0L;
                        values.put(stampKey,valuesArgs[2]);
                        if(((String)valuesArgs[1]).isEmpty())values.remove(key);
                        else values.put(key,serializer.deserialize(((String)valuesArgs[1]).getBytes(StandardCharsets.UTF_8)));
                        return 1L;
                    }
                    if(source.contains("deadlock-recovery-prepare")){
                        if(values.containsKey(key))return 0L;
                        values.put(key,serializer.deserialize(((String)valuesArgs[0]).getBytes(StandardCharsets.UTF_8)));return 1L;
                    }
                    if(source.contains("deadlock-recovery-release")){
                        Object plan=values.get(key);String encoded=plan==null?null:new String(serializer.serialize(plan),StandardCharsets.UTF_8);
                        if(!Objects.equals(encoded,valuesArgs[0]))return -1L;
                        String lockKey=(String)keys.get(1);
                        if(failedRelease.contains(lockKey))throw new IllegalStateException("controlled release failure");
                        boolean matches=held(lockKey)&&Objects.equals(generations.get(lockKey),valuesArgs[3]);
                        values.put(key,serializer.deserialize(((String)valuesArgs[matches?4:5]).getBytes(StandardCharsets.UTF_8)));
                        if(matches){locks.put(lockKey,false);generations.remove(lockKey);}return matches?1L:0L;
                    }
                    if(source.contains("deadlock-recovery-finish")){
                        Object plan=values.get(key);String encoded=plan==null?null:new String(serializer.serialize(plan),StandardCharsets.UTF_8);
                        if(!Objects.equals(encoded,valuesArgs[0]))return 0L;values.remove(key);return 1L;
                    }
                    if(source.contains("deadlock-event-commit")){
                        String recoveryKey=keys.size()==4?(String)keys.get(3):null;
                        if(recoveryKey!=null){Object plan=values.get(recoveryKey);String encoded=plan==null?null:new String(serializer.serialize(plan),StandardCharsets.UTF_8);if(!Objects.equals(encoded,valuesArgs[8]))return 3L;}
                        String statsKey=(String)keys.get(1),identityKey=(String)keys.get(2);Object identity=values.get(identityKey);
                        if(identity!=null){if(!values.containsKey((String)valuesArgs[7]+identity))return -2L;if(recoveryKey!=null)values.remove(recoveryKey);return 2L;}
                        Object stats=values.get(statsKey);String before=stats==null?"":new String(serializer.serialize(stats),StandardCharsets.UTF_8);
                        if(!Objects.equals(before,valuesArgs[0])||!Objects.equals(stats==null?"0":"1",valuesArgs[1]))return 0L;
                        if(values.containsKey(key))return -1L;
                        values.put(key,serializer.deserialize(((String)valuesArgs[2]).getBytes(StandardCharsets.UTF_8)));
                        values.put(statsKey,serializer.deserialize(((String)valuesArgs[3]).getBytes(StandardCharsets.UTF_8)));
                        values.put(identityKey,Long.parseLong((String)valuesArgs[4]));if(recoveryKey!=null)values.remove(recoveryKey);return 1L;
                    }
                    if(source.contains("cjson.decode")){
                        if(failedDelete.contains(key))throw new IllegalStateException("controlled delete failure");
                        Object value=values.get(key);
                        if(value instanceof Map<?,?> record&&Objects.equals(record.get("generation"),valuesArgs[0])){values.remove(key);return 1L;}
                        return 0L;
                    }
                    if(source.contains("'hset'")){if(!held(key))return null;return generations.computeIfAbsent(key,ignored->(String)valuesArgs[2]);}
                    boolean matches=held(key)&&Objects.equals(generations.get(key),valuesArgs[2]);
                    if(source.contains("'spublish'")){
                        if(failedRelease.contains(key))throw new IllegalStateException("controlled release failure");
                        if(matches){locks.put(key,false);generations.remove(key);}
                    }
                    return matches?1L:0L;
                });
                check(method.getName().equals("getLock"),"only configured lock lookup used");String key=(String)args[0];boolean scan=key.equals("lock:scheduled:detectDeadlocks");
                return proxy(RLock.class,(lock,operation,parameters)->switch(operation.getName()){
                    case "tryLock" -> {if(scan){check(parameters.length==2&&parameters[1]==TimeUnit.SECONDS,"scan lock automatically renews");if(interrupted)throw new InterruptedException("controlled interruption");yield scanAvailable;}boolean free=!held(key);if(free)locks.put(key,true);yield free;}
                    case "isHeldByCurrentThread" -> scan?scanAvailable:held(key);
                    case "isLocked" -> held(key);
                    case "unlock" -> {if(!scan)locks.put(key,false);yield null;}
                    case "forceUnlock" -> {if(failedRelease.contains(key))throw new IllegalStateException("controlled release failure");boolean before=held(key);locks.put(key,false);yield before;}
                    default -> throw new AssertionError(operation.getName());});
            });
            MessageSender sender=request->{check(TransactionSynchronizationManager.isActualTransactionActive(),"administrator message batch has transaction");if(Objects.equals(request.getReceivers().get(0).getReceiverId(),failRecipient))throw new IllegalStateException("controlled notice failure");tx.pending.add(request);};
            SysUserMapper users=proxy(SysUserMapper.class,(target,method,args)->{check(method.getName().equals("selectTimerFailureAdminIds")&&Objects.equals(args[0],TenantContext.getTenantId()),"admin query uses current tenant");adminPages++;long after=(Long)args[1];int limit=(Integer)args[2];List<Long> result=new ArrayList<>();for(int index=1;index<=adminCount;index++){long user=TenantContext.getTenantId()+index;if(user>after&&result.size()<limit)result.add(user);}return result;});
            inject(service,"redisCache",redis);inject(service,"redissonClient",redisson);inject(service,"sysNoticeService",sender);inject(service,"users",users);inject(service,"transactions",new TransactionTemplate(tx));inject(service,"workflowProperties",new WorkflowProperties());inject(service,"tenantIterator",new TenantIterator(null){@Override public List<Long> listActiveTenantIds(){return List.of(10L,20L);}});
        }
        private void add(long tenant,String key,String holder,int ageSeconds) throws Exception {
            TenantBroker.runAs(tenant,ignored->check(service.tryLockWithDetection(key,0,3600),"record established through actual lock API"));
            Field records=DeadlockDetectionService.class.getDeclaredField("lockHolders");records.setAccessible(true);Map<?,?> holders=(Map<?,?>)records.get(service);Object info=holders.get(tenant+":"+key);check(info!=null,"memory record includes tenant");long acquiredAt=System.currentTimeMillis()-ageSeconds*1000L;inject(info,"threadId",holder);inject(info,"acquireTime",acquiredAt);
            Map<?,?> original=(Map<?,?>)values.get(tenant+":sys:lock:holder:"+key);Map<String,Object> record=new HashMap<>();original.forEach((name,value)->record.put((String)name,value));record.put("threadId",holder);record.put("acquireTime",acquiredAt);values.put(tenant+":sys:lock:holder:"+key,record);
        }
        private boolean held(String key){return locks.getOrDefault(key,false);}
        private int size(long tenant){return TenantBroker.applyAs(tenant,ignored->(Integer)service.getLockStatistics().get("totalLocks"));}
    }
    private static final class RecordingTransactions extends AbstractPlatformTransactionManager {
        private final Map<String,MessageSendRequest> committed=new LinkedHashMap<>();private final List<MessageSendRequest> pending=new ArrayList<>();private int rollbacks;
        @Override protected Object doGetTransaction(){return new Object();}
        @Override protected void doBegin(Object transaction,TransactionDefinition definition){pending.clear();}
        @Override protected void doCommit(DefaultTransactionStatus status){for(MessageSendRequest request:pending){MessageSendRequest previous=committed.putIfAbsent(request.getDeduplicationKey(),request);if(previous!=null)check(previous.getContent().equals(request.getContent()),"stable retry content matches prior event");}}
        @Override protected void doRollback(DefaultTransactionStatus status){pending.clear();rollbacks++;}
    }
    private static void inject(Object target,String name,Object value)throws Exception{Field field=target.getClass().getDeclaredField(name);field.setAccessible(true);field.set(target,value);}
    private static RuntimeException caught(Runnable action){try{action.run();}catch(RuntimeException failure){return failure;}throw new AssertionError("failure expected");}
    private static String stack(Throwable failure){java.io.StringWriter output=new java.io.StringWriter();failure.printStackTrace(new java.io.PrintWriter(output));return output.toString();}
    private static <T>T proxy(Class<T> type,InvocationHandler handler){return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler));}
    private static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
}
