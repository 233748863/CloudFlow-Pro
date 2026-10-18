package com.cloudflow.hr.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.client.JobReportClient;
import com.cloudflow.common.job.config.JobExecutionStore;
import com.cloudflow.common.job.service.JobExecutionService;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.job.model.JobAcceptVO;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.job.model.JobResultReportDTO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class HrRuleAsyncExecutor {
    private final JobExecutionService executionService;
    private final JobReportClient reportClient;
    private final JobExecutionStore store;
    private final HrRuleSupport support;
    private final ObjectMapper objectMapper;
    private static final Duration OWNER_TTL = Duration.ofHours(24);

    public String submit(String handlerName, Object parameters) {
        if (UserContext.getUserId() == null) throw new HrBusinessException("UNAUTHORIZED", "后台业务操作需要登录身份");
        String executeNo = UUID.randomUUID().toString();
        BusinessJobStartRequest request = new BusinessJobStartRequest();
        request.setExecuteNo(executeNo);
        request.setHandlerName(handlerName);
        request.setOperatorName(HrRuleSupport.userName());
        try { request.setHandlerParam(objectMapper.writeValueAsString(parameters)); }
        catch (JsonProcessingException exception) { throw new HrBusinessException("INVALID_JOB_PARAMETER", "后台任务参数无法序列化", exception); }
        JobExecuteDTO execution;
        try { execution = reportClient.registerBusinessJob(request); }
        catch (RuntimeException exception) { throw new HrBusinessException("JOB_REGISTRATION_FAILED", "后台任务登记失败，请检查集中任务配置或服务连接", exception); }
        try {
            store.put(ownerKey(executeNo), JobResult.success(0, "OWNED"), OWNER_TTL);
            support.audit("RULE_TASK", null, "TASK_SUBMITTED", Map.of("executeNo", executeNo, "handler", handlerName));
            R<JobAcceptVO> accepted = executionService.execute(execution);
            if (accepted == null || !accepted.isSuccess() || accepted.getData() == null || !accepted.getData().isAccepted()) {
                throw new HrBusinessException("JOB_QUEUE_FULL", "后台任务未被接收，请稍后重试");
            }
        } catch (RuntimeException exception) {
            JobResultReportDTO report = new JobResultReportDTO();
            report.setExecuteNo(executeNo);
            report.setExecuteStatus("FAILED");
            report.setResultMsg("后台任务未开始执行");
            reportClient.reportResult(report);
            throw exception;
        }
        return executeNo;
    }

    public JobResult status(String executeNo) {
        if (executeNo == null || store.get(ownerKey(executeNo)) == null) throw new HrBusinessException("FORBIDDEN", "无权查看该任务，或任务记录已过期");
        JobResult result = store.get(executeNo);
        if (result == null) throw new HrBusinessException("JOB_RESULT_EXPIRED", "任务结果已过期，请查询业务单据或集中任务日志");
        return JobResult.builder().executeStatus(result.getExecuteStatus()).affectedRows(result.getAffectedRows())
                .durationMs(result.getDurationMs()).resultMsg(result.getResultMsg()).build();
    }

    private String ownerKey(String executeNo) {
        return "hr-owner:" + HrRuleSupport.tenantId() + ":" + UserContext.getUserId() + ":" + executeNo;
    }
}
