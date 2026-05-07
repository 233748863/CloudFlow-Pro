package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
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
import com.fasterxml.jackson.databind.ObjectMapper;
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
    private ObjectMapper objectMapper;

    private static final String HOT_UPDATE_LOCK_PREFIX = "WORKFLOW:HOT_UPDATE:";

    @Override
    @Transactional(rollbackFor = Exception.class)
    public HotUpdateResult analyzeOrExecute(HotUpdateRequest request) {
        HotUpdateResult result = new HotUpdateResult();

        if (!StringUtils.hasText(request.getProcessKey())) {
            result.setSuccess(false);
            result.setMessage("processKey 不能为空");
            return result;
        }

        if (!StringUtils.hasText(request.getMigrationMode())) {
            request.setMigrationMode("COMPATIBLE");
        }

        WfProcessDefinition targetDef = resolveTargetDefinition(request);
        if (targetDef == null) {
            result.setSuccess(false);
            result.setMessage("目标版本流程定义不存在或未发布");
            return result;
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

        List<WfProcessInstance> runningInstances = findRunningInstances(request, targetDef.getDefinitionId());
        if (runningInstances.isEmpty()) {
            result.setSuccess(true);
            result.setTotalInstances(0);
            result.setMessage("没有需要迁移的运行中实例");
            return result;
        }

        result.setTotalInstances(runningInstances.size());
        result.setToVersion(targetDef.getVersion() != null ? targetDef.getVersion() : 0);

        int migrated = 0, skipped = 0, failed = 0;
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

            switch (request.getMigrationMode()) {
                case "COMPATIBLE":
                    if (compatible) {
                        if (!request.isDryRun()) {
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
                        if (!request.isDryRun()) {
                            migrateInstance(instance, targetDef);
                        }
                        detail.setStatus("MIGRATED");
                        migrated++;
                    } else {
                        if (!request.isDryRun()) {
                            terminateInstance(instance, "HOT_UPDATE_INCOMPATIBLE");
                        }
                        detail.setStatus("FAILED");
                        detail.setReason("强制模式：节点 [" + currentNodeKey + "] 不兼容，实例已终止");
                        failed++;
                    }
                    break;

                case "RESTART":
                    if (!request.isDryRun()) {
                        terminateInstance(instance, "HOT_UPDATE_RESTART");
                    }
                    detail.setStatus("RESTARTED");
                    detail.setReason("重启模式：旧实例已终止，需手动用新版本重新发起");
                    migrated++;
                    break;

                default:
                    detail.setStatus("SKIPPED");
                    detail.setReason("未知迁移模式: " + request.getMigrationMode());
                    skipped++;
            }

            details.add(detail);
        }

        result.setMigratedCount(migrated);
        result.setSkippedCount(skipped);
        result.setFailedCount(failed);
        result.setDetails(details);
        result.setSuccess(true);
        result.setMessage(request.isDryRun() ? "分析完成（未执行）" : "热更新执行完成");

        if (!request.isDryRun()) {
            saveRecord(request, result);
        }

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
}
