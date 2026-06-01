package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaContractAmountThreshold;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.mapper.OaContractMapper;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.service.IOaContractService;
import com.cloudflow.oa.service.IOaContractAmountThresholdService;
import com.cloudflow.oa.service.IOaRiskAlertService;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.oa.util.OaContractConstants;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.lock.DistributedLock;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.event.ContractCreatedEvent;
import com.cloudflow.oa.event.ContractSubmittedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OA 合同台账服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaContractServiceImpl extends ServiceImpl<OaContractMapper, OaContract>
        implements IOaContractService {

    private final OaSealApplicationMapper sealApplicationMapper;
    private final RemoteWorkflowService remoteWorkflowService;
    private final OaWorkflowFailureHelper workflowFailureHelper;
    private final IOaTraceEventService oaTraceEventService;
    private final IOaRiskAlertService oaRiskAlertService;
    private final IOaContractAmountThresholdService oaContractAmountThresholdService;
    private final OutboxPublisher outboxPublisher;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public PageResult<OaContract> queryPage(OaContract query, PageQuery pageQuery) {
        Page<OaContract> page = baseMapper.selectPageByDataScope(
                pageQuery.build(), query, DataScopeUtils.listScope("dept_id", "owner_id"));
        return PageResult.build(page);
    }

    @Override
    public OaContract getContractInfo(Long id) {
        return requireContract(id);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createContract(OaContract contract) {
        normalizeAndValidate(contract);
        LocalDateTime now = LocalDateTime.now();
        contract.setTenantId(resolveTenantId());
        contract.setContractNo(StringUtils.hasText(contract.getContractNo()) ? contract.getContractNo() : generateContractNo());
        contract.setOwnerId(contract.getOwnerId() == null ? UserContext.getUserId() : contract.getOwnerId());
        contract.setOwnerName(StringUtils.hasText(contract.getOwnerName()) ? contract.getOwnerName() : resolveUserName());
        contract.setDeptId(contract.getDeptId() == null ? UserContext.getDeptId() : contract.getDeptId());
        contract.setDeptName(StringUtils.hasText(contract.getDeptName()) ? contract.getDeptName() : UserContext.getDeptName());
        contract.setStatus(OaContractConstants.CONTRACT_STATUS_DRAFT);
        contract.setRiskLevel(StringUtils.hasText(contract.getRiskLevel()) ? contract.getRiskLevel() : OaContractConstants.RISK_LEVEL_LOW);
        contract.setDeleted(0);
        contract.setCreateBy(resolveUserName());
        contract.setCreateTime(now);
        contract.setUpdateBy(resolveUserName());
        contract.setUpdateTime(now);
        boolean saved = save(contract);
        if (!saved || contract.getContractId() == null) {
            throw new IllegalArgumentException("合同创建失败");
        }
        oaTraceEventService.record(contract.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, contract.getContractId(),
                OaContractConstants.BUSINESS_TYPE_CONTRACT, contract.getContractId(), "CONTRACT_CREATED",
                "合同创建", contract.getContractNo() + " / " + contract.getContractName(),
                UserContext.getUserId(), resolveUserName(), null);

        // M1-7: 发布事件到 Outbox
        ContractCreatedEvent event = new ContractCreatedEvent();
        event.setContractId(contract.getContractId());
        event.setContractNo(contract.getContractNo());
        event.setContractName(contract.getContractName());
        event.setContractType(contract.getContractType());
        event.setCounterpartyName(contract.getCounterpartyName());
        event.setAmount(contract.getAmount());
        event.setCurrency(contract.getCurrency());
        event.setOwnerId(contract.getOwnerId());
        event.setOwnerName(contract.getOwnerName());
        event.setStartDate(contract.getStartDate());
        event.setEndDate(contract.getEndDate());
        event.setCreatedAt(LocalDateTime.now());

        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("CONTRACT_CREATED")
                    .sourceModule("cloudflow-oa")
                    .sourceId(contract.getContractId())
                    .payload(OBJECT_MAPPER.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("合同创建事件发布失败, contractId=" + contract.getContractId() + ", error=" + e.getMessage());
        }

        return contract.getContractId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新合同", diff = true, highRisk = true)
    public boolean updateContract(OaContract contract) {
        if (contract == null || contract.getContractId() == null) {
            throw new IllegalArgumentException("合同ID不能为空");
        }
        OaContract persisted = requireContract(contract.getContractId());
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(persisted, OaContract::getOwnerId, "合同");
        if (!OaContractConstants.CONTRACT_STATUS_DRAFT.equals(persisted.getStatus())
                && !OaContractConstants.CONTRACT_STATUS_REJECTED.equals(persisted.getStatus())
                && !OaContractConstants.CONTRACT_STATUS_APPROVED.equals(persisted.getStatus())
                && !OaContractConstants.CONTRACT_STATUS_ACTIVE.equals(persisted.getStatus())) {
            throw new IllegalArgumentException("当前合同状态不允许编辑");
        }
        normalizeAndValidate(contract);
        contract.setTenantId(persisted.getTenantId());
        contract.setContractNo(StringUtils.hasText(contract.getContractNo()) ? contract.getContractNo() : persisted.getContractNo());
        contract.setOwnerId(contract.getOwnerId() == null ? persisted.getOwnerId() : contract.getOwnerId());
        contract.setOwnerName(StringUtils.hasText(contract.getOwnerName()) ? contract.getOwnerName() : persisted.getOwnerName());
        contract.setDeptId(contract.getDeptId() == null ? persisted.getDeptId() : contract.getDeptId());
        contract.setDeptName(StringUtils.hasText(contract.getDeptName()) ? contract.getDeptName() : persisted.getDeptName());
        contract.setInstanceId(persisted.getInstanceId());
        contract.setSealApplicationId(persisted.getSealApplicationId());
        contract.setStatus(persisted.getStatus());
        contract.setDeleted(0);
        contract.setUpdateBy(resolveUserName());
        contract.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(contract);
        oaTraceEventService.record(persisted.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, contract.getContractId(),
                OaContractConstants.BUSINESS_TYPE_CONTRACT, contract.getContractId(), "CONTRACT_UPDATED",
                "合同更新", contract.getContractName(), UserContext.getUserId(), resolveUserName(), null);
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除合同", highRisk = true)
    public boolean removeContracts(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        for (Long id : ids) {
            OaContract contract = requireContract(id);
            if (!OaContractConstants.CONTRACT_STATUS_DRAFT.equals(contract.getStatus())
                    && !OaContractConstants.CONTRACT_STATUS_REJECTED.equals(contract.getStatus())
                    && !OaContractConstants.CONTRACT_STATUS_CANCELLED.equals(contract.getStatus())) {
                throw new IllegalArgumentException("只有草稿、已驳回或已取消合同可以删除");
            }
            OaContract update = new OaContract();
            update.setContractId(id);
            update.setDeleted(1);
            update.setUpdateBy(resolveUserName());
            update.setUpdateTime(LocalDateTime.now());
            updateById(update);
            oaTraceEventService.record(contract.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, id,
                    OaContractConstants.BUSINESS_TYPE_CONTRACT, id, "CONTRACT_DELETED",
                    "合同删除", contract.getContractNo(), UserContext.getUserId(), resolveUserName(), null);
        }
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'contract:' + #id + ':submit'")
    public boolean submitContract(Long id) {
        OaContract contract = requireContract(id);
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(contract, OaContract::getOwnerId, "合同");
        if (!OaContractConstants.CONTRACT_STATUS_DRAFT.equals(contract.getStatus())
                && !OaContractConstants.CONTRACT_STATUS_REJECTED.equals(contract.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回合同可以提交审批");
        }
        contract.setStatus(OaContractConstants.CONTRACT_STATUS_PENDING);
        contract.setUpdateBy(resolveUserName());
        contract.setUpdateTime(LocalDateTime.now());

        boolean updated = updateById(contract);
        if (updated) {
            OaTransactionHooks.afterCommit(() -> startContractWorkflow(contract));
        }
        oaTraceEventService.record(contract.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, id,
                OaContractConstants.BUSINESS_TYPE_APPROVAL, id, "CONTRACT_SUBMITTED",
                "合同提交审批", contract.getContractNo() + " 已进入审批",
                UserContext.getUserId(), resolveUserName(), null);

        // M1-7: 发布事件到 Outbox
        if (updated) {
            ContractSubmittedEvent event = new ContractSubmittedEvent();
            event.setContractId(contract.getContractId());
            event.setContractNo(contract.getContractNo());
            event.setContractName(contract.getContractName());
            event.setContractType(contract.getContractType());
            event.setAmount(contract.getAmount());
            event.setOwnerId(contract.getOwnerId());
            event.setOwnerName(contract.getOwnerName());
            event.setDeptName(contract.getDeptName());
            event.setSubmittedAt(LocalDateTime.now());

            try {
                BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                        .eventType("CONTRACT_SUBMITTED")
                        .sourceModule("cloudflow-oa")
                        .sourceId(contract.getContractId())
                        .payload(OBJECT_MAPPER.writeValueAsString(event))
                        .build();
                outboxPublisher.publish(envelope);
            } catch (Exception e) {
                log.warn("合同提交事件发布失败, contractId=" + contract.getContractId() + ", error=" + e.getMessage());
            }
        }

        return updated;
    }

    private void startContractWorkflow(OaContract contract) {
        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("biz_contract");
            req.setBusinessKey("CONTRACT:" + contract.getContractId());
            Map<String, Object> variables = buildWorkflowVariables(contract);
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.CONTRACT,
                    contract.getContractId(),
                    contract.getContractNo(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);
            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (StringUtils.hasText(instanceId)) {
                    OaContract update = new OaContract();
                    update.setContractId(contract.getContractId());
                    update.setInstanceId(instanceId);
                    update.setUpdateBy(resolveUserName());
                    update.setUpdateTime(LocalDateTime.now());
                    updateById(update);
                }
            } else {
                log.warn("合同 {} 工作流启动返回异常: {}", contract.getContractNo(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            log.error("合同 {} 启动工作流失败，但提交状态已更新", contract.getContractNo(), e);
            workflowFailureHelper.handleWorkflowStartFailure(
                    OaBusinessTypes.CONTRACT, contract.getContractId(), contract.getContractNo(),
                    contract.getOwnerName(), contract.getOwnerId(), e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "取消合同", highRisk = true)
    public boolean cancelContract(Long id) {
        OaContract contract = requireContract(id);
        if (!OaContractConstants.CONTRACT_STATUS_DRAFT.equals(contract.getStatus())
                && !OaContractConstants.CONTRACT_STATUS_PENDING.equals(contract.getStatus())) {
            throw new IllegalArgumentException("只有草稿或审批中的合同可以取消");
        }
        contract.setStatus(OaContractConstants.CONTRACT_STATUS_CANCELLED);
        contract.setUpdateBy(resolveUserName());
        contract.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(contract);
        oaTraceEventService.record(contract.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, id,
                OaContractConstants.BUSINESS_TYPE_CONTRACT, id, "CONTRACT_CANCELLED",
                "合同取消", contract.getContractNo(), UserContext.getUserId(), resolveUserName(), null);
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean linkSeal(Long contractId, Long sealApplicationId) {
        OaContract contract = requireContract(contractId);
        OaSealApplication application = sealApplicationMapper.selectById(sealApplicationId);
        if (application == null || !Integer.valueOf(0).equals(application.getDeleted())) {
            throw new IllegalArgumentException("用印申请不存在");
        }
        contract.setSealApplicationId(sealApplicationId);
        if (OaContractConstants.CONTRACT_STATUS_APPROVED.equals(contract.getStatus())
                || OaContractConstants.CONTRACT_STATUS_ACTIVE.equals(contract.getStatus())) {
            contract.setStatus(OaContractConstants.CONTRACT_STATUS_SEALING);
        }
        contract.setUpdateBy(resolveUserName());
        contract.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(contract);
        OaSealApplication update = new OaSealApplication();
        update.setId(sealApplicationId);
        update.setContractId(contractId);
        update.setContractNo(contract.getContractNo());
        update.setUpdateBy(resolveUserName());
        update.setUpdateTime(LocalDateTime.now());
        sealApplicationMapper.updateById(update);
        oaTraceEventService.record(contract.getTenantId(), OaContractConstants.BUSINESS_TYPE_CONTRACT, contractId,
                OaContractConstants.BUSINESS_TYPE_SEAL, sealApplicationId, "SEAL_LINKED",
                "绑定用印申请", application.getApplicationNo() + " / " + application.getSealName(),
                UserContext.getUserId(), resolveUserName(), null);
        return updated;
    }

    @Override
    public List<OaTraceEvent> listTimeline(Long contractId) {
        requireContract(contractId);
        return oaTraceEventService.listByBusiness(OaContractConstants.BUSINESS_TYPE_CONTRACT, contractId);
    }

    @Override
    public List<OaRiskAlert> listRisks(Long contractId) {
        requireContract(contractId);
        return oaRiskAlertService.listByBusiness(OaContractConstants.BUSINESS_TYPE_CONTRACT, contractId);
    }

    private void normalizeAndValidate(OaContract contract) {
        if (contract == null) {
            throw new IllegalArgumentException("合同不能为空");
        }
        if (!StringUtils.hasText(contract.getContractName())) {
            throw new IllegalArgumentException("合同名称不能为空");
        }
        if (!StringUtils.hasText(contract.getCounterpartyName())) {
            throw new IllegalArgumentException("相对方不能为空");
        }
        if (!StringUtils.hasText(contract.getContractType())) {
            throw new IllegalArgumentException("合同类型不能为空");
        }
        if (contract.getAmount() == null || contract.getAmount().compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("合同金额不能小于0");
        }
        if (contract.getEndDate() != null && contract.getStartDate() != null && contract.getEndDate().isBefore(contract.getStartDate())) {
            throw new IllegalArgumentException("合同结束日期不能早于开始日期");
        }
        contract.setCurrency(StringUtils.hasText(contract.getCurrency()) ? contract.getCurrency() : "CNY");
        contract.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(contract.getAttachmentUrl(), "合同附件"));
        contract.setArchiveAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(contract.getArchiveAttachmentUrl(), "合同归档附件"));
    }

    private OaContract requireContract(Long id) {
        OaContract contract = getById(id);
        if (contract == null || !Integer.valueOf(0).equals(contract.getDeleted())) {
            throw new IllegalArgumentException("合同不存在");
        }
        return contract;
    }

    private String generateContractNo() {
        String today = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        Long count = count(new LambdaQueryWrapper<OaContract>()
                .likeRight(OaContract::getContractNo, "HT" + today));
        return String.format("HT%s%04d", today, (count == null ? 0 : count) + 1);
    }

    private Map<String, Object> buildWorkflowVariables(OaContract contract) {
        Map<String, Object> variables = new HashMap<>();
        variables.put("contractId", contract.getContractId());
        variables.put("contractNo", contract.getContractNo());
        variables.put("contractName", contract.getContractName());
        variables.put("counterpartyName", contract.getCounterpartyName());
        variables.put("contractType", contract.getContractType());
        variables.put("amount", contract.getAmount());
        variables.put("currency", contract.getCurrency());
        variables.put("ownerId", contract.getOwnerId());
        variables.put("ownerName", contract.getOwnerName());
        variables.put("deptName", contract.getDeptName());
        variables.put("startDate", contract.getStartDate() == null ? null : contract.getStartDate().toString());
        variables.put("endDate", contract.getEndDate() == null ? null : contract.getEndDate().toString());
        variables.put("hasAttachment", StringUtils.hasText(contract.getAttachmentUrl()));
        // OA-P0-3 合同金额阈值: 按金额命中规则后写入 amountTier / requiredApproverRole, 供流程 CONDITION 分支路由
        OaContractAmountThreshold threshold = null;
        try {
            threshold = oaContractAmountThresholdService.matchThreshold(contract.getDeptName(), contract.getAmount());
        } catch (Exception e) {
            log.warn("合同金额阈值匹配失败, contractId={}, amount={}", contract.getContractId(), contract.getAmount(), e);
        }
        variables.put("amountTier", threshold == null ? "T1" : threshold.getAmountTier());
        variables.put("requiredApproverRole", threshold == null ? "DEPT_MGR" : threshold.getApproverRole());
        return variables;
    }

    @SuppressWarnings("unchecked")
    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data instanceof String ? (String) data : null;
    }

    private String resolveUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }
}
