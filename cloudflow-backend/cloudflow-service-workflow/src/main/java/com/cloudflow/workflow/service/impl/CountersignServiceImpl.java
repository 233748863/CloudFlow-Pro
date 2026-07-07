package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.service.ICountersignService;
import com.cloudflow.common.audit.annotation.Audit;

import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.vo.DynamicMapVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.service.monitor.IProcessMonitorService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * 会签服务实现类
 * 支持 ALL（全部通过）、ANY（任一通过）、PERCENT（按比例通过）、SEQUENTIAL（顺序签署）四种模式
 * 使用 Redisson 分布式锁保证并发安全
 *
 * 顺序签署模式（SEQUENTIAL）：
 * - 按照 assigneeOrder 中的顺序，逐个创建审批任务
 * - 前一个人通过后，才给下一个人创建任务
 * - 任何一个人拒绝，整个会签立即结束（REJECTED）
 * - 所有人按顺序全部通过后，会签结束（PASSED）
 */
@Service
public class CountersignServiceImpl implements ICountersignService {

    private static final Logger log = LoggerFactory.getLogger(CountersignServiceImpl.class);

    /** 分布式锁前缀 */
    private static final String LOCK_PREFIX = "lock:countersign:";

    @Autowired
    private WfCountersignTaskMapper countersignTaskMapper;

    @Autowired
    private WfCountersignVoteMapper countersignVoteMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private TaskMonitorMapper taskMonitorMapper;

    @Autowired
    private IProcessMonitorService processMonitorService;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private RedissonClient redissonClient;

    @Autowired
    private WorkflowProperties workflowProperties;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private com.cloudflow.workflow.service.ISysNoticeService sysNoticeService;

    @Autowired
    private com.cloudflow.workflow.job.TaskReminderJob taskReminderJob;

    /**
     * 创建会签任务
     * 
     * @param instanceId  流程实例ID
     * @param nodeKey     节点Key
     * @param nodeName    节点名称
     * @param signType    会签类型: ALL / ANY / PERCENT
     * @param passPercent 通过比例（仅 PERCENT 类型有效）
     * @param assigneeIds 参与人ID列表
     * @return 会签任务ID
     */
    @Transactional(rollbackFor = Exception.class)
    public String createCountersignTask(String instanceId, String nodeKey, String nodeName,
                                         String signType, Integer passPercent, List<Long> assigneeIds) {
        log.info("[createCountersignTask] 创建会签任务, instanceId={}, nodeKey={}, signType={}, assignees={}",
                instanceId, nodeKey, signType, assigneeIds == null ? 0 : assigneeIds.size());

        if (assigneeIds == null || assigneeIds.isEmpty()) {
            throw WorkflowException.validationError("会签参与人不能为空");
        }

        // 校验会签类型
        if (!"ALL".equals(signType) && !"ANY".equals(signType) && !"PERCENT".equals(signType) && !"SEQUENTIAL".equals(signType)) {
            throw WorkflowException.validationError("无效的会签类型: " + signType + "，支持: ALL/ANY/PERCENT/SEQUENTIAL");
        }

        if ("PERCENT".equals(signType) && (passPercent == null || passPercent < 1 || passPercent > 100)) {
            throw WorkflowException.validationError("PERCENT 类型的通过比例必须在 1-100 之间");
        }

        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) {
            throw WorkflowException.instanceNotFound(instanceId);
        }

        // 1. 创建会签主记录
        WfCountersignTask csTask = new WfCountersignTask();
        csTask.setCountersignId(UUID.randomUUID().toString());
        csTask.setTenantId(instance.getTenantId());
        csTask.setInstanceId(instanceId);
        csTask.setNodeKey(nodeKey);
        csTask.setNodeName(nodeName);
        csTask.setSignType(signType);
        csTask.setPassPercent(passPercent != null ? passPercent : ("ALL".equals(signType) ? 100 : 50));
        csTask.setTotalCount(assigneeIds.size());
        csTask.setVotedCount(0);
        csTask.setApproveCount(0);
        csTask.setRejectCount(0);
        csTask.setStatus("VOTING");
        csTask.setCreateTime(LocalDateTime.now());

        // 顺序签署模式：存储有序审批人列表和当前索引
        if ("SEQUENTIAL".equals(signType)) {
            try {
                csTask.setAssigneeOrder(objectMapper.writeValueAsString(assigneeIds));
            } catch (Exception e) {
                throw WorkflowException.validationError("序列化审批人列表失败: " + e.getMessage());
            }
            csTask.setCurrentIndex(0);
        }

        countersignTaskMapper.insert(csTask);

        // 2. 创建审批任务
        if ("SEQUENTIAL".equals(signType)) {
            // 顺序签署：只为第一个人创建任务
            Long firstAssignee = assigneeIds.get(0);
            WfTask task = buildCountersignTask(instance, csTask, firstAssignee,
                    nodeName + " (顺序签署 1/" + assigneeIds.size() + ")");
            taskMapper.insert(task);
            createTaskMonitor(instance, task);

            log.info("[createCountersignTask] 顺序签署任务创建成功, countersignId={}, 第1个签署人={}, 共{}人",
                    csTask.getCountersignId(), firstAssignee, assigneeIds.size());
        } else {
            // ALL/ANY/PERCENT：为每个参与人同时创建独立的任务
            for (Long assigneeId : assigneeIds) {
                WfTask task = buildCountersignTask(instance, csTask, assigneeId, nodeName + " (会签)");
                taskMapper.insert(task);
                createTaskMonitor(instance, task);
            }

            log.info("[createCountersignTask] 会签任务创建成功, countersignId={}, totalCount={}",
                    csTask.getCountersignId(), assigneeIds.size());
        }
        return csTask.getCountersignId();
    }

    /**
     * 会签投票 - 核心并发控制方法
     * 
     * 使用分布式锁确保同一会签任务的投票操作串行化，
     * 防止并发投票导致的计数错误和重复判定。
     * 
     * @param taskId     任务ID
     * @param voterId    投票人ID
     * @param voterName  投票人名称
     * @param voteResult 投票结果: APPROVE / REJECT
     * @param comment    投票意见
     * @return 会签结果: VOTING(继续投票) / PASSED(通过) / REJECTED(拒绝)
     */
    @Transactional(rollbackFor = Exception.class)
    public String vote(String taskId, Long voterId, String voterName, String voteResult, String comment) {
        log.info("[vote] 会签投票, taskId={}, voterId={}, voteResult={}", taskId, voterId, voteResult);

        // 1. 校验参数
        if (!"APPROVE".equals(voteResult) && !"REJECT".equals(voteResult)) {
            throw WorkflowException.validationError("无效的投票结果: " + voteResult + "，支持: APPROVE/REJECT");
        }

        // 2. 查询任务，获取会签ID
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) {
            throw WorkflowException.taskNotFound(taskId);
        }

        String candidateRoles = task.getCandidateRoles();
        if (candidateRoles == null || !candidateRoles.startsWith("CS:")) {
            throw WorkflowException.validationError("该任务不是会签任务");
        }

        String countersignId = candidateRoles.substring(3);

        // 3. 使用分布式锁保证投票原子性
        String lockKey = LOCK_PREFIX + countersignId;
        RLock lock = redissonClient.getLock(lockKey);

        try {
            // 从配置读取锁等待时间（sys.workflow.lock.countersignWait）；
            // 不设 leaseTime，走 Redisson watchdog 自动续期，避免计票耗时超过租期导致锁提前失效。
            // completeTask 外层已持有同一把锁时此处为可重入加锁。
            long waitSeconds = workflowProperties.getLock().getCountersignWait();
            if (!lock.tryLock(waitSeconds, TimeUnit.SECONDS)) {
                throw WorkflowException.invalidState("会签投票繁忙，请稍后重试");
            }

            // === 锁内操作开始 ===

            // 4. 重新查询会签任务（锁内查询确保数据最新）
            WfCountersignTask csTask = countersignTaskMapper.selectById(countersignId);
            if (csTask == null) {
                throw WorkflowException.validationError("会签任务不存在: " + countersignId);
            }

            // 5. 检查会签是否已结束
            if (!"VOTING".equals(csTask.getStatus())) {
                log.warn("[vote] 会签已结束, countersignId={}, status={}", countersignId, csTask.getStatus());
                // 会签已结束，删除当前任务
                completeTaskMonitor(task, LocalDateTime.now(), "COUNTERSIGN_CLOSED");
                taskMapper.deleteById(taskId);
                return csTask.getStatus();
            }

            // 6. 检查是否重复投票
            Long existingVoteCount = countersignVoteMapper.selectCount(
                new LambdaQueryWrapper<WfCountersignVote>()
                    .eq(WfCountersignVote::getCountersignId, countersignId)
                    .eq(WfCountersignVote::getVoterId, voterId)
            );
            if (existingVoteCount != null && existingVoteCount > 0) {
                throw WorkflowException.invalidState("您已经投过票了，不能重复投票");
            }

            // 7. 记录投票（B6: uk(countersign_id, voter_id) 为锁失效场景的最后防线，冲突即重复投票）
            WfCountersignVote vote = new WfCountersignVote();
            vote.setVoteId(UUID.randomUUID().toString());
            vote.setTenantId(csTask.getTenantId() != null ? csTask.getTenantId() : task.getTenantId());
            vote.setCountersignId(countersignId);
            vote.setTaskId(taskId);
            vote.setVoterId(voterId);
            vote.setVoterName(voterName);
            vote.setVoteResult(voteResult);
            vote.setComment(comment);
            vote.setVoteTime(LocalDateTime.now());
            try {
                countersignVoteMapper.insert(vote);
            } catch (org.springframework.dao.DuplicateKeyException e) {
                throw WorkflowException.invalidState("您已经投过票了，不能重复投票");
            }

            // 8. 更新会签计数（CAS 语义：基于当前值更新）
            csTask.setVotedCount(csTask.getVotedCount() + 1);
            if ("APPROVE".equals(voteResult)) {
                csTask.setApproveCount(csTask.getApproveCount() + 1);
            } else {
                csTask.setRejectCount(csTask.getRejectCount() + 1);
            }

            // 9. 判定会签结果
            String result = evaluateCountersignResult(csTask);
            csTask.setStatus(result);

            if (!"VOTING".equals(result)) {
                csTask.setCompleteTime(LocalDateTime.now());
                log.info("[vote] 会签结束, countersignId={}, result={}, approve={}/{}, reject={}/{}",
                        countersignId, result, csTask.getApproveCount(), csTask.getTotalCount(),
                        csTask.getRejectCount(), csTask.getTotalCount());
            }

            countersignTaskMapper.updateById(csTask);

            // P2修复: 取消任务提醒
            try {
                taskReminderJob.cancelReminders(taskId);
            } catch (Exception e) {
                log.warn("[vote] 取消任务提醒失败, taskId={}: {}", taskId, e.getMessage());
            }

            // 10. 删除当前投票人的任务
            completeTaskMonitor(task, vote.getVoteTime(), "COUNTERSIGN_" + voteResult);
            taskMapper.deleteById(taskId);

            // 11. 顺序签署模式：如果仍在投票中，为下一个人创建任务
            if ("VOTING".equals(result) && "SEQUENTIAL".equals(csTask.getSignType())) {
                advanceToNextSequentialAssignee(csTask);
            }

            // 12. 如果会签已结束，清理剩余未投票的任务
            if (!"VOTING".equals(result)) {
                cleanupRemainingTasks(countersignId);
            }

            // === 锁内操作结束 ===

            log.info("[vote] 投票成功, countersignId={}, voterId={}, result={}, voted={}/{}",
                    countersignId, voterId, voteResult, csTask.getVotedCount(), csTask.getTotalCount());
            return result;

        } catch (WorkflowException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new WorkflowException("SYSTEM_BUSY", "系统繁忙，请稍后重试");
        } catch (Exception e) {
            log.error("[vote] 会签投票异常, taskId={}, error={}", taskId, e.getMessage(), e);
            throw new WorkflowException("VOTE_FAILED", "投票失败: " + e.getMessage(), e);
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    /**
     * 评估会签结果
     * 
     * 根据会签类型和当前投票情况判定结果：
     * - ALL：所有人都投了且全部同意 → PASSED；有一人拒绝 → REJECTED
     * - ANY：有一人同意 → PASSED；所有人都拒绝 → REJECTED
     * - PERCENT：同意比例 >= passPercent → PASSED；剩余人全投也无法达到比例 → REJECTED
     * 
     * @param csTask 会签任务
     * @return VOTING / PASSED / REJECTED
     */
    private String evaluateCountersignResult(WfCountersignTask csTask) {
        int total = csTask.getTotalCount();
        int voted = csTask.getVotedCount();
        int approved = csTask.getApproveCount();
        int rejected = csTask.getRejectCount();
        int remaining = total - voted;
        String signType = csTask.getSignType();

        switch (signType) {
            case "ALL":
                // 一票否决模式
                if (rejected > 0) {
                    return "REJECTED";
                }
                if (approved == total) {
                    return "PASSED";
                }
                return "VOTING";

            case "ANY":
                // 任一通过模式（或签）
                if (approved > 0) {
                    return "PASSED";
                }
                if (rejected == total) {
                    return "REJECTED";
                }
                return "VOTING";

            case "PERCENT":
                // 按比例通过模式
                int passPercent = csTask.getPassPercent();
                double currentApproveRate = (double) approved / total * 100;
                double maxPossibleApproveRate = (double) (approved + remaining) / total * 100;

                // 已达到通过比例
                if (currentApproveRate >= passPercent) {
                    return "PASSED";
                }
                // 即使剩余人全部同意也无法达到通过比例
                if (maxPossibleApproveRate < passPercent) {
                    return "REJECTED";
                }
                // 所有人都投完了但未达到比例
                if (remaining == 0) {
                    return "REJECTED";
                }
                return "VOTING";

            case "SEQUENTIAL":
                // 顺序签署模式：任何一人拒绝立即结束，全部通过才算通过
                if (rejected > 0) {
                    return "REJECTED";
                }
                if (approved == total) {
                    return "PASSED";
                }
                return "VOTING";

            default:
                log.warn("[evaluateCountersignResult] 未知的会签类型: {}", signType);
                return "VOTING";
        }
    }

    /**
     * 顺序签署：推进到下一个签署人
     * 从 assigneeOrder 中取出下一个人，创建新的审批任务
     */
    private void advanceToNextSequentialAssignee(WfCountersignTask csTask) {
        try {
            List<Long> assigneeOrder = objectMapper.readValue(
                csTask.getAssigneeOrder(), new TypeReference<List<Long>>() {});

            int nextIndex = csTask.getCurrentIndex() + 1;
            if (nextIndex >= assigneeOrder.size()) {
                // 不应该走到这里（evaluateCountersignResult 应该已经判定为 PASSED）
                log.warn("[advanceToNextSequentialAssignee] 索引越界, countersignId={}, nextIndex={}, total={}",
                        csTask.getCountersignId(), nextIndex, assigneeOrder.size());
                return;
            }

            Long nextAssignee = assigneeOrder.get(nextIndex);

            // 更新当前索引
            csTask.setCurrentIndex(nextIndex);
            countersignTaskMapper.updateById(csTask);

            // 为下一个签署人创建任务
            WfProcessInstance instance = processInstanceMapper.selectById(csTask.getInstanceId());
            WfTask task = buildCountersignTask(instance, csTask, nextAssignee,
                    csTask.getNodeName().replace(" (会签)", "")
                            + " (顺序签署 " + (nextIndex + 1) + "/" + csTask.getTotalCount() + ")");
            taskMapper.insert(task);
            createTaskMonitor(instance, task);

            // 发送通知给下一个签署人
            try {
                sysNoticeService.sendNotice(
                    nextAssignee,
                    "顺序签署任务通知",
                    "您有一个新的顺序签署任务: " + csTask.getNodeName()
                        + " (第" + (nextIndex + 1) + "位，共" + csTask.getTotalCount() + "位)",
                    "1",
                    null,
                    "系统"
                );
            } catch (Exception e) {
                log.warn("[advanceToNextSequentialAssignee] 发送通知失败: {}", e.getMessage());
            }

            log.info("[advanceToNextSequentialAssignee] 顺序签署推进成功, countersignId={}, nextIndex={}, nextAssignee={}",
                    csTask.getCountersignId(), nextIndex, nextAssignee);

        } catch (Exception e) {
            log.error("[advanceToNextSequentialAssignee] 推进失败, countersignId={}: {}",
                    csTask.getCountersignId(), e.getMessage(), e);
            throw new WorkflowException("SEQUENTIAL_ADVANCE_FAILED",
                    "顺序签署推进失败: " + e.getMessage(), e);
        }
    }

    /**
     * 清理会签结束后剩余的未投票任务
     */
    private void cleanupRemainingTasks(String countersignId) {
        try {
            List<WfTask> remainingTasks = taskMapper.selectList(
                new LambdaQueryWrapper<WfTask>()
                    .eq(WfTask::getCandidateRoles, "CS:" + countersignId)
            );

            if (remainingTasks != null && !remainingTasks.isEmpty()) {
                LocalDateTime now = LocalDateTime.now();
                for (WfTask task : remainingTasks) {
                    completeTaskMonitor(task, now, "COUNTERSIGN_CANCEL");
                    taskMapper.deleteById(task.getTaskId());
                }
                log.info("[cleanupRemainingTasks] 清理剩余任务 {} 个, countersignId={}",
                        remainingTasks.size(), countersignId);
            }
        } catch (Exception e) {
            log.warn("[cleanupRemainingTasks] 清理剩余任务失败: {}", e.getMessage());
        }
    }

    /**
     * 查询会签进度
     * 
     * @param countersignId 会签任务ID
     * @return 会签进度信息
     */
    public DynamicMapVO getCountersignProgress(String countersignId) {
        WfCountersignTask csTask = countersignTaskMapper.selectById(countersignId);
        if (csTask == null) {
            throw WorkflowException.validationError("会签任务不存在: " + countersignId);
        }

        // 查询所有投票记录
        List<WfCountersignVote> votes = countersignVoteMapper.selectList(
            new LambdaQueryWrapper<WfCountersignVote>()
                .eq(WfCountersignVote::getCountersignId, countersignId)
                .orderByAsc(WfCountersignVote::getVoteTime)
        );

        Map<String, Object> progress = new HashMap<>();
        progress.put("countersignId", csTask.getCountersignId());
        progress.put("nodeKey", csTask.getNodeKey());
        progress.put("nodeName", csTask.getNodeName());
        progress.put("signType", csTask.getSignType());
        progress.put("passPercent", csTask.getPassPercent());
        progress.put("totalCount", csTask.getTotalCount());
        progress.put("votedCount", csTask.getVotedCount());
        progress.put("approveCount", csTask.getApproveCount());
        progress.put("rejectCount", csTask.getRejectCount());
        progress.put("status", csTask.getStatus());
        progress.put("createTime", csTask.getCreateTime());
        progress.put("completeTime", csTask.getCompleteTime());

        // 投票详情
        List<Map<String, Object>> voteDetails = new ArrayList<>();
        for (WfCountersignVote v : votes) {
            Map<String, Object> detail = new HashMap<>();
            detail.put("voterId", v.getVoterId());
            detail.put("voterName", v.getVoterName());
            detail.put("voteResult", v.getVoteResult());
            detail.put("comment", v.getComment());
            detail.put("voteTime", v.getVoteTime());
            voteDetails.add(detail);
        }
        progress.put("votes", voteDetails);

        // 计算通过率
        if (csTask.getTotalCount() > 0) {
            double approveRate = (double) csTask.getApproveCount() / csTask.getTotalCount() * 100;
            progress.put("approveRate", Math.round(approveRate * 100.0) / 100.0);
        }

        return DynamicMapVO.from(progress);
    }

    /**
     * 判断任务是否为会签任务
     */
    public boolean isCountersignTask(WfTask task) {
        return task != null && task.getCandidateRoles() != null 
                && task.getCandidateRoles().startsWith("CS:");
    }

    /**
     * 从任务中提取会签ID
     */
    public String extractCountersignId(WfTask task) {
        if (isCountersignTask(task)) {
            return task.getCandidateRoles().substring(3);
        }
        return null;
    }

    /**
     * 查询指定实例和节点的会签任务
     */
    public WfCountersignTask getCountersignByNode(String instanceId, String nodeKey) {
        return countersignTaskMapper.selectPage(new Page<>(1, 1, false),
            new LambdaQueryWrapper<WfCountersignTask>()
                .eq(WfCountersignTask::getInstanceId, instanceId)
                .eq(WfCountersignTask::getNodeKey, nodeKey)
                .eq(WfCountersignTask::getStatus, "VOTING"))
                .getRecords().stream().findFirst().orElse(null);
    }

    // ==================== 加签/减签辅助方法 ====================

    /**
     * 获取会签任务信息
     */
    @Override
    public WfCountersignTask getCountersignTask(String instanceId, String nodeKey) {
        return countersignTaskMapper.selectPage(new Page<>(1, 1, false),
            new LambdaQueryWrapper<WfCountersignTask>()
                .eq(WfCountersignTask::getInstanceId, instanceId)
                .eq(WfCountersignTask::getNodeKey, nodeKey)
                .orderByDesc(WfCountersignTask::getCreateTime))
                .getRecords().stream().findFirst().orElse(null);
    }

    /**
     * 更新会签任务
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "更新会签任务")
    public void updateCountersignTask(WfCountersignTask csTask) {
        if (csTask == null || csTask.getCountersignId() == null) {
            throw WorkflowException.validationError("会签任务信息不能为空");
        }
        countersignTaskMapper.updateById(csTask);
        log.info("[updateCountersignTask] 会签任务已更新, countersignId={}, totalCount={}",
                csTask.getCountersignId(), csTask.getTotalCount());
    }

    /**
     * 检查用户是否已投票
     */
    @Override
    public boolean hasUserVoted(String countersignId, Long userId) {
        if (countersignId == null || userId == null) {
            return false;
        }
        Long count = countersignVoteMapper.selectCount(
            new LambdaQueryWrapper<WfCountersignVote>()
                .eq(WfCountersignVote::getCountersignId, countersignId)
                .eq(WfCountersignVote::getVoterId, userId)
        );
        return count != null && count > 0;
    }

    /**
     * 检查并完成会签（减签后可能满足通过条件）
     * 
     * 减签后，需要重新评估会签结果：
     * - 如果减签后已满足通过条件，则自动完成会签
     * - 如果减签后无法满足通过条件，则自动拒绝会签
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void checkAndCompleteCountersign(WfCountersignTask csTask) {
        if (csTask == null) {
            return;
        }

        // 只有投票中的会签才需要检查
        if (!"VOTING".equals(csTask.getStatus())) {
            return;
        }

        log.info("[checkAndCompleteCountersign] 检查会签状态, countersignId={}, totalCount={}, votedCount={}, approveCount={}",
                csTask.getCountersignId(), csTask.getTotalCount(), csTask.getVotedCount(), csTask.getApproveCount());

        // 重新评估会签结果
        String result = evaluateCountersignResult(csTask);

        // 如果会签已经可以结束（PASSED 或 REJECTED）
        if (!"VOTING".equals(result)) {
            csTask.setStatus(result);
            csTask.setCompleteTime(LocalDateTime.now());
            countersignTaskMapper.updateById(csTask);

            // 清理剩余未投票的任务
            cleanupRemainingTasks(csTask.getCountersignId());

            log.info("[checkAndCompleteCountersign] 会签已自动完成, countersignId={}, result={}, approve={}/{}, reject={}/{}",
                    csTask.getCountersignId(), result, csTask.getApproveCount(), csTask.getTotalCount(),
                    csTask.getRejectCount(), csTask.getTotalCount());
        } else {
            log.info("[checkAndCompleteCountersign] 会签继续进行, countersignId={}, remaining={}",
                    csTask.getCountersignId(), csTask.getTotalCount() - csTask.getVotedCount());
        }
    }

    private WfTask buildCountersignTask(WfProcessInstance instance, WfCountersignTask csTask,
                                        Long assigneeId, String taskName) {
        WfTask task = new WfTask();
        task.setTaskId(UUID.randomUUID().toString());
        task.setTenantId(csTask.getTenantId() != null
                ? csTask.getTenantId()
                : (instance != null ? instance.getTenantId() : null));
        task.setInstanceId(csTask.getInstanceId());
        task.setNodeKey(csTask.getNodeKey());
        task.setNodeName(taskName);
        task.setAssignee(assigneeId);
        task.setAssigneeName(resolveUserDisplayName(assigneeId));
        task.setStatus("TODO");
        task.setCreateTime(LocalDateTime.now());
        task.setCandidateRoles("CS:" + csTask.getCountersignId());
        return task;
    }

    private void createTaskMonitor(WfProcessInstance instance, WfTask task) {
        try {
            if (instance != null) {
                processMonitorService.incrementTaskCount(instance.getInstanceId());
            }

            TaskMonitor monitor = new TaskMonitor();
            monitor.setTenantId(task.getTenantId());
            monitor.setTaskId(task.getTaskId());
            monitor.setInstanceId(task.getInstanceId());
            monitor.setNodeKey(task.getNodeKey());
            monitor.setTaskName(task.getNodeName());
            monitor.setAssigneeId(task.getAssignee());
            monitor.setAssigneeName(task.getAssigneeName());
            monitor.setCreateTimeTask(task.getCreateTime());
            monitor.setClaimTime(task.getCreateTime());
            monitor.setWaitDuration(0L);
            monitor.setHandleDuration(0L);
            monitor.setTotalDuration(0L);
            monitor.setStatus("PENDING");
            monitor.setCreateTime(task.getCreateTime());
            monitor.setUpdateTime(LocalDateTime.now());
            taskMonitorMapper.insert(monitor);
        } catch (Exception e) {
            log.warn("[createTaskMonitor] 记录会签任务监控失败, taskId={}, error={}", task.getTaskId(), e.getMessage());
        }
    }

    private void completeTaskMonitor(WfTask task, LocalDateTime completeTime, String action) {
        try {
            TaskMonitor monitor = taskMonitorMapper.selectByTaskId(task.getTaskId());
            if (monitor == null) {
                return;
            }

            LocalDateTime finishedAt = completeTime != null ? completeTime : LocalDateTime.now();
            monitor.setCompleteTime(finishedAt);
            if (monitor.getCreateTimeTask() != null) {
                long totalDuration = java.time.Duration.between(monitor.getCreateTimeTask(), finishedAt).toMillis();
                monitor.setTotalDuration(totalDuration);
                monitor.setHandleDuration(totalDuration);
            }
            monitor.setStatus("COMPLETED");
            monitor.setAction(action);
            monitor.setUpdateTime(LocalDateTime.now());
            taskMonitorMapper.updateById(monitor);
        } catch (Exception e) {
            log.warn("[completeTaskMonitor] 更新会签任务监控失败, taskId={}, error={}", task.getTaskId(), e.getMessage());
        }
    }

    private String resolveUserDisplayName(Long userId) {
        if (userId == null) {
            return null;
        }
        SysUser user = sysUserMapper.selectById(userId);
        if (user == null) {
            return null;
        }
        return org.springframework.util.StringUtils.hasText(user.getNickName())
                ? user.getNickName()
                : user.getUserName();
    }
}
