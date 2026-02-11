package cn.joywon.poco.merchant.CouponModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.ObjUtil;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.util.SecurityUtils;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingRuleCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingRuleUpdateDTO;
import cn.joywon.poco.merchant.CouponModule.entity.*;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingAllocationMapper;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingRewardMapper;
import cn.joywon.poco.merchant.CouponModule.mapper.JointMarketingRuleMapper;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingParticipantService;
import cn.joywon.poco.merchant.CouponModule.service.IJointMarketingRuleService;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingRuleVO;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.toolkit.Db;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class JointMarketingRuleServiceImpl extends ServiceImpl<JointMarketingRuleMapper, JointMarketingRule> implements IJointMarketingRuleService {

    private final JointMarketingRewardMapper rewardMapper;
    private final JointMarketingAllocationMapper allocationMapper;
    private final IJointMarketingParticipantService participantService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Long> createRule(JointMarketingRuleCreateDTO dto) {
        // 0. 校验配置
        validateRuleConfig(dto.getPlanId(), dto.getRewards());

        // 1. 保存规则主体
        JointMarketingRule rule = new JointMarketingRule();
        BeanUtil.copyProperties(dto, rule);
        // 默认状态
        if (rule.getStatus() == null) {
            rule.setStatus("ACTIVE");
        }
        save(rule);

        // 2. 保存奖励配置
        if (CollUtil.isNotEmpty(dto.getRewards())) {
            for (JointMarketingRuleCreateDTO.RewardDTO rewardDTO : dto.getRewards()) {
                JointMarketingReward reward = new JointMarketingReward();
                BeanUtil.copyProperties(rewardDTO, reward);
                reward.setRuleId(rule.getId());
                reward.setRewardType("COUPON"); // 目前仅支持优惠券
                rewardMapper.insert(reward);

                // 3. 保存分润配置
                if (CollUtil.isNotEmpty(rewardDTO.getAllocations())) {
                    for (JointMarketingRuleCreateDTO.AllocationDTO allocationDTO : rewardDTO.getAllocations()) {
                        JointMarketingAllocation allocation = new JointMarketingAllocation();
                        BeanUtil.copyProperties(allocationDTO, allocation);
                        allocation.setRuleId(rule.getId());
                        allocation.setRewardId(reward.getId());
                        allocationMapper.insert(allocation);
                    }
                }
            }
        }

        return R.ok(rule.getId());
    }

    @Override
    public R<List<JointMarketingRuleVO>> listRulesByPlanId(Long planId) {
        // 1. 验证计划是否存在以及用户是否有权访问
        JointMarketingPlan plan = Db.getById(planId, JointMarketingPlan.class);
        if (ObjUtil.isNull(plan)) {
            return R.failed("计划不存在");
        }
        
        // 2. 权限验证：只有计划发起人可以查看规则
        Long currentMerchantId = SecurityUtils.getUser().getDeptId();
        if (!plan.getInitiatorMerchantId().equals(currentMerchantId)) {
            return R.failed("无权访问该计划的规则");
        }
        
        // 3. 查询规则列表
        List<JointMarketingRule> rules = list(new LambdaQueryWrapper<JointMarketingRule>()
                .eq(JointMarketingRule::getPlanId, planId)
                .orderByDesc(JointMarketingRule::getCreatedTime));

        if (CollUtil.isEmpty(rules)) {
            return R.ok(new ArrayList<>());
        }

        List<Long> ruleIds = rules.stream().map(JointMarketingRule::getId).collect(Collectors.toList());

        // 2. 查询奖励列表
        List<JointMarketingReward> rewards = rewardMapper.selectList(new LambdaQueryWrapper<JointMarketingReward>()
                .in(JointMarketingReward::getRuleId, ruleIds));
        Map<Long, List<JointMarketingReward>> rewardsMap = rewards.stream()
                .collect(Collectors.groupingBy(JointMarketingReward::getRuleId));

        // 3. 查询分润列表
        List<Long> rewardIds = rewards.stream().map(JointMarketingReward::getId).collect(Collectors.toList());
        Map<Long, List<JointMarketingAllocation>> allocationsMap;
        if (CollUtil.isNotEmpty(rewardIds)) {
            List<JointMarketingAllocation> allocations = allocationMapper.selectList(new LambdaQueryWrapper<JointMarketingAllocation>()
                    .in(JointMarketingAllocation::getRewardId, rewardIds));
            allocationsMap = allocations.stream()
                    .collect(Collectors.groupingBy(JointMarketingAllocation::getRewardId));
        } else {
            allocationsMap = Map.of();
        }

        // 4. 组装VO
        List<JointMarketingRuleVO> result = new ArrayList<>();
        for (JointMarketingRule rule : rules) {
            JointMarketingRuleVO vo = new JointMarketingRuleVO();
            BeanUtil.copyProperties(rule, vo);

            List<JointMarketingReward> ruleRewards = rewardsMap.getOrDefault(rule.getId(), new ArrayList<>());
            List<JointMarketingRuleVO.RewardVO> rewardVOs = new ArrayList<>();

            for (JointMarketingReward reward : ruleRewards) {
                JointMarketingRuleVO.RewardVO rewardVO = new JointMarketingRuleVO.RewardVO();
                BeanUtil.copyProperties(reward, rewardVO);
                rewardVO.setAllocations(allocationsMap.getOrDefault(reward.getId(), new ArrayList<>()));
                rewardVOs.add(rewardVO);
            }
            vo.setRewards(rewardVOs);
            result.add(vo);
        }

        return R.ok(result);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> deleteRule(Long ruleId) {
        // 1. 删除分润配置
        allocationMapper.delete(new LambdaQueryWrapper<JointMarketingAllocation>()
                .eq(JointMarketingAllocation::getRuleId, ruleId));
        
        // 2. 删除奖励配置
        rewardMapper.delete(new LambdaQueryWrapper<JointMarketingReward>()
                .eq(JointMarketingReward::getRuleId, ruleId));
        
        // 3. 删除规则
        removeById(ruleId);
        
        return R.ok(true);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> updateRule(JointMarketingRuleUpdateDTO dto) {
        // 1. 验证规则是否存在
        JointMarketingRule rule = getById(dto.getId());
        if (rule == null) {
            return R.failed("规则不存在");
        }

        // 2. 验证权限 (只有计划发起人可以修改规则)
        JointMarketingPlan plan = Db.getById(rule.getPlanId(), JointMarketingPlan.class);
        if (plan == null) {
             return R.failed("关联计划不存在");
        }
        Long currentMerchantId = SecurityUtils.getUser().getDeptId();
        if (!plan.getInitiatorMerchantId().equals(currentMerchantId)) {
            return R.failed("无权修改该计划的规则");
        }

        // 0. 校验配置
        validateRuleConfig(rule.getPlanId(), dto.getRewards());

        // 3. 更新规则主体
        // 忽略planId的更新，防止规则被移动到其他计划
        Long originalPlanId = rule.getPlanId();
        BeanUtil.copyProperties(dto, rule);
        rule.setPlanId(originalPlanId);
        updateById(rule);

        // 4. 更新奖励配置 (先删除旧的，再新增新的)
        // 删除旧的分润配置
        List<JointMarketingReward> oldRewards = rewardMapper.selectList(new LambdaQueryWrapper<JointMarketingReward>()
                .eq(JointMarketingReward::getRuleId, rule.getId()));
        if (CollUtil.isNotEmpty(oldRewards)) {
            List<Long> oldRewardIds = oldRewards.stream().map(JointMarketingReward::getId).collect(Collectors.toList());
            allocationMapper.delete(new LambdaQueryWrapper<JointMarketingAllocation>()
                    .in(JointMarketingAllocation::getRewardId, oldRewardIds));
            // 删除旧的奖励
            rewardMapper.deleteBatchIds(oldRewardIds);
        }

        // 新增新的奖励和分润配置
        if (CollUtil.isNotEmpty(dto.getRewards())) {
            for (JointMarketingRuleCreateDTO.RewardDTO rewardDTO : dto.getRewards()) {
                JointMarketingReward reward = new JointMarketingReward();
                BeanUtil.copyProperties(rewardDTO, reward);
                reward.setRuleId(rule.getId());
                reward.setRewardType("COUPON"); // 目前仅支持优惠券
                rewardMapper.insert(reward);

                // 保存分润配置
                if (CollUtil.isNotEmpty(rewardDTO.getAllocations())) {
                    for (JointMarketingRuleCreateDTO.AllocationDTO allocationDTO : rewardDTO.getAllocations()) {
                        JointMarketingAllocation allocation = new JointMarketingAllocation();
                        BeanUtil.copyProperties(allocationDTO, allocation);
                        allocation.setRuleId(rule.getId());
                        allocation.setRewardId(reward.getId());
                        allocationMapper.insert(allocation);
                    }
                }
            }
        }

        return R.ok(true);
    }

    /**
     * 校验规则配置
     */
    private void validateRuleConfig(Long planId, List<JointMarketingRuleCreateDTO.RewardDTO> rewards) {
        if (CollUtil.isEmpty(rewards)) {
            return;
        }

        // 1. 获取所有有效参与者
        List<JointMarketingParticipant> participants = participantService.list(new LambdaQueryWrapper<JointMarketingParticipant>()
                .eq(JointMarketingParticipant::getPlanId, planId)
                .eq(JointMarketingParticipant::getStatus, "ACCEPTED"));

        Set<Long> validMerchantIds = participants.stream()
                .map(JointMarketingParticipant::getMerchantId)
                .collect(Collectors.toSet());

        // 加上发起者
        JointMarketingPlan plan = Db.getById(planId, JointMarketingPlan.class);
        if (plan != null) {
            validMerchantIds.add(plan.getInitiatorMerchantId());
        }

        for (JointMarketingRuleCreateDTO.RewardDTO reward : rewards) {
            if (CollUtil.isEmpty(reward.getAllocations())) {
                continue;
            }

            for (JointMarketingRuleCreateDTO.AllocationDTO allocation : reward.getAllocations()) {
                // 校验商家资格
                if (!validMerchantIds.contains(allocation.getPayerMerchantId())) {
                    throw new RuntimeException("支付方商家不是该计划的有效参与者");
                }
                if (!"PLATFORM".equals(allocation.getPayeeRole()) && !validMerchantIds.contains(allocation.getPayeeMerchantId())) {
                    throw new RuntimeException("接收方商家不是该计划的有效参与者");
                }
            }
        }
    }

}