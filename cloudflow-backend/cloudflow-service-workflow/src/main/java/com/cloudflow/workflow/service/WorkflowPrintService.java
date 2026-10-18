package com.cloudflow.workflow.service;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.printing.PrintData;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 打印只交付当前用户在真实关联流程中可读的业务字段。 */
@Service
@RequiredArgsConstructor
public class WorkflowPrintService {
    private final WorkflowFormAccessService access;
    private final WfProcessInstanceMapper instances;

    public Map<String, Object> filter(PrintData data) {
        if (data == null || UserContext.getUserId() == null || UserContext.getTenantId() == null
                || !Objects.equals(UserContext.getTenantId(), data.tenantId()) || data.values() == null
                || data.instanceId() == null || data.instanceId().isBlank()
                || data.bizId() == null || !data.bizId().matches("[1-9][0-9]{0,18}")) throw denied();
        if (data.bizType() == null || !data.bizType().matches("[A-Z][A-Z0-9_]{0,49}")
                || data.businessKey() == null || !data.businessKey().matches("[A-Za-z][A-Za-z0-9_]*:" + data.bizId())) throw denied();
        // 提供器负责声明业务键；读取真实流程后再次核对键、租户和当前用户字段权限。
        // 首批已约定的键仍严格匹配，新增业务无需修改此框架。
        String expectedKey = switch (data.bizType()) {
            case "CERTIFICATE" -> "HR_CERTIFICATE_REQUEST:" + data.bizId();
            case "EXPENSE_CLAIM" -> "expense_claim:" + data.bizId();
            case "PURCHASE_ORDER" -> "purchase_request:" + data.bizId();
            default -> data.businessKey();
        };
        if (!expectedKey.equals(data.businessKey())) throw denied();
        WorkflowFormAccessService.ReadContext context = access.instance(data.instanceId(), null);
        WfProcessInstance instance = instances.selectById(data.instanceId());
        if (instance == null || !Objects.equals(data.tenantId(), instance.getTenantId())
                || !expectedKey.equals(instance.getBusinessKey())) throw denied();
        Map<String, Object> source = new LinkedHashMap<>(context.rawValues());
        source.putAll(data.values());
        Map<String, Object> visible = new LinkedHashMap<>(access.getVisibleVariables(context, source));
        visible.keySet().retainAll(data.values().keySet());
        // 已拼接证明正文无法追溯隐藏字段，绑定表单时禁止回填派生正文。
        if (context.form() != null && "CERTIFICATE".equals(data.bizType())) visible.remove("body");
        return visible;
    }

    private ServiceException denied() { return new ServiceException("打印流程与业务记录不匹配或无权访问", 403); }
}
