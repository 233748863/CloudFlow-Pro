package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmAssignmentRule;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmCustomerPoolLog;
import com.cloudflow.crm.domain.dto.CrmCustomerAssignDTO;
import com.cloudflow.crm.mapper.CrmAssignmentRuleMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmCustomerPoolLogMapper;
import com.cloudflow.crm.service.ICrmCustomerPoolService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.redis.lock.DistributedLock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

@Service
public class CrmCustomerPoolServiceImpl implements ICrmCustomerPoolService {

    private final CrmCustomerMapper customerMapper;
    private final CrmCustomerPoolLogMapper poolLogMapper;
    private final CrmAssignmentRuleMapper assignmentRuleMapper;

    public CrmCustomerPoolServiceImpl(CrmCustomerMapper customerMapper,
                                      CrmCustomerPoolLogMapper poolLogMapper,
                                      CrmAssignmentRuleMapper assignmentRuleMapper) {
        this.customerMapper = customerMapper;
        this.poolLogMapper = poolLogMapper;
        this.assignmentRuleMapper = assignmentRuleMapper;
    }

    @Override
    public PageResult<CrmCustomer> queryPool(CrmCustomer query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmCustomer> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.IN_POOL)
                .orderByDesc(CrmCustomer::getPooledTime);
        if (StringUtils.hasText(query.getCustomerName())) {
            wrapper.like(CrmCustomer::getCustomerName, query.getCustomerName());
        }
        if (StringUtils.hasText(query.getIndustry())) {
            wrapper.eq(CrmCustomer::getIndustry, query.getIndustry());
        }
        if (StringUtils.hasText(query.getLevelCode())) {
            wrapper.eq(CrmCustomer::getLevelCode, query.getLevelCode());
        }
        if (StringUtils.hasText(query.getCustomerTags())) {
            wrapper.like(CrmCustomer::getCustomerTags, query.getCustomerTags());
        }
        return PageResult.build(customerMapper.selectPage(pageQuery.build(), wrapper));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean releaseToPool(Long customerId, String reason) {
        CrmCustomer customer = loadCustomer(customerId);
        if (CrmConstants.CustomerPoolFlag.IN_POOL.equals(customer.getPoolFlag())) {
            throw new IllegalArgumentException("客户已经在公海中");
        }
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<CrmCustomer> update = new LambdaUpdateWrapper<>();
        update.eq(CrmCustomer::getCustomerId, customer.getCustomerId())
                .set(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.IN_POOL)
                .set(CrmCustomer::getPooledTime, now)
                .set(CrmCustomer::getOriginalOwnerId, customer.getOwnerId())
                .set(CrmCustomer::getOriginalOwnerName, customer.getOwnerName())
                .set(CrmCustomer::getOwnerId, null)
                .set(CrmCustomer::getOwnerName, null)
                .set(CrmCustomer::getUpdateBy, currentUserName())
                .set(CrmCustomer::getUpdateTime, now);
        customerMapper.update(null, update);
        writeLog(customer, CrmConstants.PoolAction.RELEASE, customer.getOwnerId(), customer.getOwnerName(),
                null, null, null, reason);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'customer:' + #customerId + ':claim'", waitMs = 200, leaseMs = 5000)
    public boolean claimFromPool(Long customerId, String reason) {
        CrmCustomer customer = loadCustomer(customerId);
        if (!CrmConstants.CustomerPoolFlag.IN_POOL.equals(customer.getPoolFlag())) {
            throw new IllegalArgumentException("客户不在公海，无法抢单");
        }
        Long userId = UserContext.getUserId();
        if (userId == null) {
            throw new IllegalArgumentException("当前用户上下文缺失，无法抢单");
        }
        String userName = StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
        enforceClaimLimit(userId, customer);
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<CrmCustomer> update = new LambdaUpdateWrapper<>();
        update.eq(CrmCustomer::getCustomerId, customer.getCustomerId())
                .set(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.OUT_OF_POOL)
                .set(CrmCustomer::getPooledTime, null)
                .set(CrmCustomer::getOwnerId, userId)
                .set(CrmCustomer::getOwnerName, userName)
                .set(CrmCustomer::getLastFollowUpTime, now)
                .set(CrmCustomer::getUpdateBy, userName)
                .set(CrmCustomer::getUpdateTime, now);
        customerMapper.update(null, update);
        writeLog(customer, CrmConstants.PoolAction.CLAIM, null, null, userId, userName, null, reason);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    // M1-5: 防并发冲突
    @DistributedLock(key = "'customer:' + #assignDTO.customerId + ':assign'", waitMs = 200, leaseMs = 5000)
    public boolean assignFromPool(CrmCustomerAssignDTO assignDTO) {
        if (assignDTO == null || assignDTO.getCustomerId() == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        if (assignDTO.getOwnerId() == null || !StringUtils.hasText(assignDTO.getOwnerName())) {
            throw new IllegalArgumentException("指派必须指定新负责人");
        }
        CrmCustomer customer = loadCustomer(assignDTO.getCustomerId());
        LocalDateTime now = LocalDateTime.now();
        LambdaUpdateWrapper<CrmCustomer> update = new LambdaUpdateWrapper<>();
        update.eq(CrmCustomer::getCustomerId, customer.getCustomerId())
                .set(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.OUT_OF_POOL)
                .set(CrmCustomer::getPooledTime, null)
                .set(CrmCustomer::getOwnerId, assignDTO.getOwnerId())
                .set(CrmCustomer::getOwnerName, assignDTO.getOwnerName())
                .set(CrmCustomer::getDeptId, assignDTO.getDeptId() != null ? assignDTO.getDeptId() : customer.getDeptId())
                .set(CrmCustomer::getDeptName, StringUtils.hasText(assignDTO.getDeptName()) ? assignDTO.getDeptName() : customer.getDeptName())
                .set(CrmCustomer::getLastFollowUpTime, now)
                .set(CrmCustomer::getUpdateBy, currentUserName())
                .set(CrmCustomer::getUpdateTime, now);
        customerMapper.update(null, update);
        writeLog(customer, CrmConstants.PoolAction.ASSIGN, customer.getOwnerId(), customer.getOwnerName(),
                assignDTO.getOwnerId(), assignDTO.getOwnerName(), null, assignDTO.getReason());
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int triggerAutoRelease() {
        List<CrmAssignmentRule> rules = loadAutoReleaseRules();
        if (rules.isEmpty()) {
            return 0;
        }
        int released = 0;
        for (CrmAssignmentRule rule : rules) {
            released += applyAutoReleaseRule(rule);
        }
        return released;
    }

    public int autoReleaseExpiredCustomers() {
        return triggerAutoRelease();
    }

    @Override
    public PageResult<CrmCustomerPoolLog> listLogs(Long customerId, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmCustomerPoolLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmCustomerPoolLog::getDeleted, CrmConstants.DelFlag.NORMAL)
                .orderByDesc(CrmCustomerPoolLog::getCreateTime);
        if (customerId != null) {
            wrapper.eq(CrmCustomerPoolLog::getCustomerId, customerId);
        }
        return PageResult.build(poolLogMapper.selectPage(pageQuery.build(), wrapper));
    }

    private void enforceClaimLimit(Long userId, CrmCustomer customer) {
        List<CrmAssignmentRule> rules = assignmentRuleMapper.selectList(new LambdaQueryWrapper<CrmAssignmentRule>()
                .eq(CrmAssignmentRule::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmAssignmentRule::getStatus, CrmConstants.AssignmentRuleStatus.ACTIVE)
                .eq(CrmAssignmentRule::getRuleType, CrmConstants.AssignmentRuleType.CLAIM_LIMIT)
                .orderByAsc(CrmAssignmentRule::getPriority));
        for (CrmAssignmentRule rule : rules) {
            if (!ruleMatchCustomer(rule, customer)) {
                continue;
            }
            Long owned = customerMapper.selectCount(new LambdaQueryWrapper<CrmCustomer>()
                    .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                    .eq(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.OUT_OF_POOL)
                    .eq(CrmCustomer::getOwnerId, userId));
            if (owned != null && owned.intValue() >= rule.getMaxPerOwner()) {
                throw new IllegalArgumentException("已达到单人持有上限：" + rule.getMaxPerOwner() + "，无法抢单");
            }
        }
    }

    private List<CrmAssignmentRule> loadAutoReleaseRules() {
        List<CrmAssignmentRule> rules = assignmentRuleMapper.selectList(new LambdaQueryWrapper<CrmAssignmentRule>()
                .eq(CrmAssignmentRule::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmAssignmentRule::getStatus, CrmConstants.AssignmentRuleStatus.ACTIVE)
                .eq(CrmAssignmentRule::getRuleType, CrmConstants.AssignmentRuleType.AUTO_RELEASE)
                .orderByAsc(CrmAssignmentRule::getPriority));
        return rules == null ? Collections.emptyList() : rules;
    }

    private int applyAutoReleaseRule(CrmAssignmentRule rule) {
        if (rule.getInactiveDays() == null || rule.getInactiveDays() <= 0) {
            return 0;
        }
        LocalDateTime threshold = LocalDateTime.now().minusDays(rule.getInactiveDays());
        LambdaQueryWrapper<CrmCustomer> selector = new LambdaQueryWrapper<CrmCustomer>()
                .eq(CrmCustomer::getDeleted, CrmConstants.DelFlag.NORMAL)
                .eq(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.OUT_OF_POOL)
                .isNotNull(CrmCustomer::getOwnerId)
                .and(w -> w.lt(CrmCustomer::getLastFollowUpTime, threshold).or().isNull(CrmCustomer::getLastFollowUpTime));
        if (rule.getDeptId() != null) {
            selector.eq(CrmCustomer::getDeptId, rule.getDeptId());
        }
        if (StringUtils.hasText(rule.getCustomerLevel())) {
            selector.eq(CrmCustomer::getLevelCode, rule.getCustomerLevel());
        }
        if (StringUtils.hasText(rule.getCustomerTags())) {
            selector.like(CrmCustomer::getCustomerTags, rule.getCustomerTags());
        }
        List<CrmCustomer> targets = customerMapper.selectList(selector);
        if (targets == null || targets.isEmpty()) {
            return 0;
        }
        LocalDateTime now = LocalDateTime.now();
        String reason = "自动回收规则 [" + rule.getRuleName() + "] 触发：连续 " + rule.getInactiveDays() + " 天未跟进";
        int released = 0;
        for (CrmCustomer customer : targets) {
            LambdaUpdateWrapper<CrmCustomer> update = new LambdaUpdateWrapper<>();
            update.eq(CrmCustomer::getCustomerId, customer.getCustomerId())
                    .set(CrmCustomer::getPoolFlag, CrmConstants.CustomerPoolFlag.IN_POOL)
                    .set(CrmCustomer::getPooledTime, now)
                    .set(CrmCustomer::getOriginalOwnerId, customer.getOwnerId())
                    .set(CrmCustomer::getOriginalOwnerName, customer.getOwnerName())
                    .set(CrmCustomer::getOwnerId, null)
                    .set(CrmCustomer::getOwnerName, null)
                    .set(CrmCustomer::getUpdateBy, "system")
                    .set(CrmCustomer::getUpdateTime, now);
            if (customerMapper.update(null, update) > 0) {
                writeLog(customer, CrmConstants.PoolAction.AUTO_RELEASE,
                        customer.getOwnerId(), customer.getOwnerName(),
                        null, null, rule.getRuleId(), reason);
                released++;
            }
        }
        return released;
    }

    private boolean ruleMatchCustomer(CrmAssignmentRule rule, CrmCustomer customer) {
        if (rule.getDeptId() != null && !rule.getDeptId().equals(customer.getDeptId())) {
            return false;
        }
        if (StringUtils.hasText(rule.getCustomerLevel())
                && !rule.getCustomerLevel().equals(customer.getLevelCode())) {
            return false;
        }
        if (StringUtils.hasText(rule.getCustomerTags())) {
            String tags = customer.getCustomerTags();
            if (!StringUtils.hasText(tags) || !tags.contains(rule.getCustomerTags())) {
                return false;
            }
        }
        return true;
    }

    private CrmCustomer loadCustomer(Long customerId) {
        if (customerId == null) {
            throw new IllegalArgumentException("客户ID不能为空");
        }
        CrmCustomer customer = customerMapper.selectById(customerId);
        if (customer == null || !CrmConstants.DelFlag.NORMAL.equals(customer.getDeleted())) {
            throw new IllegalArgumentException("客户不存在");
        }
        return customer;
    }

    private void writeLog(CrmCustomer customer, String action, Long fromOwnerId, String fromOwnerName,
                          Long toOwnerId, String toOwnerName, Long ruleId, String reason) {
        CrmCustomerPoolLog log = new CrmCustomerPoolLog();
        log.setCustomerId(customer.getCustomerId());
        log.setCustomerName(customer.getCustomerName());
        log.setActionType(action);
        log.setFromOwnerId(fromOwnerId);
        log.setFromOwnerName(fromOwnerName);
        log.setToOwnerId(toOwnerId);
        log.setToOwnerName(toOwnerName);
        log.setRuleId(ruleId);
        log.setReason(reason);
        Long tenantId = customer.getTenantId() == null ? 100000L : customer.getTenantId();
        Localize.fillCommonAudit(log, tenantId, currentUserName(), LocalDateTime.now());
        poolLogMapper.insert(log);
    }

    private String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }
}
