package com.cloudflow.workflow.handler.impl;

import com.cloudflow.workflow.domain.WfNodeConfig;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.handler.INodeHandler;
import com.cloudflow.workflow.service.IProcessCopyService;
import com.cloudflow.workflow.strategy.AssignUserStrategyFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 抄送节点处理器。
 * 仅保留 nodes+edges 主模型字段：approverType/approverValue。
 */
@Component
@RequiredArgsConstructor
public class CopyNodeHandler implements INodeHandler {

    private static final Logger log = LoggerFactory.getLogger(CopyNodeHandler.class);

    private final IProcessCopyService processCopyService;
    private final AssignUserStrategyFactory assignUserStrategyFactory;
    private final ObjectMapper objectMapper;

    @Override
    public String getNodeType() {
        return "COPY";
    }

    @Override
    public boolean handle(WfNodeConfig node, WfProcessInstance instance, Map<String, Object> variables) {
        try {
            log.info("[CopyNodeHandler] 执行抄送节点, nodeKey={}, instanceId={}", node.getId(), instance.getInstanceId());

            Set<Long> copyUserIdSet = new LinkedHashSet<>();
            if (StringUtils.hasText(node.getApproverType())) {
                List<Long> resolved = assignUserStrategyFactory.resolveMultiple(node, instance);
                if (resolved != null) {
                    copyUserIdSet.addAll(resolved);
                }
            }

            List<Long> copyUserIds = new ArrayList<>(copyUserIdSet);
            if (copyUserIds.isEmpty()) {
                log.info("[CopyNodeHandler] 未解析到抄送人, nodeKey={}, approverType={}, approverValue={}",
                        node.getId(), node.getApproverType(), node.getApproverValue());
                return true;
            }

            String formData = null;
            if (variables != null && !variables.isEmpty()) {
                try {
                    formData = objectMapper.writeValueAsString(variables);
                } catch (Exception e) {
                    log.warn("[CopyNodeHandler] 序列化表单数据失败: {}", e.getMessage());
                }
            }

            processCopyService.createCopyRecords(
                    instance.getInstanceId(),
                    instance.getProcessDefKey(),
                    instance.getTitle(),
                    node.getId(),
                    node.getTitle(),
                    instance.getStartUserId(),
                    instance.getStartUserName(),
                    copyUserIds,
                    formData
            );

            log.info("[CopyNodeHandler] 抄送完成, nodeKey={}, 抄送人数={}", node.getId(), copyUserIds.size());
        } catch (Exception e) {
            log.error("[CopyNodeHandler] 抄送节点执行失败, nodeKey={}: {}", node.getId(), e.getMessage(), e);
            // 抄送失败不阻断流程
        }
        return true;
    }
}