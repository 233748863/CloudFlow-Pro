package com.cloudflow.oa.service.impl;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.mapper.OaConsumableRequestMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestItemMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class ConsumableRequestAccess {
    private final OaConsumableRequestMapper requests;
    private final OaConsumableRequestItemMapper items;

    public OaConsumableRequest get(Long id) {
        return OaRecordSupport.active(requests.selectOne(new LambdaQueryWrapper<OaConsumableRequest>()
                .eq(OaConsumableRequest::getTenantId, OaRecordSupport.tenantId()).eq(OaConsumableRequest::getRequestId, id)
                .eq(OaConsumableRequest::getDeleted, 0)));
    }

    public OaConsumableRequest lock(Long id) { return OaRecordSupport.active(requests.lock(OaRecordSupport.tenantId(), id)); }

    public OaConsumableRequest own(Long id, boolean locked) {
        OaConsumableRequest request = locked ? lock(id) : get(id);
        assertOwner(request);
        return request;
    }

    public void assertOwner(OaConsumableRequest request) {
        if (!Objects.equals(request.getApplicantId(), ConsumableOperationSupport.userId())) throw new IllegalArgumentException("记录不存在或无权访问");
    }

    public OaConsumableRequest visible(Long id) {
        OaConsumableRequest request = get(id);
        if (Objects.equals(request.getApplicantId(), ConsumableOperationSupport.userId())) return request;
        if (!StpUtil.hasPermission("oa:consumable-request:dept-list")) throw new IllegalArgumentException("记录不存在或无权访问");
        return OaRecordSupport.active(requests.visible(OaRecordSupport.tenantId(), id, null, DataScopeUtils.listScope("dept_id", "applicant_id")));
    }

    public OaConsumableRequest dispatch(Long id, boolean locked) {
        OaConsumableRequest request = locked ? lock(id) : get(id);
        if (!Set.of("APPROVED", "ISSUED").contains(request.getStatus())) throw new IllegalArgumentException("申请尚未进入发料阶段");
        return request;
    }

    public void save(OaConsumableRequest request) {
        OaRecordSupport.touch(request);
        OaRecordSupport.saved(requests.saveState(request));
        request.setVersion(request.getVersion() + 1);
    }

    public void saveItem(OaConsumableRequestItem item) {
        OaRecordSupport.touch(item);
        OaRecordSupport.saved(items.saveState(item));
        item.setVersion(item.getVersion() + 1);
    }

    public static void unissued(List<OaConsumableRequestItem> items) {
        if (items.stream().anyMatch(item -> item.getIssuedQuantity() != 0 || item.getReturnedQuantity() != 0)) {
            throw new IllegalArgumentException("已经发料的申请不能编辑或取消");
        }
    }

    public static ConsumableResults.RequestResult result(OaConsumableRequest request, boolean replayed) {
        ConsumableResults.RequestResult result = new ConsumableResults.RequestResult();
        result.setRequestId(request.getRequestId().toString());
        result.setRequestNo(request.getRequestNo());
        result.setStatus(request.getStatus());
        result.setVersion(request.getVersion());
        result.setReplayed(replayed);
        result.setApprovalPending("APPROVING".equals(request.getStatus()) && request.getInstanceId() != null && request.getInstanceId().startsWith("F:"));
        result.setInstanceId(request.getInstanceId() == null || request.getInstanceId().startsWith("F:") ? null : request.getInstanceId());
        return result;
    }
}
