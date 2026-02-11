package cn.joywon.poco.merchant.PlatformModule.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.bean.copier.CopyOptions;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.lang.Assert;
import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.core.exception.CheckedException;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleAddDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleCacheDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.PointsRule;
import cn.joywon.poco.merchant.PlatformModule.mapper.PointsRuleMapper;
import cn.joywon.poco.merchant.PlatformModule.repository.IPointsRuleRepository;
import cn.joywon.poco.merchant.PlatformModule.service.IPointsRuleService;
import cn.joywon.poco.merchant.PlatformModule.vo.PointsRuleDetailVO;
import cn.joywon.poco.merchant.PlatformModule.vo.PointsRuleListVO;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.Serializable;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class PointsRuleServiceImpl extends ServiceImpl<PointsRuleMapper, PointsRule> implements IPointsRuleService {

    private final IPointsRuleRepository pointsRuleRepository;

    private final PointsRuleMapper pointsRuleMapper;


    /**
     * 添加积分规则
     *
     * @param dto 积分规则新增参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> addPointsRule(PointsRuleAddDTO dto) {
        /* step-1 检查名称是否重复 & 已有默认规则(如有) */
        PointsRule pointsRule = lambdaQuery().eq(PointsRule::getRuleName, dto.getRuleName()).last("LIMIT 1").one();
        if (ObjUtil.isNotNull(pointsRule)) {
            return R.failed("已存在相同名称积分规则");
        }
        dto.setActiveTime(dto.getActiveTime() != null ? dto.getActiveTime() : LocalDate.now().atStartOfDay());
        dto.setExpireTime(dto.getExpireTime() != null ? dto.getExpireTime() : PointsRuleEnum.POINTS_RULE_NEVER_EXPIRE);
        PointsRule oldPrimaryRule = null;
        if (dto.getPrimary()) {
            Assert.isTrue(dto.getActiveTime().isBefore(LocalDateTime.now()),
                    () -> new CheckedException("默认规则的生效时间必须早于等于当前"));
            oldPrimaryRule = checkFindPrimaryPointsRule(
                    PointsRuleEnum.valueOf(dto.getChangeType()), PointsRuleEnum.valueOf(dto.getRuleType()));
        }

        /* step-2 写入数据库 & 更新原有默认规则(如有) */
        boolean result;
        // 更新原有默认规则(如有)
        if (dto.getPrimary() && oldPrimaryRule != null) {
            oldPrimaryRule.setSortWeight(1);
            oldPrimaryRule.setPrimary(false);
            result = updateById(oldPrimaryRule);
            Assert.isTrue(result, () -> new RuntimeException("更新原有默认积分规则失败"));
        }
        // 新增当前积分规则
        pointsRule = BeanUtil.copyProperties(dto, PointsRule.class);
        pointsRule.setSortWeight(dto.getPrimary() ? 0 : dto.getSortWeight());
        // if - 简单规则
        if (dto.getFixedPoints() != null && dto.getFixedPoints() != 0) {
            result = save(pointsRule);
            Assert.isTrue(result, () -> new RuntimeException("添加积分规则失败"));
        }
        Assert.notEmpty(dto.getExtraRules(), () -> new CheckedException("请指定一个简单规则或复杂规则"));
        // else - 复杂规则
        PointsRuleEnum ruleType = PointsRuleEnum.valueOf(dto.getRuleType());
        List<?> extraRules = convertExtraRules(dto.getExtraRules(), ruleType);
        pointsRule.setExtraRules(JSONUtil.toJsonStr(extraRules));
        result = save(pointsRule);
        Assert.isTrue(result, () -> new RuntimeException("添加积分规则失败"));

        /* step-3 写入缓存 & 更新原有默认规则(如有) */
        // 新增当前默认规则
        upsertPointsRuleCache(pointsRule, extraRules);
        // 更新原有默认规则(如有)
        if (pointsRule.getPrimary() && oldPrimaryRule != null) {
            List<String> oldPrimaryExtraRules = null;
            if (StrUtil.isNotBlank(oldPrimaryRule.getExtraRules())) {
                oldPrimaryExtraRules = JSONUtil.toList(oldPrimaryRule.getExtraRules(), String.class);
            }
            upsertPointsRuleCache(oldPrimaryRule, oldPrimaryExtraRules);
        }

        return R.ok();
    }


    /**
     * 激活延迟生效积分规则
     *
     * @param pointsRuleId 积分规则ID
     */
    @Override
    public void activatePointsRule(String pointsRuleId) {
        PointsRule pointsRule = getById(pointsRuleId);
        Assert.notNull(pointsRule, () -> {
            log.error("积分规则自动激活失败, 积分规则不存在, ID [{}]", pointsRuleId);
            throw new CheckedException("积分规则自动激活失败, 积分规则不存在");
        });
        Assert.isTrue(pointsRule.getEnable(), () -> {
            log.error("积分规则自动激活失败, 积分规则已被禁用, ID [{}]", pointsRuleId);
            throw new CheckedException("积分规则自动激活失败, 积分规则已被禁用");
        });
        Assert.isTrue(pointsRule.getActiveTime().isBefore(LocalDateTime.now()), () -> {
            log.error("积分规则自动激活失败, 积分规则未到自动激活时间, ID [{}]", pointsRuleId);
            throw new CheckedException("积分规则自动激活失败, 积分规则未到自动激活时间");
        });

        PointsRuleCacheDTO pointsRuleCache = BeanUtil.copyProperties(pointsRule, PointsRuleCacheDTO.class);
        if (StrUtil.isNotBlank(pointsRule.getExtraRules())) {
            switch (pointsRule.getRuleType()) {
                case SIGN_IN_REWARD -> pointsRuleCache.setExtraRules(
                        JSONUtil.toList(pointsRule.getExtraRules(), PointsRule.SignInRewardRule.class)
                );
                case ORDER_EARN -> pointsRuleCache.setExtraRules(
                        JSONUtil.toList(pointsRule.getExtraRules(), PointsRule.OrderEarnRule.class)
                );
                case COMMENT_REWARD -> pointsRuleCache.setExtraRules(
                        JSONUtil.toList(pointsRule.getExtraRules(), PointsRule.CommentEarnRule.class)
                );
            }
        }

        pointsRuleCache.setExtraRules(null);

        try {
            pointsRuleRepository.upsertPointsRule(pointsRuleCache);
            pointsRuleRepository.dropActivateKey(pointsRuleId);
        } catch (Exception e) {
            log.error("积分规则自动激活失败, 积分规则: {}", pointsRule, e);
            throw new RuntimeException("积分规则自动激活失败");
        }
    }


    /**
     * 删除积分规则
     *
     * @param id 积分规则ID
     * @return 操作结果
     */
    @Override
    public R<?> deletePointsRule(Long id) {
        PointsRule pointsRule = getById(id);
        Assert.notNull(pointsRule, () -> new CheckedException("积分规则删除失败, 积分规则不存在"));
        int count = pointsRuleMapper.deletePointsRule(id);
        Assert.isTrue(count != 0, () -> new CheckedException("积分规则删除失败"));
        pointsRuleRepository.dropPointsRule(id, pointsRule.getChangeType().getValue(), pointsRule.getRuleType().getValue());
        pointsRuleRepository.dropActivateKey(id);

        return R.ok();
    }


    /**
     * 修改积分规则
     *
     * @param dto 积分规则修改参数
     * @return 操作结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<?> modifyPointsRule(PointsRuleUpdateDTO dto) {
        /* step-1 检查积分规则 */
        // 检查积分规则
        PointsRule entity = null;
        if (StrUtil.isNotBlank(dto.getRuleName())) {
            entity = lambdaQuery().eq(PointsRule::getRuleName, dto.getRuleName()).last("LIMIT 1").one();
            if (entity != null) {
                Assert.isTrue(ObjUtil.equals(entity.getId(), dto.getId()),
                        () -> new CheckedException("积分规则修改失败, 已存在相同名称积分规则"));
            }
        }
        if (entity == null) {
            entity = getById(dto.getId());
            Assert.notNull(entity, () -> new CheckedException("积分规则修改失败, 积分规则不存在"));
        }
        dto.setActiveTime(dto.getActiveTime() == null ? LocalDate.now().atStartOfDay() : dto.getActiveTime());
        dto.setExpireTime(dto.getExpireTime() == null ? PointsRuleEnum.POINTS_RULE_NEVER_EXPIRE : dto.getExpireTime());

        // 检查原有默认积分规则(如需)
        PointsRule oldPrimaryRule = null;
        if (dto.getPrimary()) {
            Assert.isTrue(dto.getActiveTime().isBefore(LocalDateTime.now()),
                    () -> new CheckedException("默认规则的生效时间必须早于等于当前"));
            oldPrimaryRule = checkFindPrimaryPointsRule(entity.getChangeType(), entity.getRuleType());
        }

        /* step-2 更新数据库当前积分规则 & 原有默认规则(如有) */
        boolean result;
        // 修改当前积分规则
        CopyOptions copier = CopyOptions.create().ignoreNullValue();
        BeanUtil.copyProperties(dto, entity, copier);
        entity.setSortWeight(entity.getPrimary() ? 0 : entity.getSortWeight());
        // if - 简单规则
        if (dto.getFixedPoints() != null && dto.getFixedPoints() != 0) {
            result = updateById(entity);
            Assert.isTrue(result, () -> new RuntimeException("积分规则修改失败"));
        }
        // else - 复杂规则
        Assert.notEmpty(dto.getExtraRules(), () -> new CheckedException("请指定一个简单规则或复杂规则"));
        List<?> extraRules = convertExtraRules(dto.getExtraRules(), entity.getRuleType());
        entity.setExtraRules(JSONUtil.toJsonStr(extraRules));
        result = updateById(entity);
        Assert.isTrue(result, () -> new CheckedException("积分规则修改失败"));

        // 修改原有默认规则(如有)
        if (dto.getPrimary() && oldPrimaryRule != null) {
            oldPrimaryRule.setSortWeight(1);
            oldPrimaryRule.setPrimary(false);
            result = updateById(oldPrimaryRule);
            Assert.isTrue(result, () -> new RuntimeException("原有的默认积分规则修改失败"));
        }

        /* step-3 更新数当前积分规则缓存 & 原有默认规则(如有) */
        // 更新当前积分规则
        upsertPointsRuleCache(entity, extraRules);
        // 更新原有默认规则(如有)
        if (entity.getPrimary() && oldPrimaryRule != null) {
            List<String> oldPrimaryRuleExtraRules = null;
            if (!StrUtil.isBlank(oldPrimaryRule.getExtraRules())) {
                oldPrimaryRuleExtraRules = JSONUtil.toList(oldPrimaryRule.getExtraRules(), String.class);
            }
            upsertPointsRuleCache(oldPrimaryRule, oldPrimaryRuleExtraRules);
        }

        return R.ok();
    }


    /**
     * 重建积分规则缓存
     *
     * @return 操作结果
     */
    @Override
    public R<?> rebuildPointsRuleCache() {
        /* step-1 清除所有积分规则缓存 */
        pointsRuleRepository.dropAllPointsRule();

        /* step-2 从数据库获取启用的积分规则 */
        long current = 1L, pageSize = 100L;
        while (true) {
            Page<PointsRule> pageData = Page.of(current, pageSize);
            pageData = lambdaQuery().eq(PointsRule::getEnable, true).page(pageData);
            List<PointsRule> pointsRules = pageData.getRecords();
            if (CollUtil.isEmpty(pointsRules)) {
                break;
            }

            /* step-3 初始化积分规则缓存实体 & 生效激活键 */
            LocalDateTime now = LocalDateTime.now();
            Map<Long, Long> activateKeyMap = new HashMap<>();
            List<PointsRuleCacheDTO> pointsRuleCaches = new ArrayList<>();
            for (PointsRule entity : pointsRules) {
                // 未到生效时间, 仅添加生效激活时间
                if (entity.getActiveTime().isAfter(now)) {
                    long activeSeconds = Duration.between(now, entity.getActiveTime()).getSeconds();
                    activateKeyMap.put(entity.getId(), activeSeconds);
                    continue;
                }
                // 简单规则, 直接添加缓存
                PointsRuleCacheDTO cache = BeanUtil.copyProperties(entity, PointsRuleCacheDTO.class);
                if (StrUtil.isBlank(entity.getExtraRules())) {
                    pointsRuleCaches.add(cache);
                    continue;
                }
                // 复杂规则, 转换规则为对象格式
                List<String> extraRules = JSONUtil.toList(entity.getExtraRules(), String.class);
                cache.setExtraRules(convertExtraRules(extraRules, entity.getRuleType()));
                pointsRuleCaches.add(cache);
            }

            /* 写入缓存 */
            pointsRuleRepository.upsertPointsRuleBatch(pointsRuleCaches);
            pointsRuleRepository.pendingActivationMany(activateKeyMap);

            if (pointsRules.size() <= pageSize) {
                break;
            }
            current++;
        }

        return R.ok();
    }


    /**
     * 查询积分规则列表
     *
     * @param dto 查询参数
     * @return 查询结果(积分规则分页列表)
     */
    @Override
    public R<PageQueryVO<PointsRuleListVO>> queryPointsRulesList(PointsRuleQueryDTO dto) {
        dto.setActiveTime(dto.getActiveDate() == null ? null : dto.getActiveDate().atStartOfDay());
        dto.setExpireTime(dto.getExpireDate() == null ? null : dto.getExpireDate().atTime(LocalTime.MAX));
        Page<PointsRuleListVO> pageData = pointsRuleMapper.queryPointsRulesList(dto.page(), dto);

        return R.ok(PageQueryVO.of(pageData));
    }


    /**
     * 获取积分规则详情
     *
     * @param id 积分规则ID
     * @return 查询结果(积分规则详情)
     */
    @Override
    public R<PointsRuleDetailVO> getPointsRuleDetail(Long id) {
        PointsRule pointsRule = getById(id);
        if (pointsRule == null) {
            return R.ok(new PointsRuleDetailVO());
        }

        PointsRuleDetailVO vo = BeanUtil.copyProperties(pointsRule, PointsRuleDetailVO.class);
        vo.setExtraRules(JSONUtil.toList(pointsRule.getExtraRules(), String.class));

        return R.ok(vo);
    }


    /**
     * 获取默认积分规则
     *
     * @param changeType 积分变动类型
     * @param ruleType   积分规则类型
     * @return 查询结果(默认积分规则)
     */
    @Override
    public PointsRule getPrimaryPointsRule(PointsRuleEnum changeType, PointsRuleEnum ruleType) {
        return lambdaQuery()
                .eq(PointsRule::getChangeType, changeType)
                .eq(PointsRule::getRuleType, ruleType)
                .eq(PointsRule::getPrimary, true)
                .eq(PointsRule::getEnable, true)
                .one();
    }


    /**
     * 获取默认积分规则缓存
     *
     * @param changeType 积分变动类型
     * @param ruleType   积分规则类型
     * @return 查询结果(积分规则缓存)
     */
    @Override
    public PointsRuleCacheDTO getPrimaryPointsRuleCache(String changeType, String ruleType) {
        return pointsRuleRepository.getPrimaryPointsRuleCache(changeType, ruleType);
    }


    /**
     * 根据积分规则ID获取积分规则缓存
     *
     * @return 查询结果(积分规则缓存)
     */
    @Override
    public PointsRuleCacheDTO getPointsRuleCache(Serializable id) {
        return pointsRuleRepository.getPointsRule(id);
    }


    /**
     * 根据积分变动类型规则类型查询积分规则缓存列表
     *
     * @param changeType 积分变动类型
     * @param ruleType   积分规则类型
     * @return 查询结果(积分规则缓存列表)
     */
    @Override
    public List<PointsRuleCacheDTO> queryPointRuleCacheList(String changeType, String ruleType) {
        List<PointsRuleCacheDTO> caches = pointsRuleRepository.queryPointRuleCacheList(changeType, ruleType);

        return caches.stream().sorted(Comparator.comparing(PointsRuleCacheDTO::getSortWeight)).toList();
    }


    /**
     * private
     * 获取当前默认积分规则
     *
     * @param changeType 积分变动类型
     * @param rulesType  积分规则类型
     * @return 默认积分规则
     */
    private PointsRule checkFindPrimaryPointsRule(PointsRuleEnum changeType, PointsRuleEnum rulesType) {
        List<PointsRule> pointsRules = lambdaQuery()
                .eq(PointsRule::getPrimary, true)
                .eq(PointsRule::getCreatedTime, changeType)
                .eq(PointsRule::getRuleType, rulesType)
                .list();

        if (CollUtil.isEmpty(pointsRules)) {
            return null;
        }

        Assert.isTrue(pointsRules.size() <= 1, () -> {
            log.error("积分规则添加失败, 存在多个相同变动类型 & 规则类型的默认积分规则: {}", pointsRules);
            throw new CheckedException("积分规则添加失败, 目前存在多个相同变动类型和规则类型的积分规则");
        });

        return pointsRules.get(0);
    }


    /**
     * private
     * 添加/更新积分规则缓存
     *
     * @param pointsRule 积分规则实体
     * @param extraRules 复杂规则列表
     */
    private void upsertPointsRuleCache(PointsRule pointsRule, List<?> extraRules) {
        if (pointsRule.getEnable() == null || !pointsRule.getEnable()) {
            return;
        }

        LocalDateTime now = LocalDateTime.now();
        // 未到生效时间
        if (pointsRule.getActiveTime().isAfter(now)) {
            long activeSeconds = Duration.between(now, pointsRule.getActiveTime()).getSeconds();
            pointsRuleRepository.pendingActivation(pointsRule.getId(), activeSeconds);
            return;
        }
        // 生效时间已过
        PointsRuleCacheDTO pointsRuleCache = BeanUtil.copyProperties(pointsRule, PointsRuleCacheDTO.class);
        if (CollUtil.isNotEmpty(extraRules)) {
            pointsRuleCache.setExtraRules(extraRules);
        }
        pointsRuleRepository.upsertPointsRule(pointsRuleCache);

        // 是否为默认积分规则
        if (!pointsRule.getPrimary()) {
            return;
        }
        pointsRuleRepository.upsertPrimaryPointsRule(pointsRuleCache);
    }


    /**
     * 处理复杂积分规则类型
     *
     * @param extraRules 积分规则
     * @param ruleType   积分规则类型
     * @return 负责积分规则实体列表
     */
    public List<?> convertExtraRules(List<String> extraRules, PointsRuleEnum ruleType) {
        switch (ruleType) {
            case SIGN_IN_REWARD -> {
                return convertSignInRewardPointsRule(extraRules);
            }
            case ORDER_EARN -> {
                return convertOrderEarnPointsRule(extraRules);
            }
            case COMMENT_REWARD -> {
                return convertCommentRewardPointsRule(extraRules);
            }
            default -> throw new CheckedException("积分规则类型有误");
        }
    }


    /**
     * 签到阶梯式积分奖励积分规则转换
     *
     * @param extraRules 签到阶梯式积分奖励积分规则
     * @return 签到阶梯式积分奖励积分规则明细列表
     */
    public List<PointsRule.SignInRewardRule> convertSignInRewardPointsRule(List<String> extraRules) {
        return extraRules.stream().map(rule -> {
            try {
                return JSONUtil.toBean(rule, PointsRule.SignInRewardRule.class);
            } catch (Exception e) {
                throw new CheckedException("积分规则格式有误");
            }
        }).toList();
    }


    /**
     * 订单积分奖励积分规则转换
     *
     * @param extraRules 订单积分奖励积分规则
     * @return 订单积分奖励积分规则明细列表
     */
    public List<PointsRule.OrderEarnRule> convertOrderEarnPointsRule(List<String> extraRules) {
        return extraRules.stream().map(rule -> {
            try {
                return JSONUtil.toBean(rule, PointsRule.OrderEarnRule.class);
            } catch (Exception e) {
                throw new CheckedException("积分规则格式有误");
            }
        }).toList();
    }


    /**
     * 评价积分奖励积分规则转换
     *
     * @param extraRules 评价积分奖励积分规则
     * @return 评价积分奖励积分规则JSON
     */
    public List<PointsRule.CommentEarnRule> convertCommentRewardPointsRule(List<String> extraRules) {
        return extraRules.stream().map(rule -> {
            try {
                return JSONUtil.toBean(rule, PointsRule.CommentEarnRule.class);
            } catch (Exception e) {
                throw new CheckedException("积分规则格式有误");
            }
        }).toList();
    }


}