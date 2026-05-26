package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryDTO;
import com.cloudflow.hr.domain.dto.labor.HrWorkInjuryQueryDTO;
import com.cloudflow.hr.domain.entity.HrWorkInjury;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryListVO;
import com.cloudflow.hr.domain.vo.labor.HrWorkInjuryVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.cloudflow.hr.service.HrWorkInjuryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrWorkInjuryServiceImpl implements HrWorkInjuryService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrWorkInjuryMapper injuryMapper;
    private final HrTypedCrudService crudService;
    private final WorkflowServiceClient workflowServiceClient;
    private final ObjectMapper objectMapper;

    @Value("${cloudflow.hr.injury.determination-process-key:wf_hr_work_injury}")
    private String injuryProcessKey;

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
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(injuryProcessKey);
        dto.setBusinessType("HR_WORK_INJURY");
        dto.setBusinessId(injuryId);
        dto.setBusinessNo(injury.getInjuryNo());
        dto.setProcessTitle("工伤认定-" + injury.getInjuryNo());
        dto.setStartUserId(UserContext.getUserId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("injuryId", injuryId);
        vars.put("employeeId", injury.getEmployeeId());
        vars.put("injuryLevel", injury.getInjuryLevel());
        dto.setVariables(vars);
        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "工伤认定审批启动失败：" + msg);
        }
        UpdateWrapper<HrWorkInjury> uw = new UpdateWrapper<>();
        uw.eq("id", injuryId).eq("tenant_id", currentTenantId())
                .set("process_instance_id", response.getData())
                .set("status", "DETERMINING")
                .set("update_time", LocalDateTime.now());
        injuryMapper.update(null, uw);
        return response.getData();
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
                .set("remark", reason)
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
