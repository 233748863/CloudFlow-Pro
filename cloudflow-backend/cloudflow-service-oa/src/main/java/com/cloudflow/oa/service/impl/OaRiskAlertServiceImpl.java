package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.dto.OaRiskAssignDTO;
import com.cloudflow.oa.domain.dto.OaRiskStatsDTO;
import com.cloudflow.oa.domain.dto.OaRiskStatusDTO;
import com.cloudflow.oa.mapper.OaRiskAlertMapper;
import com.cloudflow.oa.service.IOaRiskAlertService;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.oa.util.OaContractConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * OA 风险提醒服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaRiskAlertServiceImpl extends ServiceImpl<OaRiskAlertMapper, OaRiskAlert>
        implements IOaRiskAlertService {

    private final IOaTraceEventService traceEventService;

    @Override
    public PageResult<OaRiskAlert> queryPage(OaRiskAlert query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaRiskAlert> wrapper = buildQueryWrapper(query);
        DataScopeHelperAdapter.applyByOwner(wrapper);
        wrapper.orderByDesc(OaRiskAlert::getDetectedTime).orderByDesc(OaRiskAlert::getId);
        Page<OaRiskAlert> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<OaRiskAlert> listByBusiness(String businessType, Long businessId) {
        return list(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getBusinessType, businessType)
                .eq(OaRiskAlert::getBusinessId, businessId)
                .orderByDesc(OaRiskAlert::getDetectedTime)
                .orderByDesc(OaRiskAlert::getId));
    }

    @Override
    public OaRiskStatsDTO getStats() {
        OaRiskStatsDTO stats = new OaRiskStatsDTO();
        stats.setOpenCount(countByStatus(OaContractConstants.RISK_STATUS_OPEN));
        stats.setHandlingCount(countByStatus(OaContractConstants.RISK_STATUS_HANDLING));
        stats.setClosedCount(countByStatus(OaContractConstants.RISK_STATUS_CLOSED));
        stats.setIgnoredCount(countByStatus(OaContractConstants.RISK_STATUS_IGNORED));
        stats.setHighRiskCount(countByLevel(OaContractConstants.RISK_LEVEL_HIGH) + countByLevel(OaContractConstants.RISK_LEVEL_CRITICAL));
        stats.setManualCount(countBySource(OaContractConstants.RISK_SOURCE_MANUAL));
        stats.setRuleCount(countBySource(OaContractConstants.RISK_SOURCE_RULE));
        stats.setContractUnsealedCount(countOpenByCode("CONTRACT_APPROVED_UNSEALED"));
        stats.setOverdueReturnCount(countOpenByCode("SEAL_RETURN_OVERDUE"));
        stats.setUnarchivedCount(countOpenByCode("CONTRACT_SEALED_UNARCHIVED"));
        return stats;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createManualRisk(OaRiskAlert risk) {
        normalizeRisk(risk);
        risk.setRiskSource(OaContractConstants.RISK_SOURCE_MANUAL);
        risk.setRiskStatus(StringUtils.hasText(risk.getRiskStatus()) ? risk.getRiskStatus() : OaContractConstants.RISK_STATUS_OPEN);
        boolean saved = save(risk);
        traceRisk(risk, "RISK_MANUAL_CREATED", "人工标记风险", risk.getRiskName());
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createRuleRiskIfAbsent(OaRiskAlert risk) {
        normalizeRisk(risk);
        risk.setRiskSource(OaContractConstants.RISK_SOURCE_RULE);
        risk.setRiskStatus(OaContractConstants.RISK_STATUS_OPEN);
        Long existing = count(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getBusinessType, risk.getBusinessType())
                .eq(OaRiskAlert::getBusinessId, risk.getBusinessId())
                .eq(OaRiskAlert::getRiskCode, risk.getRiskCode())
                .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING));
        if (existing != null && existing > 0) {
            return false;
        }
        boolean saved = save(risk);
        traceRisk(risk, "RISK_RULE_CREATED", "规则生成风险", risk.getRiskName());
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateRiskStatus(Long id, OaRiskStatusDTO dto) {
        OaRiskAlert risk = requireRisk(id);
        if (dto == null || !StringUtils.hasText(dto.getRiskStatus())) {
            throw new IllegalArgumentException("风险状态不能为空");
        }
        String status = dto.getRiskStatus();
        if (!OaContractConstants.RISK_STATUS_OPEN.equals(status)
                && !OaContractConstants.RISK_STATUS_HANDLING.equals(status)
                && !OaContractConstants.RISK_STATUS_CLOSED.equals(status)
                && !OaContractConstants.RISK_STATUS_IGNORED.equals(status)) {
            throw new IllegalArgumentException("不支持的风险状态: " + status);
        }
        LocalDateTime now = LocalDateTime.now();
        risk.setRiskStatus(status);
        risk.setHandlerId(UserContext.getUserId());
        risk.setHandlerName(resolveUserName());
        risk.setHandleRemark(dto.getHandleRemark());
        if (OaContractConstants.RISK_STATUS_CLOSED.equals(status) || OaContractConstants.RISK_STATUS_IGNORED.equals(status)) {
            risk.setHandledTime(now);
        }
        risk.setUpdateBy(resolveUserName());
        risk.setUpdateTime(now);
        boolean updated = updateById(risk);
        traceRisk(risk, "RISK_STATUS_CHANGED", "风险状态更新", status + (StringUtils.hasText(dto.getHandleRemark()) ? "：" + dto.getHandleRemark() : ""));
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean assignRisk(Long id, OaRiskAssignDTO dto) {
        OaRiskAlert risk = requireRisk(id);
        if (dto == null || dto.getOwnerId() == null) {
            throw new IllegalArgumentException("风险负责人不能为空");
        }
        risk.setOwnerId(dto.getOwnerId());
        risk.setOwnerName(dto.getOwnerName());
        risk.setUpdateBy(resolveUserName());
        risk.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(risk);
        traceRisk(risk, "RISK_ASSIGNED", "风险指派", "指派给：" + (StringUtils.hasText(dto.getOwnerName()) ? dto.getOwnerName() : dto.getOwnerId()));
        return updated;
    }

    private LambdaQueryWrapper<OaRiskAlert> buildQueryWrapper(OaRiskAlert query) {
        LambdaQueryWrapper<OaRiskAlert> wrapper = new LambdaQueryWrapper<>();
        if (query == null) {
            return wrapper;
        }
        wrapper.eq(StringUtils.hasText(query.getBusinessType()), OaRiskAlert::getBusinessType, query.getBusinessType())
                .eq(query.getBusinessId() != null, OaRiskAlert::getBusinessId, query.getBusinessId())
                .eq(StringUtils.hasText(query.getRiskStatus()), OaRiskAlert::getRiskStatus, query.getRiskStatus())
                .eq(StringUtils.hasText(query.getRiskLevel()), OaRiskAlert::getRiskLevel, query.getRiskLevel())
                .eq(StringUtils.hasText(query.getRiskSource()), OaRiskAlert::getRiskSource, query.getRiskSource())
                .like(StringUtils.hasText(query.getRiskName()), OaRiskAlert::getRiskName, query.getRiskName())
                .like(StringUtils.hasText(query.getRiskCode()), OaRiskAlert::getRiskCode, query.getRiskCode());
        return wrapper;
    }

    private void normalizeRisk(OaRiskAlert risk) {
        if (risk == null) {
            throw new IllegalArgumentException("风险记录不能为空");
        }
        if (!StringUtils.hasText(risk.getBusinessType())) {
            risk.setBusinessType(OaContractConstants.BUSINESS_TYPE_CONTRACT);
        }
        if (risk.getBusinessId() == null) {
            throw new IllegalArgumentException("风险关联业务ID不能为空");
        }
        if (!StringUtils.hasText(risk.getRiskCode())) {
            risk.setRiskCode(OaContractConstants.RISK_SOURCE_MANUAL.equals(risk.getRiskSource()) ? "MANUAL_RISK" : "RULE_RISK");
        }
        if (!StringUtils.hasText(risk.getRiskName())) {
            throw new IllegalArgumentException("风险名称不能为空");
        }
        if (!StringUtils.hasText(risk.getRiskLevel())) {
            risk.setRiskLevel(OaContractConstants.RISK_LEVEL_MEDIUM);
        }
        LocalDateTime now = LocalDateTime.now();
        if (risk.getTenantId() == null) {
            risk.setTenantId(resolveTenantId());
        }
        if (risk.getOwnerId() == null) {
            risk.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(risk.getOwnerName())) {
            risk.setOwnerName(resolveUserName());
        }
        if (risk.getDetectedTime() == null) {
            risk.setDetectedTime(now);
        }
        risk.setCreateBy(resolveUserName());
        risk.setCreateTime(now);
        risk.setUpdateBy(resolveUserName());
        risk.setUpdateTime(now);
    }

    private OaRiskAlert requireRisk(Long id) {
        OaRiskAlert risk = getById(id);
        if (risk == null) {
            throw new IllegalArgumentException("风险记录不存在");
        }
        return risk;
    }

    private void traceRisk(OaRiskAlert risk, String eventType, String title, String content) {
        traceEventService.record(risk.getTenantId(), risk.getBusinessType(), risk.getBusinessId(),
                OaContractConstants.BUSINESS_TYPE_RISK, risk.getId(), eventType, title, content,
                UserContext.getUserId(), resolveUserName(), null);
    }

    private long countByStatus(String status) {
        Long count = count(new LambdaQueryWrapper<OaRiskAlert>().eq(OaRiskAlert::getRiskStatus, status));
        return count == null ? 0 : count;
    }

    private long countByLevel(String level) {
        Long count = count(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getRiskLevel, level)
                .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING));
        return count == null ? 0 : count;
    }

    private long countBySource(String source) {
        Long count = count(new LambdaQueryWrapper<OaRiskAlert>().eq(OaRiskAlert::getRiskSource, source));
        return count == null ? 0 : count;
    }

    private long countOpenByCode(String code) {
        Long count = count(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getRiskCode, code)
                .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING));
        return count == null ? 0 : count;
    }

    private String resolveUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }

    private static final class DataScopeHelperAdapter {
        private DataScopeHelperAdapter() {
        }

        private static void applyByOwner(LambdaQueryWrapper<OaRiskAlert> wrapper) {
            Integer dsType = UserContext.getDsType();
            if (dsType == null || dsType == 0) {
                return;
            }
            Long userId = UserContext.getUserId();
            wrapper.eq(OaRiskAlert::getOwnerId, userId == null ? -1L : userId);
        }
    }
}
