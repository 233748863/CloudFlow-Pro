package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.dto.InternalWorkflowStartDTO;
import com.cloudflow.crm.event.CrmRenewalSubmittedEvent;
import com.cloudflow.crm.mapper.CrmRenewalMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.ICrmRenewalService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import com.cloudflow.common.audit.annotation.Audit;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrmRenewalServiceImpl extends CrmServiceSupport<CrmRenewalMapper, CrmRenewal>
        implements ICrmRenewalService {

    private static final String SCOPE_DEPT_COLUMN = "scope_dept_id";
    private static final String SCOPE_OWNER_COLUMN = "scope_owner_id";

    private final RemoteWorkflowService remoteWorkflowService;
    private final ICrmCustomerService crmCustomerService;
    private final RemoteOaService remoteOaService;
    private final com.cloudflow.common.redis.core.SysDictHelper sysDictHelper;
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Override
    public PageResult<CrmRenewal> queryPage(CrmRenewal query, PageQuery pageQuery) {
        PageResult<CrmRenewal> result = PageResult.build(baseMapper.selectPageByDataScope(
                pageQuery.build(),
                query,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN)));
        if (result.getRows() != null) {
            result.getRows().forEach(r -> CrmRenewalRiskEvaluator.enrich(r, sysDictHelper));
        }
        return result;
    }

    @Override
    public CrmRenewal getRenewalInfo(Long renewalId) {
        CrmRenewal renewal = getAccessibleRenewal(renewalId);
        CrmRenewalRiskEvaluator.enrich(renewal, sysDictHelper);
        return renewal;
    }

    @Override
    public CrmRenewal getAccessibleRenewal(Long renewalId) {
        if (renewalId == null) {
            throw new IllegalArgumentException("续约ID不能为空");
        }
        CrmRenewal renewal = baseMapper.selectByIdWithDataScope(
                renewalId,
                DataScopeUtils.listScope(SCOPE_DEPT_COLUMN, SCOPE_OWNER_COLUMN));
        if (renewal == null) {
            throw new IllegalArgumentException("续约记录不存在");
        }
        return renewal;
    }

    @Override
    public boolean createRenewal(CrmRenewal renewal) {
        fillBindingSnapshot(renewal);
        validate(renewal);
        if (!StringUtils.hasText(renewal.getRenewalNo())) {
            renewal.setRenewalNo(Localize.nextNo(CrmConstants.NoPrefix.RENEWAL));
        }
        if (renewal.getOwnerId() == null) {
            renewal.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(renewal.getOwnerName())) {
            renewal.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(renewal, currentTenantId(), currentUserName(), now());
        boolean saved = save(renewal);
        if (saved) {
            crmCustomerService.refreshHealth(renewal.getCustomerId());
        }
        return saved;
    }

    @Override
    @Audit(name = "更新续约")
    public boolean updateRenewal(CrmRenewal renewal) {
        if (renewal == null || renewal.getRenewalId() == null) {
            throw new IllegalArgumentException("续约ID不能为空");
        }
        fillBindingSnapshot(renewal);
        validate(renewal);
        CrmRenewal persisted = getAccessibleRenewal(renewal.getRenewalId());
        renewal.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(renewal.getRenewalNo())) {
            renewal.setRenewalNo(persisted.getRenewalNo());
        }
        if (renewal.getOwnerId() == null) {
            renewal.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(renewal.getOwnerName())) {
            renewal.setOwnerName(persisted.getOwnerName());
        }
        renewal.setInstanceId(persisted.getInstanceId());
        renewal.setUpdateBy(currentUserName());
        renewal.setUpdateTime(now());
        boolean updated = updateById(renewal);
        if (updated) {
            crmCustomerService.refreshHealth(renewal.getCustomerId());
        }
        return updated;
    }

    @Transactional(rollbackFor = Exception.class)
    @Override
    public boolean submitRenewal(Long renewalId) {
        CrmRenewal renewal = getAccessibleRenewal(renewalId);
        if (!CrmConstants.RenewalStatus.PLANNED.equals(renewal.getStatus())
                && !CrmConstants.RenewalStatus.NEGOTIATING.equals(renewal.getStatus())) {
            throw new IllegalArgumentException("只有计划中或洽谈中续约可以提交审批");
        }

        renewal.setStatus(CrmConstants.RenewalStatus.PENDING);
        renewal.setUpdateBy(currentUserName());
        renewal.setUpdateTime(now());

        boolean updated = updateById(renewal);
        if (!updated) {
            return false;
        }

        CrmRenewalSubmittedEvent event = new CrmRenewalSubmittedEvent();
        event.setRenewalId(renewalId);
        event.setSubmittedAt(now());
        publishRenewalSubmittedEvent(renewal, event);
        startRenewalWorkflowAfterCommit(renewalId);
        crmCustomerService.refreshHealth(renewal.getCustomerId());
        return true;
    }

    public void startRenewalWorkflow(CrmRenewal renewal) {
        CrmRenewal current = baseMapper.selectById(renewal.getRenewalId());
        if (current == null) {
            throw new IllegalStateException("CRM续约不存在: " + renewal.getRenewalId());
        }
        if (StringUtils.hasText(current.getInstanceId())) {
            log.info("CRM 续约流程已存在，跳过启动: renewalId={}, instanceId={}",
                    current.getRenewalId(), current.getInstanceId());
            return;
        }
        InternalWorkflowStartDTO dto = new InternalWorkflowStartDTO();
        dto.setProcessDefKey("customer_renewal_review");
        dto.setBusinessKey("CRM_RENEWAL:" + current.getRenewalId());
        dto.setStartUserId(current.getOwnerId());
        dto.setStartUserName(current.getOwnerName());
        Map<String, Object> variables = new HashMap<>();
        variables.put("renewalId", current.getRenewalId());
        variables.put("renewalNo", current.getRenewalNo());
        variables.put("renewalName", current.getRenewalName());
        variables.put("customerId", current.getCustomerId());
        variables.put("customerName", current.getCustomerName());
        variables.put("renewalAmount", current.getRenewalAmount());
        variables.put("currentExpireDate", current.getCurrentExpireDate());
        WorkflowCallbackConstants.applyCallbackMetadata(
                variables,
                CrmBusinessTypes.CRM_RENEWAL,
                current.getRenewalId(),
                current.getRenewalNo(),
                "workflow:stream:approval-callback:crm"
        );
        dto.setVariables(variables);

        R<?> result = remoteWorkflowService.startProcessInternal(dto);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new IllegalStateException("启动 CRM 续约流程失败: renewalId=" + current.getRenewalId()
                    + ", msg=" + (result == null ? "null" : result.getMsg()));
        }
        String instanceId = extractInstanceId(result.getData());
        if (!StringUtils.hasText(instanceId)) {
            throw new IllegalStateException("启动 CRM 续约流程未返回实例ID: renewalId=" + current.getRenewalId());
        }
        LambdaUpdateWrapper<CrmRenewal> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(CrmRenewal::getRenewalId, current.getRenewalId())
                .and(w -> w.isNull(CrmRenewal::getInstanceId).or().eq(CrmRenewal::getInstanceId, ""))
                .set(CrmRenewal::getInstanceId, instanceId)
                .set(CrmRenewal::getUpdateBy, StringUtils.hasText(current.getOwnerName()) ? current.getOwnerName() : "event-consumer")
                .set(CrmRenewal::getUpdateTime, now());
        update(null, wrapper);
    }

    private void startRenewalWorkflowAfterCommit(Long renewalId) {
        Runnable task = () -> {
            try {
                CrmRenewal renewal = baseMapper.selectById(renewalId);
                if (renewal != null) {
                    startRenewalWorkflow(renewal);
                }
            } catch (Exception ex) {
                log.warn("提交后即时启动 CRM 续约流程失败，等待 Outbox 重试: renewalId={}", renewalId, ex);
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
        } else {
            task.run();
        }
    }

    private void validate(CrmRenewal renewal) {
        if (renewal == null) {
            throw new IllegalArgumentException("续约不能为空");
        }
        if (renewal.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (!StringUtils.hasText(renewal.getRenewalName())) {
            throw new IllegalArgumentException("续约名称不能为空");
        }
        if (renewal.getRenewalAmount() == null) {
            renewal.setRenewalAmount(BigDecimal.ZERO);
        }
        if (!StringUtils.hasText(renewal.getStatus())) {
            renewal.setStatus(CrmConstants.RenewalStatus.PLANNED);
        }
    }

    private void fillBindingSnapshot(CrmRenewal renewal) {
        if (renewal == null) {
            return;
        }
        if (renewal.getContractId() != null) {
            try {
                R<RemoteOaService.ContractInfo> result = remoteOaService.getContract(renewal.getContractId());
                if (result != null && result.isSuccess() && result.getData() != null) {
                    RemoteOaService.ContractInfo contract = result.getData();
                    if (StringUtils.hasText(contract.getContractNo())) {
                        renewal.setContractNo(contract.getContractNo());
                    }
                    if (contract.getCustomerId() != null) {
                        renewal.setCustomerId(contract.getCustomerId());
                    }
                    if (StringUtils.hasText(contract.getCustomerName())) {
                        renewal.setCustomerName(contract.getCustomerName());
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (renewal.getCustomerId() != null && !StringUtils.hasText(renewal.getCustomerName())) {
            CrmCustomer customer = crmCustomerService.getAccessibleCustomer(renewal.getCustomerId());
            renewal.setCustomerName(customer.getCustomerName());
        }
    }

    private String extractInstanceId(Object data) {
        if (data instanceof Map<?, ?> dataMap) {
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data != null ? String.valueOf(data) : null;
    }

    private void publishRenewalSubmittedEvent(CrmRenewal renewal, CrmRenewalSubmittedEvent event) {
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("CRM_RENEWAL_SUBMITTED")
                    .sourceModule("cloudflow-crm")
                    .sourceId(renewal.getRenewalId())
                    .tenantId(renewal.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new IllegalStateException("CRM续约提交流程事件发布失败", e);
        }
    }
}
