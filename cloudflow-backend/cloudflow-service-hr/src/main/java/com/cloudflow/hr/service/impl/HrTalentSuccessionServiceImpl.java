package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.client.dto.ProcessStartDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessionPlanDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessionPlanQueryDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentSuccessorDTO;
import com.cloudflow.hr.domain.entity.HrTalentSuccessionPlan;
import com.cloudflow.hr.domain.entity.HrTalentSuccessor;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanListVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessionPlanVO;
import com.cloudflow.hr.domain.vo.talent.HrTalentSuccessorVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTalentSuccessionPlanMapper;
import com.cloudflow.hr.mapper.HrTalentSuccessorMapper;
import com.cloudflow.hr.service.IHrTalentSuccessionService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrTalentSuccessionServiceImpl implements IHrTalentSuccessionService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrTalentSuccessionPlanMapper planMapper;
    private final HrTalentSuccessorMapper successorMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;
    private final WorkflowServiceClient workflowServiceClient;

    @Value("${cloudflow.hr.talent.succession-process-key:wf_hr_talent_succession}")
    private String successionProcessKey;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createPlan(HrTalentSuccessionPlanDTO dto) {
        HrTalentSuccessionPlan plan = objectMapper.convertValue(dto, HrTalentSuccessionPlan.class);
        plan.setTenantId(currentTenantId());
        plan.setStatus(StringUtils.hasText(plan.getStatus()) ? plan.getStatus() : "DRAFT");
        plan.setDeleted(0);
        plan.setCreateBy(currentUserName());
        plan.setUpdateBy(currentUserName());
        if (!StringUtils.hasText(plan.getPlanNo())) {
            plan.setPlanNo("SP-" + System.currentTimeMillis());
        }
        planMapper.insert(plan);
        return plan.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updatePlan(Long planId, HrTalentSuccessionPlanDTO dto) {
        crudService.updateProperties(HrTalentSuccessionPlan.class, planId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrTalentSuccessionPlanListVO> pagePlans(HrTalentSuccessionPlanQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrTalentSuccessionPlan.class,
                MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrTalentSuccessionPlanListVO.class, objectMapper);
    }

    @Override
    public HrTalentSuccessionPlanVO getPlan(Long planId) {
        Map<String, Object> plan = crudService.get(HrTalentSuccessionPlan.class, planId);
        if (plan.isEmpty()) {
            return null;
        }
        Map<String, Object> q = new LinkedHashMap<>();
        q.put("planId", planId);
        List<Map<String, Object>> successorRows = crudService.list(HrTalentSuccessor.class, q);
        HrTalentSuccessionPlanVO vo = objectMapper.convertValue(plan, HrTalentSuccessionPlanVO.class);
        vo.setSuccessors(MapConverters.toVOList(successorRows, HrTalentSuccessorVO.class, objectMapper));
        return vo;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long addSuccessor(Long planId, HrTalentSuccessorDTO dto) {
        HrTalentSuccessionPlan plan = planMapper.selectById(planId);
        if (plan == null) {
            throw new HrBusinessException("PLAN_NOT_FOUND", "继任计划不存在：" + planId);
        }
        Long employeeId = dto.getEmployeeId();
        QueryWrapper<HrTalentSuccessor> dup = new QueryWrapper<>();
        dup.eq("tenant_id", currentTenantId()).eq("plan_id", planId).eq("employee_id", employeeId).eq("deleted", 0);
        if (successorMapper.selectCount(dup) > 0) {
            throw new HrBusinessException("DUPLICATE_SUCCESSOR",
                    "该员工已是本计划继任人：" + employeeId);
        }
        HrTalentSuccessor s = objectMapper.convertValue(dto, HrTalentSuccessor.class);
        s.setTenantId(currentTenantId());
        s.setPlanId(planId);
        s.setStatus(StringUtils.hasText(s.getStatus()) ? s.getStatus() : "ACTIVE");
        s.setDeleted(0);
        s.setCreateBy(currentUserName());
        s.setUpdateBy(currentUserName());
        successorMapper.insert(s);
        return s.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void removeSuccessor(Long successorId) {
        crudService.delete(HrTalentSuccessor.class, successorId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String publish(Long planId) {
        HrTalentSuccessionPlan plan = planMapper.selectById(planId);
        if (plan == null) {
            throw new HrBusinessException("PLAN_NOT_FOUND", "继任计划不存在：" + planId);
        }
        if (!"DRAFT".equals(plan.getStatus())) {
            throw new HrBusinessException("PLAN_STATUS_INVALID",
                    "继任计划状态 " + plan.getStatus() + " 不允许发起发布审批");
        }
        QueryWrapper<HrTalentSuccessor> qw = new QueryWrapper<>();
        qw.eq("plan_id", planId).eq("tenant_id", currentTenantId()).eq("status", "ACTIVE").eq("deleted", 0);
        if (successorMapper.selectCount(qw) == 0) {
            throw new HrBusinessException("NO_SUCCESSOR", "继任计划必须至少提名一名继任人后才能发布");
        }
        ProcessStartDTO dto = new ProcessStartDTO();
        dto.setTenantId(currentTenantId());
        dto.setProcessDefinitionKey(successionProcessKey);
        dto.setBusinessType("HR_TALENT_SUCCESSION");
        dto.setBusinessId(planId);
        dto.setBusinessNo(plan.getPlanNo());
        dto.setProcessTitle("继任计划发布-" + plan.getPlanName());
        dto.setStartUserId(UserContext.getUserId());
        Map<String, Object> vars = new LinkedHashMap<>();
        vars.put("planId", planId);
        vars.put("planName", plan.getPlanName());
        vars.put("positionId", plan.getPositionId());
        dto.setVariables(vars);
        R<String> response = workflowServiceClient.startProcess(dto);
        if (response == null || !response.isSuccess() || !StringUtils.hasText(response.getData())) {
            String msg = response == null ? "Workflow 服务无响应" : response.getMsg();
            throw new HrBusinessException("WORKFLOW_START_FAILED", "继任计划发布流程启动失败：" + msg);
        }
        UpdateWrapper<HrTalentSuccessionPlan> uw = new UpdateWrapper<>();
        uw.eq("id", planId).eq("tenant_id", currentTenantId())
                .set("process_instance_id", response.getData())
                .set("update_time", LocalDateTime.now());
        planMapper.update(null, uw);
        log.info("继任计划发布已提交，planId={}, processInstanceId={}", planId, response.getData());
        return response.getData();
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
