package cn.joywon.poco.merchant.CouponModule.service;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.Common.page.PageQueryVO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingApplyJoinPlanDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingPlanCreateDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingPlanPageDTO;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingPlanUpdateDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingPlan;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingPlanVO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingStatisticsVO;
import cn.joywon.poco.merchant.PlatformModule.dto.JointMarketingPendingDTO;
import cn.joywon.poco.merchant.PlatformModule.dto.JointMarketingPlanAuditDTO;
import com.baomidou.mybatisplus.extension.service.IService;

public interface IJointMarketingPlanService extends IService<JointMarketingPlan> {

    /**
     * 创建联合营销计划
     *
     * @param dto 创建参数
     * @return 计划ID
     */
    R<Long> createPlan(JointMarketingPlanCreateDTO dto);

    /**
     * 更新联合营销计划
     *
     * @param dto 更新参数
     * @return 是否成功
     */
    R<Boolean> updatePlan(JointMarketingPlanUpdateDTO dto);

    /**
     * 审核联合营销计划
     *
     * @param dto 审核参数
     * @return 处理结果
     */
    R<?> auditPlan(JointMarketingPlanAuditDTO dto);

    /**
     * 获取待审核计划列表
     *
     * @param dto 待审核计划查询参数
     * @return 待审核计划列表
     */
    R<PageQueryVO<JointMarketingPlanVO>> getPendingList(JointMarketingPendingDTO dto);

    /**
     * 分页查询联合营销计划(仅能查看自己发布的计划)
     *
     * @param dto 查询参数
     * @return 分页结果
     */
    R<PageQueryVO<JointMarketingPlanVO>> pagePlan(JointMarketingPlanPageDTO dto);

    /**
     * 分页查询联合营销计划(多条件查询)
     *
     * @param dto 联合营销计划分页查询参数
     * @return 联合营销计划分页查询结果
     */
    R<PageQueryVO<JointMarketingPlanVO>> queryPlans(JointMarketingPlanPageDTO dto);

    /**
     * 获取联合营销计划统计数据
     *
     * @param planId 计划ID
     * @return 统计数据
     */
    R<JointMarketingStatisticsVO> getStatistics(Long planId);

    /**
     * 发布联合营销计划
     *
     * @param planId 计划ID
     */
    void publishPlan(Long planId);

    /**
     * 关闭联合营销计划
     *
     * @param planId 计划ID
     * @return 是否成功
     */
    R<Boolean> closePlan(Long planId);

    /**
     * 获取联合营销计划详情
     *
     * @param planId 计划ID
     * @return 计划详情
     */
    R<JointMarketingPlanVO> getPlanDetail(Long planId);


    /**
     * 查询我可申请加入的联合营销计划列表
     *
     * @param dto 联合营销计划查询参数
     * @return 联合营销计划列表
     */
    R<PageQueryVO<JointMarketingPlanVO>> queryApplyJoinPlanList(JointMarketingApplyJoinPlanDTO dto);

}