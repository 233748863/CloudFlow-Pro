package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.*;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.common.security.portal.PortalTokens;
import com.cloudflow.crm.mapper.CrmFinancePublicationMapper;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PortalFinanceService {
    private final PortalTokens tokens;
    private final CrmFinancePublicationMapper records;

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResult<PortalFinanceVO> list(String token, String keyword, int pageNum, int pageSize) {
        PortalIdentity identity = identity(token);
        if (pageNum < 1 || pageNum > 1_000_000 || pageSize < 1 || pageSize > 100
                || keyword != null && keyword.length() > 100) throw new ServiceException("财务记录查询条件无效", 400);
        return PageResult.build(records.opened(new Page<>(pageNum, pageSize), identity, keyword == null ? null : keyword.trim()));
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PortalFinanceVO detail(String token, Long id) {
        PortalIdentity identity = identity(token);
        PortalFinanceState state = state(identity, id);
        PortalFinanceVO result = state.getRecord();
        result.setAttachments(records.publicFiles(identity, id));
        return result;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PortalFinanceFile file(String token, Long id, Long fileId) {
        PortalIdentity identity = identity(token);
        PortalFinanceState state = state(identity, id);
        if (fileId == null || fileId <= 0) throw unavailable();
        PortalFinanceAttachment attachment = records.publicFiles(identity, id).stream()
                .filter(file -> Objects.equals(file.getFileId(), fileId)).findFirst().orElseThrow(PortalFinanceService::unavailable);
        return new PortalFinanceFile("RECEIVABLE", id, state.getPublicVersion(), attachment);
    }

    private PortalFinanceState state(PortalIdentity identity, Long id) {
        if (id == null || id <= 0) throw unavailable();
        PortalFinanceState state = records.portalDetail(identity, id);
        if (state == null) throw unavailable();
        return state;
    }

    private PortalIdentity identity(String token) {
        PortalIdentity identity = tokens.verify(token);
        if (identity == null || !Objects.equals(identity.tenantId(), UserContext.getTenantId()) || !records.activeIdentity(identity))
            throw new ServiceException("门户登录状态已失效，请重新登录", 401);
        return identity;
    }

    private static ServiceException unavailable() { return new ServiceException("财务记录不存在或尚未向客户公开", 404); }
}
