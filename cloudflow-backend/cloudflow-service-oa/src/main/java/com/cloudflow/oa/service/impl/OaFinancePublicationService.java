package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PortalFinancePublicationVO;
import com.cloudflow.common.core.domain.PortalFinanceState;
import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.PortalFinanceRules;
import com.cloudflow.common.security.service.PortalFinanceActor;
import com.cloudflow.oa.mapper.OaFinancePublicationMapper;
import com.cloudflow.oa.service.remote.RemoteFinanceFileService;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@RequiredArgsConstructor
public class OaFinancePublicationService {
    private final PortalFinanceActor actor;
    private final OaFinancePublicationMapper records;
    private final OaFinancePublicationWriter writer;
    private final RemoteFinanceFileService files;

    @Transactional(readOnly = true)
    public PortalFinancePublicationVO preview(Long id) {
        return view(require(id, false));
    }

    @Transactional(rollbackFor = Exception.class)
    public PortalFinancePublicationVO confirm(Long id, JsonNode body) {
        PortalFinanceRules.Change change = PortalFinanceRules.change(body);
        PortalFinanceState before = require(id, true);
        if (change.publish()) {
            if (!"ACTIVE".equals(before.getCustomerStatus())) throw new ServiceException("客户已停用，无法确认公开", 409);
            List<PortalFinanceAttachment> selected = records.availableFiles(UserContext.getTenantId(), id, UserContext.getUserName(), change.fileIds(), true);
            if (selected.size() != change.fileIds().size()) throw new ServiceException("只能选择本人在本单据下上传的有效票据", 400);
        }
        if (!PortalFinanceRules.unchanged(before, change)) {
            PortalFinanceRules.version(before, change);
            writer.persist(before, change);
        }
        return view(require(id, false));
    }

    public PortalFinanceAttachment upload(Long id, MultipartFile file) {
        uploadScope(id);
        R<PortalFinanceAttachment> response;
        try {
            response = files.upload("INVOICE", id, file);
        } catch (RuntimeException failure) {
            throw new ServiceException("票据上传结果未确认，请核对已上传文件后重试", 503);
        }
        if (response == null || !response.isSuccess() || response.getData() == null)
            throw new ServiceException("票据上传结果未确认，请核对已上传文件后重试", 503);
        return response.getData();
    }

    public Long uploadScope(Long id) {
        PortalFinanceState state = require(id, false);
        if (!"ACTIVE".equals(state.getCustomerStatus())) throw new ServiceException("客户已停用，无法上传公开票据", 409);
        return state.getId();
    }

    private PortalFinancePublicationVO view(PortalFinanceState state) {
        return PortalFinanceRules.preview(state, records.availableFiles(UserContext.getTenantId(), state.getId(),
                UserContext.getUserName(), null, false));
    }

    private PortalFinanceState require(Long id, boolean locked) {
        actor.require();
        if (id == null || id <= 0) throw new ServiceException("单据不存在或无权访问", 404);
        PortalFinanceState state = records.state(UserContext.getTenantId(), id, locked);
        if (state == null) throw new ServiceException("单据不存在或无权访问", 404);
        return state;
    }
}
