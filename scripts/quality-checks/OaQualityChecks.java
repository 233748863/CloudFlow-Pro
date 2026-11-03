package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.ProcessStartResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.event.consumer.OaApprovalSubmittedEventConsumer;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.OaApprovalParticipant;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.ibatis.builder.MapperBuilderAssistant;

/** Production service checks with controlled mapper/remote results. */
public final class OaQualityChecks {
    private static int checks;
    public static void main(String[] args) throws Exception {
        for(Class<?> type:List.of(OaProject.class,OaProjectTask.class,OaTimesheetDetail.class,OaProjectDependency.class,WorkTask.class))
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),"oa-quality"),type);
        UserContext.setTenantId(100L);UserContext.setUserId(1L);UserContext.setUserName("quality");TenantContext.setTenantId(100L);
        try { projectBatch();approvalResponse();System.out.println("PASS: OA quality service checks="+checks+"; actual_database=false"); }
        finally {UserContext.clear();TenantContext.clear();}
    }

    private static void projectBatch() {
        OaProject project=new OaProject();project.setProjectId(5L);project.setTenantId(100L);project.setDeleted(0);project.setStatus("IN_PROGRESS");
        AtomicInteger locks=new AtomicInteger(),refreshes=new AtomicInteger(),synchronizes=new AtomicInteger(),writes=new AtomicInteger();
        AtomicReference<Long> references=new AtomicReference<>(0L);
        AtomicInteger updateRows=new AtomicInteger(1);
        OaProjectMapper projects=proxy(OaProjectMapper.class,(target,method,values)->{if(method.getName().equals("selectForUpdate"))locks.incrementAndGet();return project;});
        OaProjectTaskMapper tasks=proxy(OaProjectTaskMapper.class,(target,method,values)->{
            if(method.getName().equals("selectList")){refreshes.incrementAndGet();return new ArrayList<OaProjectTask>();}
            if(method.getName().equals("selectCount"))return references.get();
            if(method.getName().equals("update")){writes.incrementAndGet();return updateRows.get();}
            OaProjectTask task=new OaProjectTask();task.setTaskId((Long)values[0]);task.setProjectId(5L);task.setTenantId(100L);task.setDeleted(0);task.setVersion(0);return task;
        });
        ProjectExecutionStateService execution=new ProjectExecutionStateService(projects,tasks){@Override public void syncProjectStatus(Long id,String actor){equal(5L,id,"same project synchronized");synchronizes.incrementAndGet();}};
        OaProjectTaskService service=new OaProjectTaskService(projects,tasks,
                proxy(OaProjectDependencyMapper.class,(target,method,values)->0L),proxy(OaTimesheetDetailMapper.class,(target,method,values)->0L),
                proxy(WorkTaskMapper.class,(target,method,values)->0L),null,execution,null);
        service.removeTasks(List.of(1L,2L));equal(2,writes.get(),"both tasks deleted");equal(2,locks.get(),"each deletion retains project locking");
        equal(1,refreshes.get(),"tree refreshed once per project");equal(1,synchronizes.get(),"status synchronized once per project");
        references.set(1L);rejects(()->service.removeTasks(List.of(3L)),"referenced task rejected");equal(2,writes.get(),"referenced task not deleted");
        references.set(0L);updateRows.set(0);rejects(()->service.removeTasks(List.of(3L)),"concurrent version failure rejected");equal(1,refreshes.get(),"failed deletion does not refresh project");
        project.setTenantId(200L);rejects(()->service.removeTasks(List.of(4L)),"foreign project rejected");
    }

    private static void approvalResponse() throws Exception {
        ObjectMapper json=new ObjectMapper().findAndRegisterModules();
        AtomicReference<String> current=new AtomicReference<>("F:quality");
        AtomicInteger starts=new AtomicInteger(),bindings=new AtomicInteger();
        AtomicReference<R<ProcessStartResult>> response=new AtomicReference<>(R.ok(new ProcessStartResult("actual-instance","WF-quality")));
        OaApprovalParticipant participant=new OaApprovalParticipant(){
            @Override public String getSupportedBusinessType(){return "OA_MEETING_BOOKING";}
            @Override public String currentInstance(Long id){return current.get();}
            @Override public void bindInstance(OaApprovalRequest request,String instance){equal("actual-instance",instance,"uses single returned instance field");current.set(instance);bindings.incrementAndGet();}
            @Override public void handleApproved(ApprovalResultDTO result){throw new AssertionError("Unexpected approval");}
            @Override public void handleRejected(ApprovalResultDTO result){throw new AssertionError("Unexpected rejection");}
        };
        RemoteWorkflowService remote=proxy(RemoteWorkflowService.class,(target,method,values)->{starts.incrementAndGet();return response.get();});
        OaApprovalSubmittedEventConsumer consumer=new OaApprovalSubmittedEventConsumer(json,remote,List.of(participant));
        OaApprovalRequest request=new OaApprovalRequest();request.setBusinessType("OA_MEETING_BOOKING");request.setBusinessId(1L);request.setTenantId(100L);
        request.setReservation("F:quality");request.setProcessKey("oa_meeting_booking");request.setStartUserId(1L);request.setVariables(Map.of("businessId",1L));
        BusinessEventEnvelope event=BusinessEventEnvelope.builder().tenantId(100L).eventType("OA_F_APPROVAL_SUBMITTED").payload(json.writeValueAsString(request)).build();
        consumer.consume(event);equal(1,bindings.get(),"first success binds once");consumer.consume(event);equal(1,starts.get(),"already bound delivery never starts again");
        current.set("F:quality");response.set(R.ok(new ProcessStartResult(" ","WF-bad")));
        rejectsChecked(()->consumer.consume(event),"blank returned instance fails");equal(1,bindings.get(),"invalid result never binds");
        response.set(R.fail("unavailable"));rejectsChecked(()->consumer.consume(event),"remote failure remains retryable failure");
        TenantContext.setTenantId(200L);UserContext.setTenantId(200L);int before=starts.get();
        rejectsChecked(()->consumer.consume(event),"cross-tenant event rejected");equal(before,starts.get(),"wrong tenant rejected before workflow call");
        TenantContext.setTenantId(100L);UserContext.setTenantId(100L);
    }

    private interface CheckedAction{void run() throws Exception;}
    private static void rejectsChecked(CheckedAction action,String label)throws Exception{try{action.run();}catch(RuntimeException expected){checks++;return;}throw new AssertionError(label);}
    private static void rejects(Runnable action,String label){try{action.run();}catch(RuntimeException expected){checks++;return;}throw new AssertionError(label);}
    private static <T>T proxy(Class<T> type,InvocationHandler handler){return type.cast(Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},handler));}
    private static void equal(Object expected,Object actual,String label){checks++;if(!Objects.equals(expected,actual))throw new AssertionError(label+": expected="+expected+", actual="+actual);}
}
