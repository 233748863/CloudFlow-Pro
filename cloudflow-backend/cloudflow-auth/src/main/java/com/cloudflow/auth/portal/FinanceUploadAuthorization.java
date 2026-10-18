package com.cloudflow.auth.portal;

import com.cloudflow.auth.service.remote.RemoteCrmFinanceService;
import com.cloudflow.auth.service.remote.RemoteOaFinanceService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.PortalFinanceRules;
import com.cloudflow.common.security.service.PortalFinanceActor;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class FinanceUploadAuthorization {
    private final PortalFinanceActor actor;
    private final RemoteCrmFinanceService crm;
    private final RemoteOaFinanceService oa;

    public void require(String kind, Long id) {
        actor.require();
        PortalFinanceRules.kind(kind);
        if (id == null || id <= 0) throw new ServiceException("财务单据无效", 400);
        R<Long> result = "RECEIVABLE".equals(kind) ? crm.uploadScope(id) : oa.uploadScope(id);
        if (result == null || !result.isSuccess() || !Objects.equals(id, result.getData()))
            throw new ServiceException("财务单据不存在或无权上传票据", 403);
    }
}
