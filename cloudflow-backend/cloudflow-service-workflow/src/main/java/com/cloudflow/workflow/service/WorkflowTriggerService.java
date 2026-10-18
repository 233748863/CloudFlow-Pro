package com.cloudflow.workflow.service;

import com.cloudflow.workflow.service.WorkflowBusinessLockService;
import com.cloudflow.workflow.service.WorkflowBusinessLockService.BusinessLock;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.monitor.AnomalyAlert;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.monitor.IAnomalyDetectionService;
import com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowTriggerService {
    public static final String BUSINESS_TYPE = "WORKFLOW_TRIGGER";
    public static final String COMPLETION_PREFIX = "_wf_trigger_completion_";
    private final WorkflowTriggerExecutor executor;
    private final WorkflowTriggerSecrets secrets;
    private final TransactionConsistencyService consistency;
    private final WfTransactionMessageMapper messages;
    private final WfCallbackDeadLetterMapper deadLetters;
    private final WfProcessInstanceMapper instances;
    private final WfProcessDefinitionMapper definitions;
    private final WfNodeRecordMapper records;
    private final AnomalyAlertMapper alerts;
    private final IAnomalyDetectionService anomalyService;
    private final WorkflowProcessStateService states;
    private final ObjectProvider<INodeExecutionService> engine;
    private final WorkflowGraphModelResolver graphs;
    private final WorkflowEventPublisher events;
    private final ObjectMapper mapper;
    @org.springframework.beans.factory.annotation.Autowired
    private WorkflowBusinessLockService businessLocks;
    private final RedissonClient redisson;
    private final TransactionTemplate transactions;
    private final WorkflowGatewayService gateways;
    private final PerformanceStatsRefreshService performanceStatsRefreshService;

    @Transactional(rollbackFor = Exception.class)
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        Map<String, Object> request = executor.prepare(node, instance, variables);
        boolean async = node.getProps().containsKey("callAsync") ? Boolean.TRUE.equals(node.getProps().get("callAsync"))
                : node.getProps().containsKey("triggerType");
        if (async) {
            String messageId = consistency.recordMessage(BUSINESS_TYPE, instance.getInstanceId(), envelope(request, UUID.randomUUID().toString()));
            WfTransactionMessage message = messages.selectById(messageId);
            message.setTenantId(instance.getTenantId());
            message.setMaxRetryCount(number(request, "retryCount") + 1);
            saveMessage(message);
            WorkflowWaitState.register(instance, variables, messageId, "TRIGGER", node.getId(), Map.of());
            states.transition(instance, WfProcessStatus.PENDING);
            Runnable dispatch = () -> {
                try {
                    consistency.retryMessage(message);
                } catch (RuntimeException unavailable) {
                    log.warn("触发任务留待现有事务消息扫描重试: messageId={}", messageId);
                }
            };
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() { dispatch.run(); }
                });
            } else {
                dispatch.run();
            }
            return false;
        }
        String requestId = UUID.randomUUID().toString();
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(number(request, "timeoutMillis"));
        String error = "外调请求失败";
        for (int attempt = 0; attempt <= number(request, "retryCount"); attempt++) {
            long remaining = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
            if (remaining <= 0) { error = "外调请求超时"; break; }
            try {
                HttpClientService.ApiResponse response = executor.execute(request, requestId, remaining);
                if (response.isSuccess()) {
                    storeResponse(node, variables, response);
                    variables.put(COMPLETION_PREFIX + node.getId(), "AUTO_PASS");
                    saveVariables(instance, variables);
                    states.transition(instance, WfProcessStatus.fromCode(instance.getStatus()));
                    return true;
                }
                error = "外调未成功: HTTP " + response.getStatusCode();
            } catch (WorkflowException policyFailure) {
                error = policyFailure.getMessage();
                break;
            }
        }
        boolean proceed = fail(instance, node, variables, request, requestId, error);
        if (proceed) variables.put(COMPLETION_PREFIX + node.getId(), "AUTO_SKIP");
        return proceed;
    }

    public void processAsync(WfTransactionMessage queued) {
        try {
            processForScan(queued);
        } catch (RuntimeException failure) {
            log.error("异步触发处理未提交，保留事务消息恢复: messageId={}", queued.getMessageId());
        }
    }

    public boolean processForScan(WfTransactionMessage queued) {
        BusinessLock lock = businessLocks.getLock("lock:instance:" + queued.getBusinessId());
        boolean acquired = false;
        try {
            acquired = lock.tryLock(5, TimeUnit.SECONDS);
            if (!acquired) return false;
            try {
                return Boolean.TRUE.equals(businessLocks.execute(transactions, status -> executeQueued(queued.getMessageId())));
            } catch (RuntimeException failure) {
                try {
                    businessLocks.executeWithoutResult(transactions, status -> recoverFailedSubmission(queued.getMessageId()));
                } catch (RuntimeException recoveryFailure) {
                    failure.addSuppressed(recoveryFailure);
                }
                throw failure;
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("异步触发获取流程锁被中断", interrupted);
        } finally {
            lock.close();
        }
    }

    private boolean executeQueued(String messageId) {
        WfTransactionMessage message = messages.selectById(messageId);
        if (message == null || !"PENDING".equals(message.getStatus())) return false;
        WfProcessInstance instance = instances.selectForExecution(message.getTenantId(), message.getBusinessId());
        if (instance == null || !Objects.equals(instance.getTenantId(), message.getTenantId())
                || WfProcessStatus.fromCode(instance.getStatus()).isTerminal()) {
            finishMessage(message, "SUCCESS");
            return true;
        }
        if (!WfProcessStatus.isActive(instance.getStatus())) {
            message.setNextRetryTime(LocalDateTime.now().plusMinutes(3));
            saveMessage(message);
            return true;
        }
        Map<String, Object> envelope = json(message.getContent());
        Map<String, Object> request = json(secrets.open(String.valueOf(envelope.get("request_cipher"))));
        String nodeKey = String.valueOf(request.get("nodeKey"));
        WorkflowWaitState.Pending pending = WorkflowWaitState.find(instance, messageId);
        if (pending == null) {
            finishMessage(message, "SUCCESS");
            return true;
        }
        if (!"TRIGGER".equals(pending.kind()) || !nodeKey.equals(pending.nodeKey())
                || !Objects.equals(pending.executionContext(), envelope.get("executionContext"))) throw WorkflowExecutionContext.invalid();
        if (!gateways.isActive(instance, pending.context())) {
            WorkflowWaitState.finish(instance, null, messageId);
            if (instances.updateById(instance) != 1) throw WorkflowExecutionContext.invalid();
            finishMessage(message, "SUCCESS");
            return true;
        }
        WorkflowExecutionContext.run(pending.context(), () -> executeWaiting(message, instance, envelope, request, pending));
        return true;
    }

    private void executeWaiting(WfTransactionMessage message, WfProcessInstance instance, Map<String, Object> envelope,
                                Map<String, Object> request, WorkflowWaitState.Pending pending) {
        String nodeKey = pending.nodeKey();
        Map<String, Object> variables = WorkflowWaitState.variables(instance);
        WfProcessDefinition definition = definitions.selectById(instance.getDefinitionId());
        if (definition == null || !Objects.equals(definition.getTenantId(), instance.getTenantId())) {
            throw WorkflowException.invalidState("异步触发的流程定义不存在");
        }
        WfNodeConfig root = graphs.parseRuntimeRoot(definition.getModelJson());
        WfNodeConfig node = engine.getObject().findNode(root, nodeKey);
        if (node == null || !"SCRIPT".equals(node.getType())) throw WorkflowException.validationError("触发节点不存在");
        Long previousUser = UserContext.getUserId();
        String previousName = UserContext.getUserName();
        UserContext.setUserId(instance.getStartUserId());
        UserContext.setUserName("系统触发节点");
        try {
            message.setRetryCount(message.getRetryCount() + 1);
            HttpClientService.ApiResponse response = null;
            String error = "触发配置或安全校验未通过";
            try {
                response = executor.execute(request, String.valueOf(envelope.get("requestId")), number(request, "timeoutMillis"));
                error = "外调未成功: HTTP " + response.getStatusCode();
            } catch (WorkflowException policyFailure) {
                error = policyFailure.getMessage();
                message.setRetryCount(message.getMaxRetryCount());
            }
            boolean success = response != null && response.isSuccess();
            if (!success && message.getRetryCount() < message.getMaxRetryCount()) {
                message.setNextRetryTime(LocalDateTime.now().plusSeconds(30L << Math.min(message.getRetryCount(), 5)));
                message.setErrorMessage(error);
                message.setUpdateTime(LocalDateTime.now());
                saveMessage(message);
                return;
            }
            WorkflowWaitState.finish(instance, variables, pending.waitId());
            boolean proceed = success || fail(instance, node, variables, request, String.valueOf(envelope.get("requestId")), error);
            finishMessage(message, proceed ? "SUCCESS" : "FAILED");
            if (!proceed) return;
            if (success) storeResponse(node, variables, response);
            saveVariables(instance, variables);
            states.transition(instance, WfProcessStatus.RUNNING);
            String semantic = success ? "AUTO_PASS" : "AUTO_SKIP";
            TaskSemanticContext.withType(semantic, () -> events.publishNodeCompleted(instance, node));
            WorkflowCompletionContext.automatically(() -> {
                engine.getObject().advanceAfterNode(instance, node, nodeKey, variables, 0, root);
                return null;
            });
        } finally {
            UserContext.setUserId(previousUser);
            UserContext.setUserName(previousName);
        }
    }

    private void recoverFailedSubmission(String messageId) {
        WfTransactionMessage message = messages.selectById(messageId);
        if (message == null || !"PENDING".equals(message.getStatus())) return;
        message.setRetryCount(message.getRetryCount() + 1);
        message.setErrorMessage("触发操作提交失败，外部接收方应按请求编号去重");
        message.setNextRetryTime(LocalDateTime.now().plusMinutes(3));
        if (message.getRetryCount() >= message.getMaxRetryCount()) {
            message.setStatus("FAILED");
            WfProcessInstance instance = instances.selectForExecution(message.getTenantId(), message.getBusinessId());
            if (instance != null && WfProcessStatus.isActive(instance.getStatus())) {
                Map<String, Object> variables = json(instance.getVariables());
                String nodeKey = String.valueOf(json(message.getContent()).get("nodeKey"));
                variables.put(INodeExecutionService.FAILED_NODE_KEY_VARIABLE, nodeKey);
                WorkflowWaitState.Pending pending = WorkflowWaitState.find(instance, messageId);
                if (pending != null) {
                    variables.put(WorkflowWaitState.FAILED_CONTEXT, pending.executionContext());
                    WorkflowWaitState.finish(instance, variables, messageId);
                }
                saveVariables(instance, variables);
                states.transition(instance, WfProcessStatus.FAILED);
                anomalyService.detectExecutionFailure(instance.getInstanceId(), "触发操作多次提交失败，需人工恢复", null);
            }
        }
        saveMessage(message);
    }

    public void replay(WfCallbackDeadLetter stale) {
        RLock lock = redisson.getLock("lock:trigger:dlq:" + stale.getId());
        try {
            if (!lock.tryLock(5, TimeUnit.SECONDS)) throw WorkflowException.invalidState("死信正在重放，请稍后重试");
            replayLocked(stale);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw WorkflowException.invalidState("死信重放被中断");
        } finally {
            if (lock.isHeldByCurrentThread()) lock.unlock();
        }
    }

    private void replayLocked(WfCallbackDeadLetter stale) {
        Boolean success = TenantBroker.applyAs(stale.getTenantId(), ignored -> businessLocks.execute(transactions, status -> {
            WfCallbackDeadLetter entry = deadLetters.selectById(stale.getId());
            if (entry == null || !"PENDING".equals(entry.getStatus()) || !Objects.equals(entry.getTenantId(), stale.getTenantId())) {
                throw WorkflowException.invalidState("死信不存在或已经处理");
            }
            Map<String, Object> envelope = json(entry.getPayloadJson());
            Map<String, Object> request = json(secrets.open(String.valueOf(envelope.get("request_cipher"))));
            if (!String.valueOf(entry.getTenantId()).equals(String.valueOf(request.get("tenantId")))) {
                throw WorkflowException.permissionDenied("死信请求租户不匹配");
            }
            boolean sent;
            try {
                sent = executor.execute(request, String.valueOf(envelope.get("requestId")), number(request, "timeoutMillis")).isSuccess();
            } catch (WorkflowException policyFailure) {
                sent = false;
            }
            entry.setRetryCount((entry.getRetryCount() == null ? 0 : entry.getRetryCount()) + 1);
            entry.setStatus(sent ? "REPLAYED" : "PENDING");
            entry.setLastError(sent ? null : "重放未成功，请检查白名单及目标服务");
            entry.setUpdateTime(LocalDateTime.now());
            if (deadLetters.updateById(entry) != 1) throw WorkflowException.invalidState("死信记录已变更");
            return sent;
        }));
        if (!Boolean.TRUE.equals(success)) throw WorkflowException.invalidState("触发请求重放失败，死信仍保留");
    }

    private String resolveProcessName(WfProcessInstance instance) {
        WfProcessDefinition definition = definitions.selectById(instance.getDefinitionId());
        if (definition != null && Objects.equals(instance.getTenantId(), definition.getTenantId())
                && StringUtils.hasText(definition.getProcessName())) return definition.getProcessName();
        return instance.getProcessDefKey();
    }

    private boolean fail(WfProcessInstance instance, WfNodeConfig node, Map<String, Object> variables,
                          Map<String, Object> request, String requestId, String error) {
        String strategy = String.valueOf(request.get("failStrategy"));
        writeRecord(instance, node, strategy, error);
        if ("BLOCK".equals(strategy)) {
            variables.put(INodeExecutionService.FAILED_NODE_KEY_VARIABLE, node.getId());
            variables.put(WorkflowWaitState.FAILED_CONTEXT, WorkflowExecutionContext.capture());
            saveVariables(instance, variables);
            states.transition(instance, WfProcessStatus.FAILED);
            AnomalyAlert alert = new AnomalyAlert();
            alert.setTenantId(instance.getTenantId());
            alert.setInstanceId(instance.getInstanceId());
            alert.setProcessDefKey(instance.getProcessDefKey());
            alert.setProcessName(resolveProcessName(instance));
            alert.setNodeKey(node.getId());
            alert.setNodeName(node.getTitle());
            alert.setAnomalyType("EXECUTION_FAILED");
            alert.setSeverity("HIGH");
            alert.setErrorMessage(error + "，流程已阻塞");
            alert.setResolved("N");
            alert.setNotificationSent("N");
            alert.setAlertTime(LocalDateTime.now());
            alert.setCreateTime(LocalDateTime.now());
            alert.setUpdateTime(LocalDateTime.now());
            if (alerts.insert(alert) != 1) throw new IllegalStateException("触发失败告警登记失败");
            anomalyService.sendAnomalyAlert(alert);
            performanceStatsRefreshService.refreshForAnomalyAlert(alert);
            return false;
        }
        if ("TO_DLQ".equals(strategy)) {
            WfCallbackDeadLetter entry = new WfCallbackDeadLetter();
            entry.setTenantId(instance.getTenantId());
            entry.setProcessInstanceId(instance.getInstanceId());
            entry.setBusinessType(BUSINESS_TYPE);
            entry.setStreamKey("workflow:trigger:http");
            entry.setPayloadJson(envelope(request, requestId));
            entry.setRetryCount(number(request, "retryCount"));
            entry.setLastError(error);
            entry.setStatus("PENDING");
            entry.setVersion(0);
            entry.setCreateTime(LocalDateTime.now());
            entry.setUpdateTime(LocalDateTime.now());
            deadLetters.insert(entry);
        }
        return true;
    }

    private void writeRecord(WfProcessInstance instance, WfNodeConfig node, String strategy, String error) {
        WfNodeRecord record = new WfNodeRecord();
        record.setInstanceId(instance.getInstanceId());
        record.setProcessDefKey(instance.getProcessDefKey());
        record.setNodeKey(node.getId());
        record.setNodeName(node.getTitle());
        record.setNodeType("SCRIPT");
        record.setStatus("BLOCK".equals(strategy) ? "FAILED" : "SKIPPED");
        record.setEventType("BLOCK".equals(strategy) ? null : "AUTO_SKIP");
        record.setExtraData(stringify(Map.of("policyNote", "TRIGGER_FAILED_" + strategy, "error", error)));
        record.setEventTime(LocalDateTime.now());
        record.setStartTime(LocalDateTime.now());
        record.setEndTime(LocalDateTime.now());
        record.setCreateTime(LocalDateTime.now());
        records.insert(record);
    }

    private void finishMessage(WfTransactionMessage message, String status) {
        message.setStatus(status);
        message.setUpdateTime(LocalDateTime.now());
        if (messages.updateById(message) != 1) throw WorkflowException.invalidState("触发消息已被其他执行器处理");
    }

    private void saveMessage(WfTransactionMessage message) {
        if (messages.updateById(message) != 1) throw WorkflowException.invalidState("触发消息状态保存冲突");
    }

    private void storeResponse(WfNodeConfig node, Map<String, Object> variables, HttpClientService.ApiResponse response) {
        variables.put("_apiStatusCode_" + node.getId(), response.getStatusCode());
        variables.put("_apiResponse_" + node.getId(), response.getBody());
    }

    private void saveVariables(WfProcessInstance instance, Map<String, Object> variables) {
        WorkflowWaitState.save(instance, variables);
    }

    private String envelope(Map<String, Object> request, String requestId) {
        Map<String, Object> envelope = new HashMap<>();
        envelope.put("request_cipher", secrets.seal(stringify(request)));
        envelope.put("requestId", requestId);
        envelope.put("nodeKey", String.valueOf(request.get("nodeKey")));
        envelope.put("executionContext", WorkflowExecutionContext.capture());
        return stringify(envelope);
    }

    private String stringify(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception failure) { throw WorkflowException.validationError("触发数据无法保存"); }
    }

    private Map<String, Object> json(String value) {
        if (value == null || value.isBlank()) return new HashMap<>();
        try { return mapper.readValue(value, new TypeReference<Map<String, Object>>() {}); }
        catch (Exception failure) { throw WorkflowException.validationError("触发数据格式错误"); }
    }

    private static int number(Map<String, Object> values, String key) {
        return new java.math.BigDecimal(String.valueOf(values.get(key))).intValueExact();
    }

}
