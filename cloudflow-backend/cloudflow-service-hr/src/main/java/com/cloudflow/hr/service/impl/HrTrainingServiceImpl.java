package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.domain.dto.HrTrainingSessionPayload;
import com.cloudflow.hr.domain.entity.HrTrainingSession;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.HrTrainingSessionMapper;
import com.cloudflow.hr.service.IHrTrainingService;
import com.cloudflow.hr.service.HrTypedCrudService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 培训管理业务服务实现：班次创建校验 + 状态机迁移。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrTrainingServiceImpl implements IHrTrainingService {

    private static final Set<String> SESSION_STATUSES = Set.of(
            "PLANNED", "REGISTERING", "ONGOING", "COMPLETED", "CANCELLED");

    private final HrTrainingSessionMapper trainingSessionMapper;
    private final HrTypedCrudService crudService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSession(HrTrainingSessionPayload payload) {
        if (payload == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "班次数据不能为空");
        }
        if (payload.getCourseId() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "courseId 不能为空");
        }
        if (payload.getCapacity() == null || payload.getCapacity() <= 0) {
            throw new HrBusinessException("INVALID_PARAMETER", "capacity 必须为正整数");
        }
        if (payload.getStartTime() == null || payload.getEndTime() == null) {
            throw new HrBusinessException("INVALID_PARAMETER", "班次起止时间不能为空");
        }
        if (!payload.getStartTime().isBefore(payload.getEndTime())) {
            throw new HrBusinessException("INVALID_PARAMETER", "班次起始时间必须早于结束时间");
        }
        if (!StringUtils.hasText(payload.getStatus())) {
            payload.setStatus("PLANNED");
        }
        if (payload.getEnrolledCount() == null) {
            payload.setEnrolledCount(0);
        }
        return crudService.create(HrTrainingSession.class, payload);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public String changeSessionStatus(Long sessionId, String action) {
        HrTrainingSession session = trainingSessionMapper.selectById(sessionId);
        if (session == null) {
            throw new HrBusinessException("SESSION_NOT_FOUND", "培训班次不存在：" + sessionId);
        }
        String current = String.valueOf(session.getStatus()).toUpperCase(Locale.ROOT);
        String target = nextStatus(current, action);
        if (!SESSION_STATUSES.contains(target)) {
            throw new HrBusinessException("INVALID_STATUS_ACTION",
                    "不支持的状态切换：" + action + "，当前状态：" + current);
        }
        UpdateWrapper<HrTrainingSession> wrapper = new UpdateWrapper<>();
        wrapper.eq("id", sessionId)
                .eq("tenant_id", currentTenantId())
                .set("status", target)
                .set("update_time", LocalDateTime.now())
                .set("update_by", currentUserName());
        trainingSessionMapper.update(null, wrapper);
        log.info("培训班次状态变更，sessionId: {}, {} → {}", sessionId, current, target);
        return target;
    }

    private String nextStatus(String current, String action) {
        String lower = String.valueOf(action).toLowerCase(Locale.ROOT);
        return switch (lower) {
            case "register" -> "PLANNED".equals(current) ? "REGISTERING" : current;
            case "start" -> "REGISTERING".equals(current) || "PLANNED".equals(current) ? "ONGOING" : current;
            case "complete" -> "ONGOING".equals(current) ? "COMPLETED" : current;
            case "cancel" -> "CANCELLED";
            case "reopen" -> "CANCELLED".equals(current) ? "PLANNED" : current;
            default -> action == null ? current : action.toUpperCase(Locale.ROOT);
        };
    }

    private Long currentTenantId() {
        Long tid = TenantContext.getTenantId();
        if (tid != null) {
            return tid;
        }
        tid = UserContext.getTenantId();
        return tid == null ? 100000L : tid;
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    Map<String, Object> diagnosticContext() {
        // 保留扩展点：后续如需打 trace 信息可在此挂载
        return Map.of();
    }
}
