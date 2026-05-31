package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.WfTaskCandidate;
import com.cloudflow.workflow.domain.vo.TaskDetailVO;
import com.cloudflow.workflow.domain.vo.ProcessInstanceVO;
import com.cloudflow.workflow.domain.vo.UserBriefVO;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.service.IWorkflowBatchService;
import com.cloudflow.workflow.service.remote.RemoteUserService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 工作流批量查询服务实现
 * 通过批量查询优化性能，减少数据库查询次数
 * 
 * @author CloudFlow Team
 * @since 2026-02-21
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowBatchServiceImpl implements IWorkflowBatchService {

    private final WfTaskMapper taskMapper;
    private final WfProcessInstanceMapper instanceMapper;
    private final WfTaskCandidateMapper candidateMapper;
    private final WfTaskHistoryMapper historyMapper;
    private final RemoteUserService remoteUserService;

    /**
     * 批量查询任务详情
     * 一次性查询所有任务的基本信息、候选人信息
     */
    @Override
    public List<TaskDetailVO> batchGetTaskDetails(List<String> taskIds) {
        if (CollectionUtils.isEmpty(taskIds)) {
            return Collections.emptyList();
        }

        log.debug("批量查询任务详情, taskIds数量: {}", taskIds.size());
        long startTime = System.currentTimeMillis();

        try {
            // 1. 批量查询任务基本信息
            List<TaskDetailVO> tasks = taskMapper.selectBatchByIds(taskIds);
            if (CollectionUtils.isEmpty(tasks)) {
                return Collections.emptyList();
            }

            // 2. 批量查询候选人信息
            Map<String, List<Long>> candidatesMap = batchGetTaskCandidates(taskIds);

            // 3. 组装数据
            tasks.forEach(task -> {
                List<Long> candidates = candidatesMap.get(task.getTaskId());
                if (!CollectionUtils.isEmpty(candidates)) {
                    task.setCandidateUserIds(candidates);
                }
            });

            long duration = System.currentTimeMillis() - startTime;
            log.debug("批量查询任务详情完成, 耗时: {}ms, 任务数: {}", duration, tasks.size());

            return tasks;
        } catch (Exception e) {
            log.error("批量查询任务详情失败", e);
            throw new RuntimeException("批量查询任务详情失败", e);
        }
    }

    /**
     * 批量查询流程实例
     * 一次性查询所有实例的基本信息和流程定义信息
     */
    @Override
    public List<ProcessInstanceVO> batchGetInstances(List<String> instanceIds) {
        if (CollectionUtils.isEmpty(instanceIds)) {
            return Collections.emptyList();
        }

        log.debug("批量查询流程实例, instanceIds数量: {}", instanceIds.size());
        long startTime = System.currentTimeMillis();

        try {
            // 批量查询实例信息（包含关联的流程定义信息）
            List<ProcessInstanceVO> instances = instanceMapper.selectBatchWithDefinition(instanceIds);

            long duration = System.currentTimeMillis() - startTime;
            log.debug("批量查询流程实例完成, 耗时: {}ms, 实例数: {}", duration, instances.size());

            return instances;
        } catch (Exception e) {
            log.error("批量查询流程实例失败", e);
            throw new RuntimeException("批量查询流程实例失败", e);
        }
    }

    /**
     * 批量查询用户信息
     * 返回Map便于快速查找
     */
    @Override
    public Map<Long, UserBriefVO> batchGetUsers(Set<Long> userIds) {
        if (CollectionUtils.isEmpty(userIds)) {
            return Collections.emptyMap();
        }

        log.debug("批量查询用户信息, userIds数量: {}", userIds.size());
        long startTime = System.currentTimeMillis();

        try {
            // 调用cloudflow-auth模块的用户服务批量查询
            R<List<Map<String, Object>>> result = remoteUserService.batchGetUsers(new ArrayList<>(userIds));
            
            if (result.getCode() != 200 || CollectionUtils.isEmpty(result.getData())) {
                log.warn("批量查询用户信息失败或返回空: {}", result.getMsg());
                return Collections.emptyMap();
            }
            
            // 转换为UserBriefVO
            Map<Long, UserBriefVO> userMap = result.getData().stream()
                .collect(Collectors.toMap(
                    user -> ((Number) user.get("userId")).longValue(),
                    this::convertMapToUserBriefVO
                ));

            long duration = System.currentTimeMillis() - startTime;
            log.debug("批量查询用户信息完成, 耗时: {}ms, 用户数: {}", duration, userMap.size());

            return userMap;
        } catch (Exception e) {
            log.error("批量查询用户信息失败", e);
            return Collections.emptyMap();
        }
    }

    /**
     * 批量查询任务候选人
     * 返回Map便于快速查找
     */
    @Override
    public Map<String, List<Long>> batchGetTaskCandidates(List<String> taskIds) {
        if (CollectionUtils.isEmpty(taskIds)) {
            return Collections.emptyMap();
        }

        log.debug("批量查询任务候选人, taskIds数量: {}", taskIds.size());
        long startTime = System.currentTimeMillis();

        try {
            // 批量查询候选人
            List<WfTaskCandidate> candidates = candidateMapper.selectBatchByTaskIds(taskIds);

            // 按taskId分组
            Map<String, List<Long>> candidatesMap = candidates.stream()
                .collect(Collectors.groupingBy(
                    c -> c.getTaskId(),
                    Collectors.mapping(
                        c -> c.getUserId(),
                        Collectors.toList()
                    )
                ));

            long duration = System.currentTimeMillis() - startTime;
            log.debug("批量查询任务候选人完成, 耗时: {}ms, 任务数: {}", duration, candidatesMap.size());

            return candidatesMap;
        } catch (Exception e) {
            log.error("批量查询任务候选人失败", e);
            throw new RuntimeException("批量查询任务候选人失败", e);
        }
    }

    /**
     * 批量查询任务审批历史
     * 返回Map便于快速查找
     */
    @Override
    public Map<String, List<TaskDetailVO>> batchGetTaskHistory(List<String> instanceIds) {
        if (CollectionUtils.isEmpty(instanceIds)) {
            return Collections.emptyMap();
        }

        log.debug("批量查询任务审批历史, instanceIds数量: {}", instanceIds.size());
        long startTime = System.currentTimeMillis();

        try {
            // 批量查询历史任务
            List<TaskDetailVO> historyTasks = historyMapper.selectBatchByInstanceIds(instanceIds);

            // 按instanceId分组
            Map<String, List<TaskDetailVO>> historyMap = historyTasks.stream()
                .collect(Collectors.groupingBy(TaskDetailVO::getInstanceId));

            long duration = System.currentTimeMillis() - startTime;
            log.debug("批量查询任务审批历史完成, 耗时: {}ms, 实例数: {}", duration, historyMap.size());

            return historyMap;
        } catch (Exception e) {
            log.error("批量查询任务审批历史失败", e);
            throw new RuntimeException("批量查询任务审批历史失败", e);
        }
    }

    /**
     * 将Map转换为UserBriefVO
     */
    private UserBriefVO convertMapToUserBriefVO(Map<String, Object> userMap) {
        UserBriefVO vo = new UserBriefVO();
        vo.setUserId(((Number) userMap.get("userId")).longValue());
        vo.setUsername((String) userMap.get("userName"));
        vo.setNickName((String) userMap.get("nickName"));
        
        Object deptId = userMap.get("deptId");
        if (deptId != null) {
            vo.setDeptId(((Number) deptId).longValue());
        }
        
        vo.setEmail((String) userMap.get("email"));
        vo.setPhonenumber((String) userMap.get("phonenumber"));
        return vo;
    }
}
