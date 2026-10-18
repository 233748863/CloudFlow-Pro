package com.cloudflow.oa.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.oa.domain.OaConsumableLedger;
import com.cloudflow.oa.domain.OaConsumableRequest;
import com.cloudflow.oa.domain.OaConsumableRequestItem;
import com.cloudflow.oa.domain.OaTraceEvent;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaConsumableLedgerMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestMapper;
import com.cloudflow.oa.mapper.OaConsumableRequestItemMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConsumableApprovalService {
    private static final String RULE = "oa.consumable.request.limit";
    private final ConsumableRequestAccess access;
    private final OaConsumableRequestMapper requests;
    private final OaConsumableRequestItemMapper items;
    private final OaConsumableLedgerMapper ledgers;
    private final OaIdentityReferenceMapper identities;
    private final ConsumableLedgerService ledger;
    private final ConsumableTransactions transactions;
    private final ConsumableOperationSupport operations;
    private final OaApprovalOutboxService outbox;
    private final SysConfigHelper config;
    private final ConsumableRuleExecutor ruleExecutor;
    private final ObjectMapper json;

    private record Policy(String mode, String metric, Long approverId, BusinessRuleDTO rule, Map<String, Object> revision) { }
    private record Prepared(List<OaConsumableRequestItem> lines, Map<Long, Integer> materialVersions,
                            BigDecimal total, BigDecimal actual, String effect, boolean approval) { }

    @Audit(name = "提交耗材领用审批")
    public ConsumableResults.RequestResult submit(Long id, ConsumableCommands.Submit command) {
        ConsumableOperationSupport.key(command.getOperationKey());
        OaConsumableRequest applicant = access.own(id, false);
        String hash = operations.hash("REQUEST_SUBMIT", id, command);
        ConsumableResults.RequestResult replay = replay(id, command.getOperationKey(), hash);
        if (replay != null) return replay;
        try {
            Policy policy = policy(applicant);
            Prepared prepared = transactions.execute(() -> prepare(id, command, policy));
            ruleExecutor.record(id, policy.rule(), prepared.actual(), prepared.effect());
            if ("BLOCK".equals(prepared.effect())) throw new IllegalArgumentException("RULE_BLOCKED: 领用申请超过已配置的限制");
            return transactions.execute(() -> {
                OaConsumableRequest request = access.own(id, true);
                ConsumableResults.RequestResult duplicate = replay(id, command.getOperationKey(), hash);
                if (duplicate != null) return duplicate;
                ConsumableOperationSupport.version(command.getVersion(), request.getVersion());
                if (!"DRAFT".equals(request.getStatus())) throw new IllegalArgumentException("仅草稿可提交");
                List<OaConsumableRequestItem> currentLines = items.lockItems(OaRecordSupport.tenantId(), id);
                Map<Long, SysConsumable> locked = ledger.lockAll(currentLines.stream().map(OaConsumableRequestItem::getConsumableId).toList());
                for (SysConsumable material : locked.values()) {
                    ConsumableOperationSupport.version(prepared.materialVersions().get(material.getConsumableId()), material.getVersion());
                    if (!"ACTIVE".equals(material.getStatus())) throw new IllegalArgumentException("停用耗材不能提交新领用");
                }
                if (!Objects.equals(policy.revision(), requests.ruleVersion(OaRecordSupport.tenantId(), RULE))) {
                    throw new IllegalArgumentException("RULE_CHANGED: 审批规则已变更，请重试");
                }
                checkApprover(policy.approverId(), request.getApplicantId());
                Map<Long, OaConsumableRequestItem> estimates = new LinkedHashMap<>();
                prepared.lines().forEach(line -> estimates.put(line.getItemId(), line));
                for (OaConsumableRequestItem line : currentLines) {
                    OaConsumableRequestItem estimate = OaRecordSupport.require(estimates.get(line.getItemId()), "领用明细已变化");
                    line.setUnitPrice(estimate.getUnitPrice());
                    line.setAmount(estimate.getAmount());
                    line.setApprovedQuantity(prepared.approval() ? 0 : line.getApplyQuantity());
                    access.saveItem(line);
                }
                Map<String, Object> frozen = snapshot(request, policy, prepared);
                request.setTotalAmount(prepared.total());
                request.setSubmitKey(command.getOperationKey());
                request.setSubmitHash(hash);
                request.setSubmitTime(LocalDateTime.now());
                if (prepared.approval()) {
                    Map<String, Object> variables = variables(request, policy, prepared.lines());
                    String reservation = outbox.queue(ConsumableOperationSupport.BUSINESS_TYPE, id, request.getRequestNo(), "oa_consumable_request", variables);
                    frozen.put("reservation", reservation);
                    request.setInstanceId(reservation);
                    request.setStatus("APPROVING");
                } else {
                    request.setInstanceId(null);
                    request.setStatus("APPROVED");
                }
                request.setRuleSnapshot(write(frozen));
                access.save(request);
                ConsumableResults.RequestResult result = ConsumableRequestAccess.result(request, false);
                operations.record(id, "CONSUMABLE_SUBMIT", command.getOperationKey(), hash, result);
                if (!prepared.approval()) operations.trace(ConsumableOperationSupport.BUSINESS_TYPE, id,
                        "CONSUMABLE_AUTO_APPROVED", "按已配置阈值自动通过", Map.of("ruleVersion", policy.revision().get("versionNo")));
                return result;
            });
        } catch (RuntimeException exception) {
            ConsumableResults.RequestResult result = replay(id, command.getOperationKey(), hash);
            if (result == null) throw exception;
            return result;
        }
    }

    public void bind(OaApprovalRequest submission, String instanceId) {
        transactions.execute(() -> {
            OaRecordSupport.same(OaRecordSupport.tenantId(), submission.getTenantId(), "审批租户不一致");
            OaConsumableRequest request = access.lock(submission.getBusinessId());
            if (!Objects.equals(request.getInstanceId(), submission.getReservation())) return null;
            if (!"APPROVING".equals(request.getStatus())) throw new IllegalStateException("领用审批状态与预占不一致");
            verifyFrozen(request, submission);
            request.setInstanceId(OaRecordSupport.text(instanceId, 64, "审批实例"));
            access.save(request);
            outbox.recordBinding(submission, instanceId);
            return null;
        });
    }

    @Audit(name = "核验耗材领用终审回调", highRisk = true)
    public void decision(ApprovalResultDTO result, boolean approved) {
        transactions.execute(() -> {
            OaRecordSupport.same(OaRecordSupport.tenantId(), result.getTenantId(), "审批回调租户不一致");
            OaRecordSupport.same(ConsumableOperationSupport.BUSINESS_TYPE, result.getBusinessType(), "审批业务类型不一致");
            OaConsumableRequest request = access.lock(result.getBusinessId());
            if (!OaApprovalOutboxService.matches(request.getInstanceId(), result)) return null;
            OaApprovalRequest submission = outbox.snapshot(result);
            verifyFrozen(request, submission);
            JsonNode frozen = read(request.getRuleSnapshot());
            Long approverId = OaRecordSupport.require(result.getApproverId(), "终审必须提供真实审批人");
            if (Objects.equals(approverId, request.getApplicantId())
                    || !frozen.path("approverIds").equals(json.valueToTree(List.of(approverId.toString())))) {
                throw new IllegalStateException("SELF_APPROVAL_FORBIDDEN: 终审人与冻结的合法审批人不一致");
            }
            checkApprover(approverId, request.getApplicantId());
            if (result.getVariables() == null || !Objects.equals(submission.getReservation(), result.getVariables().get("oaRequestToken"))) {
                throw new IllegalStateException("审批提交令牌不一致");
            }
            if (!"APPROVING".equals(request.getStatus())) return null;
            if (!Objects.equals(result.getApprovalResult(), approved ? "APPROVED" : "REJECTED")) throw new IllegalStateException("审批结果类型不一致");
            for (OaConsumableRequestItem line : items.lockItems(OaRecordSupport.tenantId(), request.getRequestId())) {
                line.setApprovedQuantity(approved ? line.getApplyQuantity() : 0);
                access.saveItem(line);
            }
            request.setStatus(approved ? "APPROVED" : "REJECTED");
            access.save(request);
            operations.trace(ConsumableOperationSupport.BUSINESS_TYPE, request.getRequestId(), "CONSUMABLE_DECISION",
                    request.getStatus(), Map.of("instanceId", result.getProcessInstanceId(), "approverId", approverId.toString()));
            return null;
        });
    }

    private Policy policy(OaConsumableRequest request) {
        String mode = OaRecordSupport.code(config.getTenantValue("sys.oa.consumable.approvalMode"), null, Set.of("ALWAYS", "THRESHOLD"));
        String metric = OaRecordSupport.code(config.getTenantValue("sys.oa.consumable.limitMetric"), null, Set.of("AMOUNT", "QUANTITY"));
        String configured = config.getTenantValue("sys.oa.consumable.approverUserId");
        if (configured == null || !configured.matches("[1-9][0-9]*")) throw new IllegalArgumentException("请配置同租户领用审批负责人");
        Long approver = Long.valueOf(configured);
        checkApprover(approver, request.getApplicantId());
        BusinessRuleDTO rule = ruleExecutor.effective(RULE);
        if (!RULE.equals(rule.getRuleCode()) || !Integer.valueOf(1).equals(rule.getEnabled()) || rule.getThresholdValue() == null
                || rule.getThresholdValue().signum() < 0 || rule.getEffect() == null || !Set.of("WARN", "ALERT", "BLOCK", "PASS").contains(rule.getEffect())) {
            throw new IllegalArgumentException("RULE_INVALID: 审批规则未启用或配置无效");
        }
        if ("QUANTITY".equals(metric) && (rule.getThresholdValue().stripTrailingZeros().scale() > 0
                || rule.getThresholdValue().compareTo(BigDecimal.valueOf(Integer.MAX_VALUE)) > 0)) throw new IllegalArgumentException("RULE_INVALID: 数量阈值必须为0至2147483647的整数");
        if ("AMOUNT".equals(metric)) ConsumableCostCalculator.price(rule.getThresholdValue());
        Map<String, Object> revision = OaRecordSupport.require(requests.ruleVersion(OaRecordSupport.tenantId(), RULE), "审批规则缺少已发布版本");
        if (new BigDecimal(revision.get("thresholdValue").toString()).compareTo(rule.getThresholdValue()) != 0
                || !Objects.equals(revision.get("effect"), rule.getEffect())
                || !(Boolean.TRUE.equals(revision.get("enabled")) || "1".equals(String.valueOf(revision.get("enabled"))))) {
            throw new IllegalStateException("规则中心与已发布版本不一致");
        }
        return new Policy(mode, metric, approver, rule, revision);
    }

    private Prepared prepare(Long id, ConsumableCommands.Submit command, Policy policy) {
        OaConsumableRequest request = access.own(id, true);
        ConsumableOperationSupport.version(command.getVersion(), request.getVersion());
        if (!"DRAFT".equals(request.getStatus())) throw new IllegalArgumentException("仅草稿可提交，驳回申请须先编辑");
        List<OaConsumableRequestItem> sourceLines = items.lockItems(OaRecordSupport.tenantId(), id);
        ConsumableRequestAccess.unissued(sourceLines);
        Map<Long, SysConsumable> locked = ledger.lockAll(sourceLines.stream().map(OaConsumableRequestItem::getConsumableId).toList());
        Map<Long, Integer> versions = new LinkedHashMap<>();
        List<OaConsumableRequestItem> estimates = new ArrayList<>();
        for (OaConsumableRequestItem source : sourceLines) {
            SysConsumable material = locked.get(source.getConsumableId());
            if (!"ACTIVE".equals(material.getStatus()) || !Objects.equals(material.getUnit(), source.getUnit())) throw new IllegalArgumentException("耗材已停用或单位不一致");
            ledger.assertTail(material);
            versions.put(material.getConsumableId(), material.getVersion());
            OaConsumableRequestItem estimate = new OaConsumableRequestItem();
            BeanUtils.copyProperties(source, estimate);
            BigDecimal price = material.getQuantity() > 0 ? material.getAvgCost() : null;
            if (price == null) {
                OaConsumableLedger inbound = ledgers.lastInbound(material.getTenantId(), material.getConsumableId());
                price = inbound == null ? null : inbound.getUnitPrice();
            }
            estimate.setUnitPrice(price);
            estimate.setAmount(price == null ? null : ConsumableCostCalculator.price(price.multiply(BigDecimal.valueOf(source.getApplyQuantity()))));
            estimates.add(estimate);
        }
        BigDecimal total = ConsumableRequestService.total(estimates);
        BigDecimal actual = "AMOUNT".equals(policy.metric()) ? total : BigDecimal.valueOf(estimates.stream().mapToInt(OaConsumableRequestItem::getApplyQuantity).max().orElseThrow());
        ConsumableRuleExecutor.Decision decision = ConsumableRuleExecutor.decide(policy.rule(), policy.mode(), total, actual);
        return new Prepared(estimates, versions, total, actual, decision.effect(), decision.approval());
    }

    private void checkApprover(Long approver, Long applicant) {
        if (Objects.equals(approver, applicant)) throw new IllegalArgumentException("SELF_APPROVAL_FORBIDDEN: 领用审批人不能是原申请人");
        OaIdentityReference account = OaRecordSupport.active(identities.user(approver, OaRecordSupport.tenantId()));
        OaRecordSupport.active(identities.department(account.getDeptId(), OaRecordSupport.tenantId()));
        if (requests.approverAllowed(OaRecordSupport.tenantId(), approver) < 1) throw new IllegalArgumentException("领用审批人没有有效任务办理权限");
    }

    private Map<String, Object> snapshot(OaConsumableRequest request, Policy policy, Prepared prepared) {
        Map<String, Object> frozen = new LinkedHashMap<>();
        frozen.put("applicantId", request.getApplicantId().toString());
        frozen.put("approverIds", List.of(policy.approverId().toString()));
        frozen.put("_hExcludedUserIds", List.of(request.getApplicantId().toString()));
        frozen.put("approvalMode", policy.mode());
        frozen.put("limitMetric", policy.metric());
        frozen.put("ruleCode", RULE);
        frozen.put("ruleVersion", policy.revision());
        frozen.put("actualValue", prepared.actual());
        frozen.put("estimatedTotal", prepared.total());
        frozen.put("effect", prepared.effect());
        frozen.put("approvalRequired", prepared.approval());
        return frozen;
    }

    private Map<String, Object> variables(OaConsumableRequest request, Policy policy, List<OaConsumableRequestItem> lines) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("applicantId", request.getApplicantId().toString());
        values.put("applicantName", request.getApplicantName());
        values.put("deptId", request.getDeptId().toString());
        values.put("deptName", request.getDeptName());
        values.put("purpose", request.getPurpose());
        values.put("approvalRequired", true);
        values.put("approverIds", List.of(policy.approverId().toString()));
        values.put("_hExcludedUserIds", List.of(request.getApplicantId().toString()));
        values.put("items", lines.stream().map(line -> {
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("itemId", line.getItemId().toString());
            value.put("consumableId", line.getConsumableId().toString());
            value.put("name", line.getConsumableName());
            value.put("model", line.getModel());
            value.put("unit", line.getUnit());
            value.put("applyQuantity", line.getApplyQuantity());
            return value;
        }).toList());
        return values;
    }

    private void verifyFrozen(OaConsumableRequest request, OaApprovalRequest submission) {
        JsonNode frozen = read(request.getRuleSnapshot());
        OaRecordSupport.same(request.getTenantId(), submission.getTenantId(), "审批快照租户不一致");
        OaRecordSupport.same(ConsumableOperationSupport.BUSINESS_TYPE, submission.getBusinessType(), "审批快照业务类型不一致");
        OaRecordSupport.same(request.getRequestId(), submission.getBusinessId(), "审批快照申请不一致");
        OaRecordSupport.same(request.getApplicantId(), submission.getStartUserId(), "审批原申请人不一致");
        if (!Objects.equals(frozen.path("reservation").asText(), submission.getReservation())
                || !frozen.path("applicantId").asText().equals(request.getApplicantId().toString())
                || submission.getVariables() == null
                || !frozen.path("_hExcludedUserIds").equals(json.valueToTree(List.of(request.getApplicantId().toString())))
                || !frozen.path("_hExcludedUserIds").equals(json.valueToTree(submission.getVariables().get("_hExcludedUserIds")))
                || !frozen.path("approverIds").isArray() || frozen.path("approverIds").size() != 1
                || !frozen.path("approverIds").equals(json.valueToTree(submission.getVariables().get("approverIds")))) {
            throw new IllegalStateException("审批参与人或提交快照被改变");
        }
    }

    private ConsumableResults.RequestResult replay(Long id, String key, String hash) {
        OaTraceEvent other = requests.operationTrace(OaRecordSupport.tenantId(), null, "CONSUMABLE_SUBMIT", key);
        if (other != null && !Objects.equals(other.getBusinessId(), id)) throw new IllegalArgumentException("IDEMPOTENCY_CONFLICT: 提交键已用于另一申请");
        ConsumableResults.RequestResult result = operations.replay(id, "CONSUMABLE_SUBMIT", key, hash, ConsumableResults.RequestResult.class);
        if (result != null) result.setReplayed(true);
        return result;
    }

    private String write(Object value) {
        try { return json.writeValueAsString(value); }
        catch (Exception exception) { throw new IllegalStateException("审批规则快照保存失败", exception); }
    }

    private JsonNode read(String value) {
        try { return json.readTree(OaRecordSupport.require(value, "审批规则快照缺失")); }
        catch (Exception exception) { throw new IllegalStateException("审批规则快照无效", exception); }
    }
}
