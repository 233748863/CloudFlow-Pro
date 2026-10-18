package com.cloudflow.workflow.job;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeDef;
import com.cloudflow.common.workflow.callback.registry.BusinessTypeRegistry;
import com.cloudflow.workflow.domain.WfReconcileAlert;
import com.cloudflow.workflow.domain.system.SysRole;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.system.SysUserRole;
import com.cloudflow.workflow.mapper.WfReconcileAlertMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 真实对账任务与事务模板；数据库映射器、元数据和消息资源为受控输入。 */
public final class ProcessBusinessReconcileChecks {
    private static int checks;
    public static void main(String[] args) {
        for(Class<?> entity:List.of(SysRole.class,SysUser.class,SysUserRole.class,WfReconcileAlert.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),"reconcile-checks"),entity);
        }
        TenantContext.setTenantId(9001L); UserContext.setTenantId(9002L);
        try {
            verify();
            check(Objects.equals(TenantContext.getTenantId(),9001L)&&Objects.equals(UserContext.getTenantId(),9002L)&&!TenantContext.getTenantSkip(),"caller contexts restored");
            System.out.println("PROCESS_RECONCILE_CHECKS: checks="+checks+"; failed=0; real_job_and_spring_transaction_template=true; controlled_metadata_mappers_and_messages=true; actual_database=false");
        } finally {TenantContext.clear();UserContext.clear();}
    }
    private static void verify() {
        RecordingTransactions transactions=new RecordingTransactions(); transactions.alerts.add("10:existing");
        List<WfReconcileAlert> differences=new ArrayList<>(List.of(alert(10L,"failed-message"),alert(10L,"failed-insert"),alert(10L,"existing"),alert(10L,"same"),alert(20L,"other")));
        List<String> attempted=new ArrayList<>();
        boolean[] failMessage={true},failInsert={true},noRoles={false},manyUsers={false},metadataFailure={false},scanFailure={false},zeroInsert={false};
        RuntimeException messageError=new DuplicateKeyException("controlled notification identity failure");
        RuntimeException insertError=new IllegalStateException("controlled alert insertion failure");
        RuntimeException metadataError=new IllegalStateException("controlled metadata read failure");
        RuntimeException scanError=new IllegalStateException("controlled scan failure");
        List<BusinessTypeDef> definitions=new ArrayList<>(List.of(definition("ready"),definition("missing")));
        BusinessTypeRegistry registry=new BusinessTypeRegistry(){@Override public Collection<BusinessTypeDef> all(){return definitions;}};
        Map<String,Integer> metadataCalls=new LinkedHashMap<>();
        JdbcTemplate jdbc=new JdbcTemplate(){
            @Override public <T> T queryForObject(String statement,Class<T> required,Object... parameters){
                String table=(String)parameters[0];metadataCalls.merge(table,1,Integer::sum);
                if(metadataFailure[0]&&table.equals("temporary"))throw metadataError;
                return required.cast(Integer.valueOf(table.equals("missing")?3:4));
            }
        };
        WfReconcileAlertMapper mapper=proxy(WfReconcileAlertMapper.class,(proxy,method,values)->{
            if(method.getName().equals("selectInconsistentRecords")) {
                check(TenantContext.getTenantSkip()&&!TransactionSynchronizationManager.isActualTransactionActive(),"discovery alone bypasses tenants outside write transaction");
                check(values[0].equals(7)&&((Collection<?>)values[1]).stream().noneMatch(item->((BusinessTypeDef)item).getCode().equals("missing")),"seven day window and missing schema filter preserved");
                if(scanFailure[0])throw scanError;
                return new ArrayList<>(differences);
            }
            check(method.getName().equals("insert"),"only alert insert used");
            WfReconcileAlert row=(WfReconcileAlert)values[0]; String key=key(row); attempted.add(key);
            check(TransactionSynchronizationManager.isActualTransactionActive()&&!TenantContext.getTenantSkip()&&Objects.equals(row.getTenantId(),TenantContext.getTenantId())&&Objects.equals(row.getTenantId(),UserContext.getTenantId()),"alert insertion has transaction and exact business tenant");
            check(row.getId()==null&&row.getDetectedAt()!=null&&row.getCreateTime()!=null,"alert gets a fresh generated identity and timestamps");
            if(failInsert[0]&&row.getWfInstanceId().equals("failed-insert"))throw insertError;
            if(transactions.pendingAlerts.contains(key))throw new DuplicateKeyException("controlled existing difference");
            if(zeroInsert[0])return 0;
            transactions.pendingAlerts.add(key);row.setId(++transactions.sequence);transactions.current=row;return 1;
        });
        SysRoleMapper roles=proxy(SysRoleMapper.class,(proxy,method,values)->{
            LambdaQueryWrapper<?> query=(LambdaQueryWrapper<?>)values[1];query.getSqlSegment();
            Collection<Object> parameters=query.getParamNameValuePairs().values();
            check(parameters.contains(TenantContext.getTenantId())&&parameters.contains("0")&&parameters.contains(0),"role lookup constrains tenant and active undeleted roles");
            SysRole role=new SysRole();role.setRoleId(TenantContext.getTenantId()*10+(parameters.contains("admin")?1:2));
            return new Page<SysRole>(1,1,false).setRecords(noRoles[0]?List.of():List.of(role));
        });
        SysUserRoleMapper userRoles=proxy(SysUserRoleMapper.class,(proxy,method,values)->{
            LambdaQueryWrapper<?> query=(LambdaQueryWrapper<?>)values[0];query.getSqlSegment();
            check(query.getParamNameValuePairs().containsValue(TenantContext.getTenantId()),"role membership has exact tenant");
            List<SysUserRole> items=new ArrayList<>();
            for(long index=1;index<=(manyUsers[0]?25:3);index++){SysUserRole item=new SysUserRole();item.setUserId(TenantContext.getTenantId()*100+index);items.add(item);}return items;
        });
        SysUserMapper users=proxy(SysUserMapper.class,(proxy,method,values)->{
            LambdaQueryWrapper<?> query=(LambdaQueryWrapper<?>)values[0];query.getSqlSegment();
            Collection<Object> parameters=query.getParamNameValuePairs().values();
            check(parameters.contains(TenantContext.getTenantId())&&parameters.contains("0")&&parameters.contains(0),"recipient query has tenant and enabled undeleted user filters");
            List<SysUser> items=new ArrayList<>();
            for(long index=1;index<=(manyUsers[0]?25:3);index++){SysUser item=new SysUser();item.setUserId(TenantContext.getTenantId()*100+index);items.add(item);}return items;
        });
        MessageSender sender=request->{
            WfReconcileAlert row=transactions.current;Long receiver=request.getReceivers().get(0).getReceiverId();
            check(TransactionSynchronizationManager.isActualTransactionActive()&&!TenantContext.getTenantSkip()&&Objects.equals(row.getTenantId(),UserContext.getTenantId()),"notification shares alert transaction and tenant");
            check("WORKFLOW_RECONCILE_ALERT".equals(request.getBizType())&&String.valueOf(row.getId()).equals(request.getBizId())&&request.getDeduplicationKey().endsWith(":"+receiver),"message source identifies actual alert and receiver");
            check(receiver/100==row.getTenantId()&&"LEGACY_NOTICE_1".equals(request.getTemplateCode()),"receiver belongs to business tenant and existing presentation is preserved");
            if(failMessage[0]&&row.getWfInstanceId().equals("failed-message")&&receiver%100==2)throw messageError;
            transactions.pendingMessages.add(key(row)+":"+receiver);
        };
        ProcessBusinessReconcileJob job=new ProcessBusinessReconcileJob(mapper,registry,jdbc,sender,roles,userRoles,users,new TransactionTemplate(transactions));
        RuntimeException failed=caught(job::reconcile);
        check(failed.getSuppressed().length==2&&failed.getSuppressed()[0].getCause()==messageError&&failed.getSuppressed()[1].getCause()==insertError,"message duplicate exception and real insert error both reported");
        check(attempted.equals(List.of("10:failed-message","10:failed-insert","10:existing","10:same","20:other")),"all differences continue across insertion and notification failures");
        check(transactions.alerts.equals(Set.of("10:existing","10:same","20:other"))&&transactions.messages.size()==6&&transactions.messages.stream().noneMatch(item->item.contains("failed")),"message failure rolls back alert and earlier recipient while other tenants commit");
        failMessage[0]=false;failInsert[0]=false;JobResult recovered=job.reconcile();
        check(recovered.getAffectedRows()==2&&"流程业务对账完成：新增2条告警".equals(recovered.getResultMsg()),"recovery reports only newly persisted alerts");
        check(transactions.alerts.size()==5&&transactions.messages.size()==12,"failed alerts recover all recipients and existing alerts are not resent");
        check(job.reconcile().getAffectedRows()==0&&transactions.messages.size()==12,"repeat reports zero without notification duplication");
        check(metadataCalls.get("ready")==1&&metadataCalls.get("missing")==1,"known schema readiness remains cached");
        differences.clear();differences.add(alert(null,"no-tenant"));differences.add(alert(20L,"next"));
        check(caught(job::reconcile).getSuppressed().length==1&&transactions.alerts.contains("20:next")&&!attempted.contains("null:no-tenant"),"invalid tenant rejected without defaulting and next alert continues");
        differences.clear();differences.add(alert(10L,"no-role"));noRoles[0]=true;int messages=transactions.messages.size();
        check(job.reconcile().getAffectedRows()==1&&transactions.messages.size()==messages,"no recipients preserves existing alert-only behavior");
        noRoles[0]=false;manyUsers[0]=true;differences.clear();differences.add(alert(20L,"many"));
        check(job.reconcile().getAffectedRows()==1&&transactions.messages.size()==messages+20,"recipient cap remains twenty unique users");manyUsers[0]=false;
        differences.clear();differences.add(alert(10L,"zero-insert"));zeroInsert[0]=true;
        check(caught(job::reconcile).getSuppressed().length==1&&!transactions.alerts.contains("10:zero-insert"),"zero inserted rows is a real failure");zeroInsert[0]=false;
        definitions.add(definition("temporary"));metadataFailure[0]=true;differences.clear();differences.add(alert(10L,"schema-other"));
        RuntimeException metadata=caught(job::reconcile);
        check(metadata.getSuppressed()[0].getCause()==metadataError&&transactions.alerts.contains("10:schema-other"),"metadata query failure reported while ready types continue");
        metadataFailure[0]=false;check(job.reconcile().getAffectedRows()==0&&metadataCalls.get("temporary")==2,"temporary schema failure is retried and not cached as missing");
        scanFailure[0]=true;check(caught(job::reconcile)==scanError,"difference discovery errors propagate");scanFailure[0]=false;
        definitions.clear();int attempts=attempted.size();check(job.reconcile().getAffectedRows()==0&&attempted.size()==attempts,"empty registry succeeds without writes");
        check(!TransactionSynchronizationManager.isActualTransactionActive(),"transaction context released");
    }
    private static BusinessTypeDef definition(String table){return BusinessTypeDef.builder().code(table).module("hr").businessTable(table).build();}
    private static WfReconcileAlert alert(Long tenant,String instance){WfReconcileAlert row=new WfReconcileAlert();row.setTenantId(tenant);row.setWfInstanceId(instance);row.setBizModule("hr");row.setBizId(10L);row.setBizStatus("PENDING");row.setWfStatus("PASSED");return row;}
    private static String key(WfReconcileAlert row){return row.getTenantId()+":"+row.getWfInstanceId();}
    private static final class RecordingTransactions extends AbstractPlatformTransactionManager {
        private Set<String> alerts=new LinkedHashSet<>(),messages=new LinkedHashSet<>(),pendingAlerts,pendingMessages;
        private WfReconcileAlert current;private long sequence=100;
        @Override protected Object doGetTransaction(){return new Object();}
        @Override protected void doBegin(Object transaction,TransactionDefinition definition){pendingAlerts=new LinkedHashSet<>(alerts);pendingMessages=new LinkedHashSet<>(messages);current=null;}
        @Override protected void doCommit(DefaultTransactionStatus status){alerts=new LinkedHashSet<>(pendingAlerts);messages=new LinkedHashSet<>(pendingMessages);}
        @Override protected void doRollback(DefaultTransactionStatus status){pendingAlerts.clear();pendingMessages.clear();}
    }
    private static RuntimeException caught(Runnable operation){try{operation.run();}catch(RuntimeException failure){return failure;}throw new AssertionError("Expected failure");}
    private static <T> T proxy(Class<T> type,InvocationHandler handler){return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler));}
    private static void check(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
}
