package com.cloudflow.auth.job;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.domain.SysDictOrphanAlert;
import com.cloudflow.auth.domain.SysDictType;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.mapper.SysDictOrphanAlertMapper;
import com.cloudflow.auth.mapper.SysDictTypeMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.service.impl.DictReferenceRegistry;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantContext;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实任务和Spring事务模板；字典注册表、映射器及事务资源为受控输入。 */
public final class DictOrphanScanChecks {
    private static int checks;
    public static void main(String[] args) {
        for (Class<?> entity : List.of(SysTenant.class,SysDictType.class,SysDictOrphanAlert.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),"dict-scan-checks"),entity);
        }
        TenantContext.setTenantId(9001L); UserContext.setTenantId(9002L);
        try {
            verify();
            check(Objects.equals(TenantContext.getTenantId(),9001L) && Objects.equals(UserContext.getTenantId(),9002L) && !TenantContext.getTenantSkip(),"caller tenant contexts and filter restored");
            System.out.println("DICT_ORPHAN_SCAN_CHECKS: checks="+checks+"; failed=0; real_job=true; real_spring_transaction_template=true; controlled_registry_mappers_and_resources=true; actual_database=false");
        } finally {TenantContext.clear(); UserContext.clear();}
    }
    private static void verify() {
        RecordingTransactions transactions=new RecordingTransactions();
        transactions.committed.put(10L,new ArrayList<>(List.of("old-10")));
        transactions.committed.put(20L,new ArrayList<>(List.of("old-20")));
        List<Long> visited=new ArrayList<>(); Set<Long> rejected=new java.util.HashSet<>(Set.of(10L));
        RuntimeException original=new IllegalStateException("controlled second insert failure");
        boolean[] active={true}; boolean[] implicit={true};
        DictReferenceRegistry registry=new DictReferenceRegistry() {
            @Override public List<ImplicitDictReferenceAlert> implicitOnlyBindings() {
                return implicit[0] ? List.of(alert("a"),alert("b"),alert("absent")) : List.of();
            }
        };
        SysTenantMapper tenants=proxy(SysTenantMapper.class,(proxy,method,values)->{
            check(TenantContext.getTenantSkip(),"active tenant query bypasses caller filter");
            return active[0]?List.of(tenant(10L),tenant(20L)):List.of();
        });
        SysDictTypeMapper dictionaries=proxy(SysDictTypeMapper.class,(proxy,method,values)->{
            check(TransactionSynchronizationManager.isActualTransactionActive(),"dictionary lookup shares replacement transaction");
            return List.of(dictionary("a"),dictionary("b"));
        });
        SysDictOrphanAlertMapper alerts=proxy(SysDictOrphanAlertMapper.class,(proxy,method,values)->{
            Long tenant=TenantContext.getTenantId();
            check(!TenantContext.getTenantSkip() && Objects.equals(tenant,UserContext.getTenantId()),"writes retain exact tenant filter");
            check(TransactionSynchronizationManager.isActualTransactionActive(),"replacement writes are transactional");
            if(method.getName().equals("delete")) {visited.add(tenant); transactions.pending.clear(); return 1;}
            if(method.getName().equals("insert")) {
                SysDictOrphanAlert row=(SysDictOrphanAlert)values[0];
                check(Objects.equals(row.getTenantId(),tenant) && row.getBindingCount()==1 && "dict-orphan-scan".equals(row.getCreateBy()),"rebuilt alert preserves tenant binding and actor");
                if(rejected.contains(tenant) && row.getDictType().equals("b")) throw original;
                transactions.pending.add(row.getDictType()); return 1;
            }
            throw new AssertionError(method.getName());
        });
        SysDictOrphanAlertScanJob job=new SysDictOrphanAlertScanJob(registry,alerts,dictionaries,tenants,new TransactionTemplate(transactions));
        RuntimeException failure=caught(job::scan);
        check(failure.getSuppressed().length==1 && failure.getSuppressed()[0].getCause()==original && failure.getSuppressed()[0].getMessage().contains("10"),"failed tenant and original exception preserved");
        check(visited.equals(List.of(10L,20L)),"other tenant continues after replacement fails");
        check(transactions.committed.get(10L).equals(List.of("old-10")) && transactions.committed.get(20L).equals(List.of("a","b")),"failed replacement restores old alerts and other tenant commits");
        check(transactions.rollbacks==1 && transactions.commits==1,"one independent transaction per tenant");
        rejected.clear(); JobResult recovered=job.scan();
        check(recovered.getAffectedRows()==4 && "字典引用检查完成：已刷新4条告警".equals(recovered.getResultMsg()),"recovery returns actual refreshed alert count");
        check(transactions.committed.values().stream().allMatch(rows->rows.equals(List.of("a","b"))),"missing dictionary filtered and both tenants rebuilt");
        check(job.scan().getAffectedRows()==4 && transactions.committed.values().stream().allMatch(rows->rows.size()==2),"repeat is replacement count without accumulation");
        rejected.addAll(List.of(10L,20L));
        check(caught(job::scan).getSuppressed().length==2,"all tenant errors aggregated");
        check(transactions.committed.values().stream().allMatch(rows->rows.equals(List.of("a","b"))),"both failed replacements leave prior committed alerts intact");
        rejected.clear(); implicit[0]=false;
        check(job.scan().getAffectedRows()==0 && transactions.committed.values().stream().allMatch(List::isEmpty),"empty implicit registry clears outdated alerts transactionally");
        int commits=transactions.commits; active[0]=false;
        check(job.scan().getAffectedRows()==0 && transactions.commits==commits,"empty tenant list does not start transactions");
        check(!TransactionSynchronizationManager.isActualTransactionActive(),"transaction context released");
    }
    private static SysTenant tenant(Long id){SysTenant row=new SysTenant();row.setTenantId(id);return row;}
    private static SysDictType dictionary(String name){SysDictType row=new SysDictType();row.setDictType(name);return row;}
    private static DictReferenceRegistry.ImplicitDictReferenceAlert alert(String name){return new DictReferenceRegistry.ImplicitDictReferenceAlert(name,"controlled",List.of(new DictReferenceRegistry.DictReferenceBinding(name,"controlled","controlled","status","status")));}
    private static final class RecordingTransactions extends AbstractPlatformTransactionManager {
        private final Map<Long,List<String>> committed=new HashMap<>();
        private List<String> pending; private Long tenant; private int commits,rollbacks;
        @Override protected Object doGetTransaction(){return new Object();}
        @Override protected void doBegin(Object transaction,TransactionDefinition definition){tenant=TenantContext.getTenantId();pending=new ArrayList<>(committed.getOrDefault(tenant,List.of()));}
        @Override protected void doCommit(DefaultTransactionStatus status){committed.put(tenant,new ArrayList<>(pending));commits++;}
        @Override protected void doRollback(DefaultTransactionStatus status){pending.clear();rollbacks++;}
    }
    private static RuntimeException caught(Runnable operation){try{operation.run();}catch(RuntimeException failure){return failure;}throw new AssertionError("expected failure");}
    private static <T> T proxy(Class<T> type,InvocationHandler handler){return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler));}
    private static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
}
