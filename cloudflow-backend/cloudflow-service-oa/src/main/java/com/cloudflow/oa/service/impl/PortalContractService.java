package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.PortalContractVO;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.oa.mapper.PortalContractMapper;
import java.time.LocalDateTime;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PortalContractService {
    private final PortalTokens tokens;
    private final PortalContractMapper contracts;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResult<PortalContractVO> list(String token, String keyword, int pageNum, int pageSize) {
        PortalIdentity identity = requireIdentity(token);
        if (pageNum < 1 || pageNum > 1_000_000 || pageSize < 1 || pageSize > 100
                || keyword != null && keyword.length() > 100) {
            throw new ServiceException("页码须为1至1000000，每页1至100条，搜索词最多100字符", 400);
        }
        return PageResult.build(contracts.opened(new Page<>(pageNum, pageSize), identity,
                keyword == null ? null : keyword.trim(), LocalDateTime.now()));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PortalContractVO detail(String token, Long contractId) {
        PortalIdentity identity = requireIdentity(token);
        if (contractId == null || contractId <= 0) throw unavailable();
        LocalDateTime now = LocalDateTime.now();
        PortalContractVO result = contracts.detail(identity, contractId, now);
        if (result == null) throw unavailable();
        result.setTerms(contracts.terms(identity, contractId, now));
        result.setMilestones(contracts.milestones(identity, contractId, now));
        result.setPaymentSchedules(contracts.payments(identity, contractId, now));
        return result;
    }

    private PortalIdentity requireIdentity(String token) {
        PortalIdentity identity = tokens.verify(token);
        if (identity == null || !Objects.equals(identity.tenantId(), UserContext.getTenantId()) || !contracts.activeIdentity(identity)) {
            throw new ServiceException("门户登录状态已失效，请重新登录", 401);
        }
        return identity;
    }

    private static ServiceException unavailable() { return new ServiceException("合同不存在或尚未向客户开放", 404); }
}
