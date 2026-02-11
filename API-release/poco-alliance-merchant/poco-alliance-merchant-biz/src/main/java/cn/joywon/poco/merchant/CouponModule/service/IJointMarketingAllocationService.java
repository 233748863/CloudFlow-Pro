package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingAllocation;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingAllocationUpdateDTO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingAllocationVO;
import com.baomidou.mybatisplus.extension.service.IService;

import java.util.List;

public interface IJointMarketingAllocationService extends IService<JointMarketingAllocation> {

    /**
     * 删除分润配置
     *
     * @param allocationId 分润配置ID
     * @return 是否删除成功
     */
    R<Boolean> deleteAllocation(String allocationId);

    /**
     * 更新分润配置
     *
     * @param dto 分润配置更新参数
     * @return 是否更新成功
     */
    R<Boolean> updateAllocation(JointMarketingAllocationUpdateDTO dto);

    /**
     * 校验分润配置
     *
     * @param planId 联合营销计划ID
     */
    void validateProfitSharingConfig(Long planId);

    /**
     * 根据规则ID查询分润配置列表
     *
     * @param ruleId 联合营销规则ID
     * @return 分润配置列表
     */
    R<List<JointMarketingAllocationVO>> listAllocationsByRuleId(Long ruleId);

}