package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.web.MapConverters;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.talent.HrTalentDevelopmentActionDTO;
import com.cloudflow.hr.domain.dto.talent.HrTalentDevelopmentActionQueryDTO;
import com.cloudflow.hr.domain.entity.HrTalentDevelopmentAction;
import com.cloudflow.hr.domain.vo.talent.HrTalentDevelopmentActionVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTalentDevelopmentActionMapper;
import com.cloudflow.hr.service.HrTalentDevelopmentService;
import com.cloudflow.hr.service.HrTypedCrudService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class HrTalentDevelopmentServiceImpl implements HrTalentDevelopmentService {

    private static final long DEFAULT_TENANT_ID = 100000L;

    private final HrTalentDevelopmentActionMapper actionMapper;
    private final HrTypedCrudService crudService;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createAction(HrTalentDevelopmentActionDTO dto) {
        HrTalentDevelopmentAction action = objectMapper.convertValue(dto, HrTalentDevelopmentAction.class);
        action.setTenantId(currentTenantId());
        action.setStatus(StringUtils.hasText(action.getStatus()) ? action.getStatus() : "PLANNED");
        action.setDeleted(0);
        action.setCreateBy(currentUserName());
        action.setUpdateBy(currentUserName());
        actionMapper.insert(action);
        return action.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateAction(Long actionId, HrTalentDevelopmentActionDTO dto) {
        crudService.updateProperties(HrTalentDevelopmentAction.class, actionId,
                MapConverters.toMap(dto, objectMapper));
    }

    @Override
    public PageResult<HrTalentDevelopmentActionVO> pageActions(HrTalentDevelopmentActionQueryDTO query) {
        Map<String, Object> raw = crudService.page(HrTalentDevelopmentAction.class,
                MapConverters.toServiceQuery(query, objectMapper));
        return MapConverters.toPageResult(raw, HrTalentDevelopmentActionVO.class, objectMapper);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void completeAction(Long actionId, BigDecimal evaluationScore, String evaluationNotes) {
        HrTalentDevelopmentAction action = actionMapper.selectById(actionId);
        if (action == null) {
            throw new HrBusinessException("ACTION_NOT_FOUND", "培养行动不存在：" + actionId);
        }
        if (!"ONGOING".equals(action.getStatus()) && !"PLANNED".equals(action.getStatus())) {
            throw new HrBusinessException("ACTION_STATUS_INVALID",
                    "培养行动状态 " + action.getStatus() + " 不允许完成回填");
        }
        UpdateWrapper<HrTalentDevelopmentAction> uw = new UpdateWrapper<>();
        uw.eq("id", actionId).eq("tenant_id", currentTenantId())
                .set("status", "COMPLETED")
                .set("evaluation_score", evaluationScore)
                .set("evaluation_notes", evaluationNotes)
                .set("update_by", currentUserName())
                .set("update_time", LocalDateTime.now());
        actionMapper.update(null, uw);
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
