package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingAllocation;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRule;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingAllocationMapper;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingAllocationService;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingRuleService;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingAllocationUpdateDTO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingAllocationVO;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class JointMarketingAllocationServiceImpl extends
        ServiceImpl<JointMarketingAllocationMapper, JointMarketingAllocation> implements IJointMarketingAllocationService {

    private final IJointMarketingRuleService ruleService;

    /**
     * 删除分润配置
     *
     * @param allocationId 分润配置ID
     * @return 是否删除成功
     */
    @Override
    public R<Boolean> deleteAllocation(String allocationId) {
        try {
            // 1. 查询配置
            JointMarketingAllocation allocation = getById(allocationId);
            if (allocation == null) {
                return R.failed("分润配置不存在");
            }

            // 2. 逻辑删除
            allocation.setIsDeleted(1);
            allocation.setDeletedTime(java.time.LocalDateTime.now());
            boolean result = updateById(allocation);
            if (result) {
                log.info("删除分润配置成功, ID: {}", allocationId);
                return R.ok(true);
            } else {
                return R.failed("删除分润配置失败");
            }

        } catch (Exception e) {
            log.error("删除分润配置失败", e);
            return R.failed("删除分润配置失败: " + e.getMessage());
        }
    }

    /**
     * 更新分润配置
     *
     * @param dto 分润配置更新参数
     * @return 是否更新成功
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> updateAllocation(JointMarketingAllocationUpdateDTO dto) {
        try {
            // 1. 查询现有配置
            JointMarketingAllocation allocation = getById(dto.getId());
            if (allocation == null) {
                return R.failed("分润配置不存在");
            }

            // 2. 更新配置
            CopyOptions copier = CopyOptions.create().ignoreNullValue();
            BeanUtil.copyProperties(dto, allocation, copier);
            boolean result = updateById(allocation);
            if (!result) {
                return R.failed("更新分润配置失败");
            }

            // 3. 校验分润比例总和
           validateAllocationSum(allocation.getRuleId());
            log.info("更新分润配置成功, ID: {}", dto.getId());
            return R.ok(true);

        } catch (Exception e) {
            log.error("更新分润配置失败", e);
            return R.failed("更新分润配置失败: " + e.getMessage());
        }
    }

    /**
     * 校验分润配置
     *
     * @param planId 联合营销计划ID
     */
    @Override
    public void validateProfitSharingConfig(Long planId) {
        // 检查计划下的规则
        List<JointMarketingRule> rules = ruleService.lambdaQuery()
                .eq(JointMarketingRule::getPlanId, planId).list();
        Assert.notEmpty(rules, () -> new CheckedException("该计划下没有可用的规则"));
        List<JointMarketingRule> activeRules = rules.stream().filter(rule -> "ACTIVE".equals(rule.getStatus())).toList();
        Assert.notEmpty(activeRules, () -> new CheckedException("该计划下缺少启用的规则"));

        // 检查规则下的分润配置
        Set<Long> ruleIds = new HashSet<>();
        Map<Long, JointMarketingRule> rulesMap = new HashMap<>();
        for (JointMarketingRule rule : rules) {
            rulesMap.put(rule.getId(), rule);
            ruleIds.add(rule.getId());
        }
        List<JointMarketingAllocation> allocations = lambdaQuery()
                .in(JointMarketingAllocation::getRuleId, ruleIds).list();
        Assert.notEmpty(allocations, () -> new CheckedException("该计划下缺少分润配置"));
        Map<Long, Long> allocationRuleIdsMap = new HashMap<>();
        Map<Long, List<JointMarketingAllocation>> allocationRulesMap = new HashMap<>();
        for (JointMarketingAllocation allocation : allocations) {
            allocationRuleIdsMap.put(allocation.getRuleId(), allocation.getRuleId());
            List<JointMarketingAllocation> ruleAllocations = allocationRulesMap.get(allocation.getRuleId());
            if (CollUtil.isEmpty(ruleAllocations)) {
                ruleAllocations = new ArrayList<>();
                allocationRulesMap.put(allocation.getRuleId(), ruleAllocations);
            }
            ruleAllocations.add(allocation);
        }
        rules.forEach(rule -> {
            Long ruleId = allocationRuleIdsMap.get(rule.getId());
            Assert.notNull(ruleId,
                    () -> new CheckedException("规则[" + rulesMap.get(rule.getId()).getName() + "]缺少分润配置"));
        });
        // 验证分润比例总和
        for (Map.Entry<Long, List<JointMarketingAllocation>> entry : allocationRulesMap.entrySet()) {
            List<JointMarketingAllocation> value = entry.getValue();
            BigDecimal totalRatio = value.stream()
                    .filter(a -> "RATE".equals(a.getAllocationType()))
                    .map(JointMarketingAllocation::getAllocationValue)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            Assert.isFalse(totalRatio.compareTo(BigDecimal.valueOf(1.0)) > 0,
                    () -> new CheckedException("规则[" + rulesMap.get(entry.getKey()).getName() + "]的分润比例总和不能大于100%"));
        }
    }

    /**
     * 根据规则ID查询分润配置列表
     *
     * @param ruleId 联合营销规则ID
     * @return 分润配置列表
     */
    @Override
    public R<List<JointMarketingAllocationVO>> listAllocationsByRuleId(Long ruleId) {
        try {
            // 1. 校验权限
            JointMarketingRule rule = ruleService.getById(ruleId);
            if (rule == null) {
                return R.failed("规则不存在");
            }

            // 2. 查询分润配置
            List<JointMarketingAllocation> allocations = lambdaQuery()
                    .eq(JointMarketingAllocation::getRuleId, ruleId)
                    .eq(JointMarketingAllocation::getIsDeleted, 0)
                    .orderByAsc(JointMarketingAllocation::getCreatedTime)
                    .list();
            if (CollUtil.isEmpty(allocations)) {
                return R.ok(List.of());
            }
            return R.ok(BeanUtil.copyToList(allocations, JointMarketingAllocationVO.class));

        } catch (Exception e) {
            log.error("查询分润配置列表失败", e);
            return R.failed("查询分润配置列表失败");
        }
    }

    private void validateAllocationSum(Long ruleId) {
        try {
            List<JointMarketingAllocation> allocations = lambdaQuery()
                    .eq(JointMarketingAllocation::getRuleId, ruleId)
                    .eq(JointMarketingAllocation::getIsDeleted, 0)
                    .eq(JointMarketingAllocation::getAllocationType, "RATE")
                    .list();

            if (CollUtil.isEmpty(allocations)) {
                throw new CheckedException("规则[" + ruleId + "]缺少分润比例配置");
            }

            BigDecimal totalRatio = allocations.stream()
                    .map(JointMarketingAllocation::getAllocationValue)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            boolean isValid = totalRatio.compareTo(BigDecimal.ONE) <= 0;
            if (!isValid) {
                log.warn("规则[{}]的分润比例总和超过100%: {}", ruleId, totalRatio);
                throw new CheckedException("规则[" + ruleId + "]的分润比例总和不能大于100%");
            }

        } catch (Exception e) {
            log.error("校验分润比例总和失败", e);
            throw new CheckedException("校验分润比例总和失败");
        }
    }

}