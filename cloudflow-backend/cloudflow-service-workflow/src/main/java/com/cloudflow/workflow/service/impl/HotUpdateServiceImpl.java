package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.IdUtils;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.dto.HotUpdateInstanceDetail;
import com.cloudflow.workflow.domain.dto.HotUpdateRequest;
import com.cloudflow.workflow.domain.dto.HotUpdateResult;
import com.cloudflow.workflow.domain.entity.WfHotUpdateRecord;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.mapper.WfHotUpdateRecordMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import com.cloudflow.workflow.service.IHotUpdateService;
import com.cloudflow.workflow.service.INodeExecutionService;
import com.cloudflow.workflow.service.WorkflowAuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Data;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Service
public class HotUpdateServiceImpl implements IHotUpdateService {

    private static final String HOT_UPDATE_LOCK_PREFIX = "WORKFLOW:HOT_UPDATE:";
    private static final String HOT_UPDATE_CONFIRM_PREFIX = "WORKFLOW:HOT_UPDATE:CONFIRM:";
    private static final int CONFIRM_TOKEN_TTL_SECONDS = 30;

    @Autowired
    private WfProcessDefinitionMapper definitionMapper;

    @Autowired
    private WfProcessInstanceMapper instanceMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfHotUpdateRecordMapper hotUpdateRecordMapper;

    @Autowired
    private WorkflowGraphModelResolver graphModelResolver;

    @Autowired
    private INodeExecutionService nodeExecutionService;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private WorkflowAuditService auditService;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HotUpdateResult analyzeOrExecute(HotUpdateRequest request) {
        HotUpdateRequest effectiveRequest = request.isDryRun() ? copyRequest(request) : consumeConfirmedRequest(request);
        HotUpdateResult result = new HotUpdateResult();

        if (!StringUtils.hasText(effectiveRequest.getProcessKey())) {
            result.setSuccess(false);
            result.setMessage("processKey 不能为空");
            return result;
        }

        if (!StringUtils.hasText(effectiveRequest.getMigrationMode())) {
            effectiveRequest.setMigrationMode("COMPATIBLE");
        }

        WfProcessDefinition targetDef = resolveTargetDefinition(effectiveRequest);
        if (targetDef == null) {
            result.setSuccess(false);
            result.setMessage("目标版本流程定义不存在或未发布");
            return result;
        }

        RLock lock = null;
        boolean locked = false;
        try {
            if (!effectiveRequest.isDryRun()) {
                lock = redissonClient.getLock(HOT_UPDATE_LOCK_PREFIX + effectiveRequest.getProcessKey());
                locked = lock.tryLock(0, 30, TimeUnit.SECONDS);
                if (!locked) {
                    throw new ServiceException("当前流程正在执行热更新，请稍后再试", 409);
                }
            }

            WorkflowRuntimeGraph targetGraph;
            try {
                targetGraph = graphModelResolver.parseRuntimeGraph(targetDef.getModelJson());
            } catch (Exception e) {
                result.setSuccess(false);
                result.setMessage("目标版本流程模型解析失败: " + e.getMessage());
                return result;
            }

            Set<String> targetNodeIds = targetGraph.getNodeIds();
            List<WfProcessInstance> runningInstances = findRunningInstances(effectiveRequest, targetDef.getDefinitionId());
            if (runningInstances.isEmpty()) {
                result.setSuccess(true);
                result.setTotalInstances(0);
                result.setMessage("没有需要迁移的运行中实例");
                return result;
            }

            result.setTotalInstances(runningInstances.size());
            result.setToVersion(targetDef.getVersion() != null ? targetDef.getVersion() : 0);

            int migrated = 0;
            int skipped = 0;
            int failed = 0;
            List<HotUpdateInstanceDetail> details = new ArrayList<>();

            for (WfProcessInstance instance : runningInstances) {
                HotUpdateInstanceDetail detail = new HotUpdateInstanceDetail();
                detail.setInstanceId(instance.getInstanceId());
                detail.setProcessNo(instance.getProcessNo());

                WfProcessDefinition currentDef = definitionMapper.selectById(instance.getDefinitionId());
                if (currentDef != null && result.getFromVersion() == 0) {
                    result.setFromVersion(currentDef.getVersion() != null ? currentDef.getVersion() : 0);
                }

                String currentNodeKey = resolveCurrentNodeKey(instance);
                detail.setCurrentNodeKey(currentNodeKey);

                WfNodeConfig currentNodeInTarget = currentNodeKey != null ? targetGraph.getNode(currentNodeKey) : null;
                detail.setCurrentNodeTitle(currentNodeInTarget != null ? currentNodeInTarget.getTitle() : currentNodeKey);

                boolean compatible = currentNodeKey != null && targetNodeIds.contains(currentNodeKey);

                switch (effectiveRequest.getMigrationMode()) {
                    case "COMPATIBLE":
                        if (compatible) {
                            if (!effectiveRequest.isDryRun()) {
                                migrateInstance(instance, targetDef);
                            }
                            detail.setStatus("MIGRATED");
                            migrated++;
                        } else {
                            detail.setStatus("SKIPPED");
                            detail.setReason("当前节点 [" + currentNodeKey + "] 在新版本中不存在");
                            skipped++;
                        }
                        break;

                    case "FORCE":
                        if (compatible) {
                            if (!effectiveRequest.isDryRun()) {
                                migrateInstance(instance, targetDef);
                            }
                            detail.setStatus("MIGRATED");
                            migrated++;
                        } else {
                            if (!effectiveRequest.isDryRun()) {
                                terminateInstance(instance, "HOT_UPDATE_INCOMPATIBLE");
                            }
                            detail.setStatus("FAILED");
                            detail.setReason("强制模式：节点 [" + currentNodeKey + "] 不兼容，实例已终止");
                            failed++;
                        }
                        break;

                    case "RESTART":
                        if (!effectiveRequest.isDryRun()) {
                            terminateInstance(instance, "HOT_UPDATE_RESTART");
                        }
                        detail.setStatus("RESTARTED");
                        detail.setReason("重启模式：旧实例已终止，需手动用新版本重新发起");
                        migrated++;
                        break;

                    default:
                        detail.setStatus("SKIPPED");
                        detail.setReason("未知迁移模式: " + effectiveRequest.getMigrationMode());
                        skipped++;
                        break;
                }

                details.add(detail);
            }

            result.setMigratedCount(migrated);
            result.setSkippedCount(skipped);
            result.setFailedCount(failed);
            result.setDetails(details);
            result.setSuccess(true);
            result.setMessage(effectiveRequest.isDryRun() ? "分析完成（未执行）" : "热更新执行完成");

            if (!effectiveRequest.isDryRun()) {
                saveRecord(effectiveRequest, result);
                auditService.log(
                        WorkflowAuditService.AuditAction.HOT_UPDATE_EXECUTE,
                        effectiveRequest.getProcessKey(),
                        buildExecuteAuditDetail(effectiveRequest, result)
                );
            }

            return result;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ServiceException("获取热更新锁被中断", 500);
        } finally {
            if (locked && lock != null && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    @Override
    public HotUpdateResult prepareExecute(HotUpdateRequest request) {
        HotUpdateRequest previewRequest = copyRequest(request);
        previewRequest.setDryRun(true);
        HotUpdateResult result = analyzeOrExecute(previewRequest);
        if (!result.isSuccess() || result.getTotalInstances() <= 0) {
            if (result.isSuccess() && result.getTotalInstances() == 0) {
                result.setMessage("没有需要迁移的运行中实例，无需执行");
            }
            return result;
        }

        HotUpdateRequest confirmRequest = copyRequest(request);
        confirmRequest.setDryRun(false);
        confirmRequest.setConfirmToken(null);

        String confirmToken = IdUtils.simpleUUID();
        saveConfirmPayload(confirmToken, confirmRequest);
        result.setConfirmToken(confirmToken);
        result.setConfirmExpireSeconds(CONFIRM_TOKEN_TTL_SECONDS);
        result.setMessage("分析完成，请在30秒内确认执行热更新");

        auditService.log(
                WorkflowAuditService.AuditAction.HOT_UPDATE_PREPARE,
                confirmRequest.getProcessKey(),
                buildPrepareAuditDetail(confirmRequest, result)
        );
        return result;
    }

    @Override
    public List<WfHotUpdateRecord> getHistory(String processKey) {
        LambdaQueryWrapper<WfHotUpdateRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfHotUpdateRecord::getProcessKey, processKey)
               .orderByDesc(WfHotUpdateRecord::getExecutedAt);
        return hotUpdateRecordMapper.selectList(wrapper);
    }

    private WfProcessDefinition resolveTargetDefinition(HotUpdateRequest request) {
        LambdaQueryWrapper<WfProcessDefinition> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfProcessDefinition::getProcessKey, request.getProcessKey())
               .eq(WfProcessDefinition::getStatus, "PUBLISHED");

        if (request.getTargetVersion() != null) {
            wrapper.eq(WfProcessDefinition::getVersion, request.getTargetVersion());
        } else {
            wrapper.orderByDesc(WfProcessDefinition::getVersion).last("LIMIT 1");
        }

        return definitionMapper.selectOne(wrapper);
    }

    private List<WfProcessInstance> findRunningInstances(HotUpdateRequest request, String excludeDefinitionId) {
        LambdaQueryWrapper<WfProcessInstance> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfProcessInstance::getProcessDefKey, request.getProcessKey())
               .eq(WfProcessInstance::getStatus, "RUNNING")
               .ne(WfProcessInstance::getDefinitionId, excludeDefinitionId);

        if (request.getInstanceIds() != null && !request.getInstanceIds().isEmpty()) {
            wrapper.in(WfProcessInstance::getInstanceId, request.getInstanceIds());
        }

        return instanceMapper.selectList(wrapper);
    }

    private String resolveCurrentNodeKey(WfProcessInstance instance) {
        LambdaQueryWrapper<WfTask> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfTask::getInstanceId, instance.getInstanceId())
               .in(WfTask::getStatus, WfTaskStatus.TODO.getCode(), "PENDING")
               .orderByAsc(WfTask::getCreateTime)
               .last("LIMIT 1");
        WfTask task = taskMapper.selectOne(wrapper);
        return task != null ? task.getNodeKey() : null;
    }

    private void migrateInstance(WfProcessInstance instance, WfProcessDefinition targetDef) {
        nodeExecutionService.saveProcessSnapshot(instance, "HOT_UPDATE", "热更新前快照");

        WfProcessInstance update = new WfProcessInstance();
        update.setInstanceId(instance.getInstanceId());
        update.setDefinitionId(targetDef.getDefinitionId());
        instanceMapper.updateById(update);
    }

    private void terminateInstance(WfProcessInstance instance, String reason) {
        nodeExecutionService.saveProcessSnapshot(instance, "HOT_UPDATE", reason);
        nodeExecutionService.completeInstance(instance, "TERMINATED");
    }

    private void saveRecord(HotUpdateRequest request, HotUpdateResult result) {
        WfHotUpdateRecord record = new WfHotUpdateRecord();
        record.setProcessKey(request.getProcessKey());
        record.setFromVersion(result.getFromVersion());
        record.setToVersion(result.getToVersion());
        record.setMigrationMode(request.getMigrationMode());
        record.setTotalInstances(result.getTotalInstances());
        record.setMigratedCount(result.getMigratedCount());
        record.setSkippedCount(result.getSkippedCount());
        record.setFailedCount(result.getFailedCount());
        record.setExecutedBy(UserContext.getUserId() != null ? UserContext.getUserId().toString() : "system");
        record.setExecutedAt(LocalDateTime.now());
        record.setTenantId(UserContext.getTenantId());

        try {
            record.setDetailsJson(objectMapper.writeValueAsString(result.getDetails()));
        } catch (Exception ignored) {
            record.setDetailsJson("[]");
        }

        hotUpdateRecordMapper.insert(record);
    }

    private void saveConfirmPayload(String confirmToken, HotUpdateRequest request) {
        HotUpdateConfirmPayload payload = new HotUpdateConfirmPayload();
        payload.setRequest(copyRequest(request));
        payload.setUserId(UserContext.getUserId());
        payload.setTenantId(UserContext.getTenantId());
        payload.setPreparedAt(LocalDateTime.now());
        try {
            redisCache.setCacheObject(
                    HOT_UPDATE_CONFIRM_PREFIX + confirmToken,
                    objectMapper.writeValueAsString(payload),
                    CONFIRM_TOKEN_TTL_SECONDS,
                    TimeUnit.SECONDS
            );
        } catch (Exception e) {
            throw new ServiceException("生成确认令牌失败", e);
        }
    }

    private HotUpdateRequest consumeConfirmedRequest(HotUpdateRequest request) {
        if (!StringUtils.hasText(request.getConfirmToken())) {
            throw new ServiceException("请先分析影响并生成确认令牌", 400);
        }

        String cacheKey = HOT_UPDATE_CONFIRM_PREFIX + request.getConfirmToken();
        String payloadJson = redisCache.getCacheObject(cacheKey);
        redisCache.deleteObject(cacheKey);
        if (!StringUtils.hasText(payloadJson)) {
            throw new ServiceException("确认令牌已过期，请重新分析后再执行", 400);
        }

        try {
            HotUpdateConfirmPayload payload = objectMapper.readValue(payloadJson, HotUpdateConfirmPayload.class);
            if (payload.getRequest() == null || !StringUtils.hasText(payload.getRequest().getProcessKey())) {
                throw new ServiceException("确认令牌无效，请重新分析后再执行", 400);
            }
            if (!isSameIdentity(payload.getUserId(), UserContext.getUserId())
                    || !isSameIdentity(payload.getTenantId(), UserContext.getTenantId())) {
                throw new ServiceException("确认令牌与当前登录身份不匹配，请重新分析后再执行", 403);
            }
            HotUpdateRequest confirmedRequest = copyRequest(payload.getRequest());
            confirmedRequest.setConfirmToken(request.getConfirmToken());
            confirmedRequest.setDryRun(false);
            return confirmedRequest;
        } catch (ServiceException e) {
            throw e;
        } catch (Exception e) {
            throw new ServiceException("确认令牌无效，请重新分析后再执行", 400);
        }
    }

    private HotUpdateRequest copyRequest(HotUpdateRequest request) {
        HotUpdateRequest copy = new HotUpdateRequest();
        copy.setProcessKey(request.getProcessKey());
        copy.setTargetVersion(request.getTargetVersion());
        copy.setMigrationMode(request.getMigrationMode());
        copy.setConfirmToken(request.getConfirmToken());
        copy.setDryRun(request.isDryRun());
        if (request.getInstanceIds() != null) {
            copy.setInstanceIds(new ArrayList<>(request.getInstanceIds()));
        }
        return copy;
    }

    private boolean isSameIdentity(Long expected, Long actual) {
        if (expected == null) {
            return actual == null;
        }
        return expected.equals(actual);
    }

    private String buildPrepareAuditDetail(HotUpdateRequest request, HotUpdateResult result) {
        return String.format(
                "mode=%s,targetVersion=%s,total=%d,migrated=%d,skipped=%d,failed=%d,ttl=%ds",
                request.getMigrationMode(),
                request.getTargetVersion(),
                result.getTotalInstances(),
                result.getMigratedCount(),
                result.getSkippedCount(),
                result.getFailedCount(),
                CONFIRM_TOKEN_TTL_SECONDS
        );
    }

    private String buildExecuteAuditDetail(HotUpdateRequest request, HotUpdateResult result) {
        return String.format(
                "mode=%s,targetVersion=%s,total=%d,migrated=%d,skipped=%d,failed=%d",
                request.getMigrationMode(),
                request.getTargetVersion(),
                result.getTotalInstances(),
                result.getMigratedCount(),
                result.getSkippedCount(),
                result.getFailedCount()
        );
    }

    @Data
    private static class HotUpdateConfirmPayload {
        private HotUpdateRequest request;
        private Long userId;
        private Long tenantId;
        private LocalDateTime preparedAt;
    }
}
