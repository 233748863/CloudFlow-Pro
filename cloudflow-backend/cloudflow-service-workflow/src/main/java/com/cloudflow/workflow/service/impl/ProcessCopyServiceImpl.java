package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.workflow.domain.WfProcessCopy;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.WfProcessCopyMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.IProcessCopyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 流程抄送服务实现
 * 借鉴 poco-flow CopyServiceTask 的设计，适配 CloudFlow Pro 自研引擎
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProcessCopyServiceImpl implements IProcessCopyService {

    private final WfProcessCopyMapper processCopyMapper;
    private final WfProcessInstanceMapper processInstanceMapper;
    private final WfProcessDefinitionMapper processDefinitionMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void createCopyRecords(String instanceId, String processDefKey, String title,
                                  String nodeId, String nodeName,
                                  Long startUserId, String startUserName,
                                  List<Long> userIds, String formData) {
        if (userIds == null || userIds.isEmpty()) {
            log.warn("[createCopyRecords] 抄送人列表为空, instanceId={}, nodeId={}", instanceId, nodeId);
            return;
        }

        // 去重：同一个流程实例的同一个节点，不重复抄送同一个人
        Set<Long> uniqueUserIds = new LinkedHashSet<>(userIds);
        // 排除发起人自己（抄送给自己没有意义）
        uniqueUserIds.remove(startUserId);

        if (uniqueUserIds.isEmpty()) {
            log.info("[createCopyRecords] 去重后抄送人列表为空, instanceId={}, nodeId={}", instanceId, nodeId);
            return;
        }

        Long tenantId = UserContext.getTenantId();
        LocalDateTime now = LocalDateTime.now();

        for (Long userId : uniqueUserIds) {
            WfProcessCopy copy = new WfProcessCopy();
            copy.setTenantId(tenantId);
            copy.setInstanceId(instanceId);
            copy.setProcessDefKey(processDefKey);
            copy.setTitle(title);
            copy.setNodeId(nodeId);
            copy.setNodeName(nodeName);
            copy.setStartUserId(startUserId);
            copy.setStartUserName(startUserName);
            copy.setUserId(userId);
            copy.setFormData(formData);
            copy.setIsRead(0);
            copy.setCreateTime(now);
            processCopyMapper.insert(copy);
        }

        log.info("[createCopyRecords] 抄送记录创建成功, instanceId={}, nodeId={}, 抄送人数={}",
                instanceId, nodeId, uniqueUserIds.size());
    }

    @Override
    public PageResult<WfProcessCopy> getMyCopyList(Long userId, PageQuery pageQuery) {
        log.info("[getMyCopyList] 查询抄送列表, userId={}, pageNum={}, pageSize={}",
                userId, pageQuery.getPageNum(), pageQuery.getPageSize());

        Page<WfProcessCopy> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfProcessCopy> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfProcessCopy::getUserId, userId);
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            wrapper.eq(WfProcessCopy::getTenantId, tenantId);
        }

        // 关键字搜索（按流程标题模糊匹配）
        String keyword = (String) pageQuery.getParams().get("keyword");
        if (StringUtils.hasText(keyword)) {
            wrapper.like(WfProcessCopy::getTitle, keyword);
        }

        // 已读状态筛选
        String isRead = (String) pageQuery.getParams().get("isRead");
        if (StringUtils.hasText(isRead)) {
            wrapper.eq(WfProcessCopy::getIsRead, Integer.parseInt(isRead));
        }

        // 流程类型筛选
        String processDefKey = (String) pageQuery.getParams().get("processDefKey");
        if (StringUtils.hasText(processDefKey)) {
            wrapper.eq(WfProcessCopy::getProcessDefKey, processDefKey);
        }

        wrapper.orderByDesc(WfProcessCopy::getCreateTime);

        Page<WfProcessCopy> resultPage = processCopyMapper.selectPage(page, wrapper);
        List<WfProcessCopy> records = resultPage.getRecords();

        // 批量填充关联信息（流程名称、流程状态）
        if (records != null && !records.isEmpty()) {
            enrichCopyRecords(records);
        }

        return new PageResult<>(records, resultPage.getTotal(), resultPage.getCurrent(), resultPage.getSize());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markAsRead(Long copyId, Long userId) {
        WfProcessCopy copy = processCopyMapper.selectById(copyId);
        if (copy == null) {
            log.warn("[markAsRead] 抄送记录不存在, copyId={}", copyId);
            return;
        }
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, copy.getTenantId())) {
            log.warn("[markAsRead] 租户不匹配, copyId={}, currentTenantId={}, copyTenantId={}",
                    copyId, currentTenantId, copy.getTenantId());
            return;
        }
        // 校验：只有抄送接收人才能标记已读
        if (!Objects.equals(copy.getUserId(), userId)) {
            log.warn("[markAsRead] 非抄送接收人, copyId={}, userId={}, ownerId={}", copyId, userId, copy.getUserId());
            return;
        }
        if (copy.getIsRead() == 1) {
            return; // 已经是已读状态
        }

        copy.setIsRead(1);
        copy.setReadTime(LocalDateTime.now());
        processCopyMapper.updateById(copy);
        log.debug("[markAsRead] 标记已读成功, copyId={}", copyId);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void batchMarkAsRead(List<Long> copyIds, Long userId) {
        if (copyIds == null || copyIds.isEmpty()) {
            return;
        }
        Long tenantId = UserContext.getTenantId();
        LambdaUpdateWrapper<WfProcessCopy> updateWrapper = new LambdaUpdateWrapper<WfProcessCopy>()
                .in(WfProcessCopy::getId, copyIds)
                .eq(WfProcessCopy::getUserId, userId)
                .eq(WfProcessCopy::getIsRead, 0)
                .set(WfProcessCopy::getIsRead, 1)
                .set(WfProcessCopy::getReadTime, LocalDateTime.now());
        if (tenantId != null) {
            updateWrapper.eq(WfProcessCopy::getTenantId, tenantId);
        }
        processCopyMapper.update(null, updateWrapper);
        log.info("[batchMarkAsRead] 批量标记已读, userId={}, count={}", userId, copyIds.size());
    }

    @Override
    public int getUnreadCount(Long userId) {
        Long tenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfProcessCopy> queryWrapper = new LambdaQueryWrapper<WfProcessCopy>()
                .eq(WfProcessCopy::getUserId, userId)
                .eq(WfProcessCopy::getIsRead, 0);
        if (tenantId != null) {
            queryWrapper.eq(WfProcessCopy::getTenantId, tenantId);
        }
        Long count = processCopyMapper.selectCount(queryWrapper);
        return count != null ? count.intValue() : 0;
    }

    /**
     * 批量填充抄送记录的关联信息（流程名称、流程状态）
     * 使用批量查询避免 N+1 问题
     */
    private void enrichCopyRecords(List<WfProcessCopy> records) {
        Long tenantId = UserContext.getTenantId();

        // 收集所有 instanceId 和 processDefKey
        List<String> instanceIds = records.stream()
                .map(WfProcessCopy::getInstanceId)
                .distinct()
                .collect(Collectors.toList());

        List<String> processKeys = records.stream()
                .map(WfProcessCopy::getProcessDefKey)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());

        // 批量查询流程实例（获取状态）
        Map<String, WfProcessInstance> instanceMap = new HashMap<>();
        if (!instanceIds.isEmpty()) {
            LambdaQueryWrapper<WfProcessInstance> instanceQuery = new LambdaQueryWrapper<WfProcessInstance>()
                    .in(WfProcessInstance::getInstanceId, instanceIds);
            if (tenantId != null) {
                instanceQuery.eq(WfProcessInstance::getTenantId, tenantId);
            }
            List<WfProcessInstance> instances = processInstanceMapper.selectList(instanceQuery);
            for (WfProcessInstance inst : instances) {
                instanceMap.put(inst.getInstanceId(), inst);
            }
        }

        // 优先按实例 definitionId 批量查询流程定义，确保抄送记录显示的是实例启动时版本
        Map<String, String> processNameByDefinitionId = new HashMap<>();
        List<String> definitionIds = instanceMap.values().stream()
                .map(WfProcessInstance::getDefinitionId)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (!definitionIds.isEmpty()) {
            LambdaQueryWrapper<WfProcessDefinition> definitionIdQuery = new LambdaQueryWrapper<WfProcessDefinition>()
                    .in(WfProcessDefinition::getDefinitionId, definitionIds);
            if (tenantId != null) {
                definitionIdQuery.eq(WfProcessDefinition::getTenantId, tenantId);
            }
            List<WfProcessDefinition> definitionsById = processDefinitionMapper.selectList(definitionIdQuery);
            for (WfProcessDefinition def : definitionsById) {
                if (def != null && StringUtils.hasText(def.getDefinitionId())) {
                    processNameByDefinitionId.put(def.getDefinitionId(), def.getProcessName());
                }
            }
        }

        // 兼容历史实例（definitionId 为空）回退按 processKey 取最新版本
        Map<String, String> processNameByKey = new HashMap<>();
        if (!processKeys.isEmpty()) {
            LambdaQueryWrapper<WfProcessDefinition> processKeyQuery = new LambdaQueryWrapper<WfProcessDefinition>()
                    .in(WfProcessDefinition::getProcessKey, processKeys)
                    .and(w -> w.ne(WfProcessDefinition::getStatus, "DRAFT")
                            .or()
                            .isNull(WfProcessDefinition::getStatus))
                    .orderByDesc(WfProcessDefinition::getVersion);
            if (tenantId != null) {
                processKeyQuery.eq(WfProcessDefinition::getTenantId, tenantId);
            }
            List<WfProcessDefinition> definitions = processDefinitionMapper.selectList(processKeyQuery);
            for (WfProcessDefinition def : definitions) {
                processNameByKey.putIfAbsent(def.getProcessKey(), def.getProcessName());
            }
        }

        // 填充
        for (WfProcessCopy copy : records) {
            WfProcessInstance inst = instanceMap.get(copy.getInstanceId());
            if (inst != null) {
                copy.setProcessStatus(inst.getStatus());
                String processName = processNameByDefinitionId.get(inst.getDefinitionId());
                if (StringUtils.hasText(processName)) {
                    copy.setProcessName(processName);
                    continue;
                }
            }
            String processName = processNameByKey.get(copy.getProcessDefKey());
            if (processName != null) {
                copy.setProcessName(processName);
            }
        }
    }
}
