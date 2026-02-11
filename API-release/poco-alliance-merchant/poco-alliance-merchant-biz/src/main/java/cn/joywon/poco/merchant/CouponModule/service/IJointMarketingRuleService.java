package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingRuleCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingRuleUpdateDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRule;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingRuleVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface IJointMarketingRuleService extends IService<JointMarketingRule> {

    /**
     * 创建联合营销规则
     * @param dto 创建参数
     * @return 规则ID
     */
    R<Long> createRule(JointMarketingRuleCreateDTO dto);

    /**
     * 查询计划下的规则列表
     * @param planId 计划ID
     * @return 规则列表
     */
    R<List<JointMarketingRuleVO>> listRulesByPlanId(Long planId);

    /**
     * 删除联合营销规则
     *
     * @param ruleId 规则ID
     * @return 是否成功
     */
    R<Boolean> deleteRule(Long ruleId);

    /**
     * 更新联合营销规则
     *
     * @param dto 更新规则参数
     * @return 是否成功
     */
    R<Boolean> updateRule(JointMarketingRuleUpdateDTO dto);
}
