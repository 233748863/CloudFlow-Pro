package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.config.SysConfigKeys;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryQueryDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjury;
import com.cloudflow.hr.event.HrWorkInjurySubmittedEvent;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryListVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.IHrWorkInjuryService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkInjuryServiceImpl implements IHrWorkInjuryService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrWorkInjuryMapper injuryMapper;
    private final HrTypedCrudService crudService;
    private final WorkflowServiceClient workflowServiceClient;
    private final ObjectMapper objectMapper;
    private final OutboxPublisher outboxPublisher;
    private final RuntimeSysConfigService runtimeSysConfigService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createInjury(HrWorkInjuryDTO dto) {
        HrWorkInjury injury = objectMapper.convertValue(dto, HrWorkInjury.class);
        injury.setTenantId(currentTenantId());
        if (!StringUtils.hasText(injury.getInjuryNo())) {
            injury.setInjuryNo("WI-" + System.currentTimeMillis());
        }
        if (!StringUtils.hasText(injury.getStatus())) {
            injury.setStatus("REPORTED");
        }
        injury.setDeleted(0);
        injury.setCreateBy(currentUserName());
        injury.setUpdateBy(currentUserName());
        injuryMapper.insert(injury);
        return injury.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新工伤")
    public void updateInjury(Long injuryId, HrWorkInjuryDTO dto) {
        crudService.updateProperties(HrWorkInjury.class, injuryId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrWorkInjuryListVO> page(HrWorkInjuryQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrWorkInjury.class,
                MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrWorkInjuryListVO.class, objectMapper);
    }

    @Override
    public PageResult<HrWorkInjuryListVO> listMine(HrWorkInjuryQueryDTO query) {
        Map<String, Object> q = new LinkedHashMap<>(MapConverters.toServiceQuery(query, objectMapper));
        Long userId = UserContext.getUserId();
        if (userId != null) {
            q.put("employeeId", userId);
        }
        Map<String, Object> raw = crudService.page(HrWorkInjury.class, q);
        return MapConverters.toPageResult(raw, HrWorkInjuryListVO.class, objectMapper);
    }

    @Override
    public HrWorkInjuryVO get(Long injuryId) {
        Map<String, Object> row = crudService.get(HrWorkInjury.class, injuryId);
        if (row.isEmpty()) {
            return null;
        }
        return objectMapper.convertValue(row, HrWorkInjuryVO.class);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String submitDetermination(Long injuryId) {
        HrWorkInjury injury = injuryMapper.selectById(injuryId);
        if (injury == null) {
            throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在：" + injuryId);
        }
        if (!"REPORTED".equals(injury.getStatus()) && !"INVESTIGATING".equals(injury.getStatus())) {
            throw new HrBusinessException("WORK_INJURY_STATUS_INVALID",
                    "状态 " + injury.getStatus() + " 不允许发起认定");
        }
        UpdateWrapper<HrWorkInjury> uw = new UpdateWrapper<>();
        uw.eq("id", injuryId).eq("tenant_id", currentTenantId())
                .set("status", "DETERMINING")
                .set("update_time", LocalDateTime.now());
        injuryMapper.update(null, uw);
        HrWorkInjurySubmittedEvent event = new HrWorkInjurySubmittedEvent();
        event.setInjuryId(injuryId);
        event.setInjuryNo(injury.getInjuryNo());
        event.setSubmittedAt(LocalDateTime.now());
        publishWorkInjurySubmittedEvent(injury, event);
        return null;
    }

    public void startWorkInjuryWorkflow(HrWorkInjury injury) {
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(runtimeSysConfigService.getString(
                SysConfigKeys.HR_INJURY_DETERMINATION_PROCESS_KEY,
                "wf_hr_work_injury"));
        dto.setBusinessType("HR_WORK_INJURY");
        dto.setBusinessId(injury.getId());
        dto.setBusinessNo(injury.getInjuryNo());
        dto.setProcessTitle("工伤认定-" + injury.getInjuryNo());
        dto.setStartUserId(injury.getEmployeeId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("injuryId", injury.getId());
        vars.put("employeeId", injury.getEmployeeId());
        vars.put("injuryLevel", injury.getInjuryLevel());
        dto.setVariables(vars);
        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow service unavailable" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "工伤认定审批启动失败：" + msg);
        }
        UpdateWrapper<HrWorkInjury> uw = new UpdateWrapper<>();
        uw.eq("id", injury.getId()).eq("tenant_id", currentTenantId())
                .and(item -> item.isNull("process_instance_id").or().eq("process_instance_id", ""))
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        injuryMapper.update(null, uw);
    }

    private void publishWorkInjurySubmittedEvent(HrWorkInjury injury, HrWorkInjurySubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("HR_WORK_INJURY_SUBMITTED")
                    .sourceModule("cloudflow-hr")
                    .sourceId(injury.getId())
                    .tenantId(injury.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new HrBusinessException("WORKFLOW_EVENT_PUBLISH_FAILED", "工伤认定流程事件发布失败");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void close(Long injuryId, String reason) {
        HrWorkInjury injury = injuryMapper.selectById(injuryId);
        if (injury == null) {
            throw new HrBusinessException("WORK_INJURY_NOT_FOUND", "工伤记录不存在：" + injuryId);
        }
        UpdateWrapper<HrWorkInjury> uw = new UpdateWrapper<>();
        uw.eq("id", injuryId).eq("tenant_id", currentTenantId())
                .set("status", "CLOSED")
                .set("close_reason", reason)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        injuryMapper.update(null, uw);
    }

    private long currentTenantId() {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null) {
            return tenantId;
        }
        tenantId = UserContext.getTenantId();
        return tenantId == null ? DEFAULT_TENANT_ID : tenantId;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}
