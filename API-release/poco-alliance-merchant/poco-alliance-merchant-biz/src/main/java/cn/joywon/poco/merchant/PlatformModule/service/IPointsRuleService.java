package cn.joywon.poco.merchant.PlatformModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleAddDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleCacheDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleQueryDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.PointsRuleUpdateDTO;
import cn.joywon.poco.merchant.PlatformModule.entity.PointsRule;
import cn.joywon.poco.merchant.PlatformModule.vo.PointsRuleDetailVO;
import cn.joywon.poco.merchant.PlatformModule.vo.PointsRuleListVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.io.Serializable;
import java.util.List;

public interface IPointsRuleService extends IService<PointsRule> {


    /**
     * 添加积分规则
     *
     * @param dto 积分规则新增参数
     * @return 操作结果
     */
    R<?> addPointsRule(PointsRuleAddDTO dto);


    /**
     * 激活延迟生效积分规则
     *
     * @param pointsRuleId 积分规则ID
     */
    void activatePointsRule(String pointsRuleId);


    /**
     * 删除积分规则
     *
     * @param id 积分规则ID
     * @return 操作结果
     */
    R<?> deletePointsRule(Long id);


    /**
     * 修改积分规则
     *
     * @param dto 积分规则修改参数
     * @return 操作结果
     */
    R<?> modifyPointsRule(PointsRuleUpdateDTO dto);


    /**
     * 重建积分规则缓存
     *
     * @return 操作结果
     */
    R<?> rebuildPointsRuleCache();


    /**
     * 查询积分规则列表
     *
     * @param dto 查询参数
     * @return 查询结果(积分规则分页列表)
     */
    R<PageQueryVO<PointsRuleListVO>> queryPointsRulesList(PointsRuleQueryDTO dto);


    /**
     * 获取积分规则详情
     *
     * @param id 积分规则ID
     * @return 查询结果(积分规则详情)
     */
    R<PointsRuleDetailVO> getPointsRuleDetail(Long id);


    /**
     * 获取默认积分规则
     *
     * @param changeType 积分变动类型
     * @param ruleType   积分规则类型
     * @return 查询结果(默认积分规则)
     */
    PointsRule getPrimaryPointsRule(PointsRuleEnum changeType, PointsRuleEnum ruleType);


    /**
     * 获取默认积分规则缓存
     *
     * @param changeType 积分变动类型
     * @param ruleType   积分规则类型
     * @return 查询结果(积分规则缓存)
     */
    PointsRuleCacheDTO getPrimaryPointsRuleCache(String changeType, String ruleType);


    /**
     * 根据积分规则ID获取积分规则缓存
     *
     * @return 查询结果(积分规则缓存)
     */
    PointsRuleCacheDTO getPointsRuleCache(Serializable id);


    /**
     * 根据积分变动类型规则类型查询积分规则缓存列表
     *
     * @param changeType 积分变动类型
     * @param ruleType   积分规则类型
     * @return 查询结果(积分规则缓存列表)
     */
    List<PointsRuleCacheDTO> queryPointRuleCacheList(String changeType, String ruleType);


    /**
     * 签到阶梯式积分奖励积分规则转换
     *
     * @param extraRules 签到阶梯式积分奖励积分规则
     * @return 签到阶梯式积分奖励积分规则明细列表
     */
    List<PointsRule.SignInRewardRule> convertSignInRewardPointsRule(List<String> extraRules);


    /**
     * 订单积分奖励积分规则转换
     *
     * @param extraRules 订单积分奖励积分规则
     * @return 订单积分奖励积分规则明细列表
     */
    List<PointsRule.OrderEarnRule> convertOrderEarnPointsRule(List<String> extraRules);


    /**
     * 评价积分奖励积分规则转换
     *
     * @param extraRules 评价积分奖励积分规则
     * @return 评价积分奖励积分规则JSON
     */
    List<PointsRule.CommentEarnRule> convertCommentRewardPointsRule(List<String> extraRules);


}