package cn.joywon.poco.merchant.CouponModule.mapper;

import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingPlanPageDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingPlan;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingPlanVO;
import cn.joywon.poco.merchant.PlatformModule.dto.JointMarketingPendingDTO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface JointMarketingPlanMapper extends PocoBaseMapper<JointMarketingPlan> {

    /**
     * 获取待审核的联合营销计划列表
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 待审核的联合营销计划列表
     */
    IPage<JointMarketingPlanVO> getPendingList(@Param("page") Page<JointMarketingPlanVO> page,
                                               @Param("dto") JointMarketingPendingDTO dto);

    /**
     * 分页查询联合营销计划
     *
     * @param page      分页参数
     * @param dto       查询参数
     * @param dataScope 数据权限范围
     * @return 联合营销计划分页数据
     */
    IPage<JointMarketingPlanVO> pagePlan(
            Page<JointMarketingPlanVO> page,
            @Param("dto") JointMarketingPlanPageDTO dto,
            @Param("dataScope") DataScope dataScope
    );

    /**
     * 查询已加入的联合营销计划
     *
     * @param page       分页参数
     * @param dto        查询参数
     * @param merchantId 当前商家ID
     * @return 联合营销计划列表
     */
    IPage<JointMarketingPlanVO> queryRelatedPlans(@Param("page") Page<JointMarketingPlanVO> page,
                                                  @Param("dto") JointMarketingPlanPageDTO dto,
                                                  @Param("merchantId") Long merchantId);

    /**
     * 统计联合营销计划
     *
     * @param dto       查询参数
     * @param dataScope 数据权限范围
     * @return 总数
     */
    Long countPlan(
            @Param("dto") JointMarketingPlanPageDTO dto,
            @Param("dataScope") DataScope dataScope
    );

    /**
     * 根据发布计划的商家ID查询我可申请加入的联合营销计划列表
     *
     * @param page        分页参数
     * @param merchantIds 发布计划的商家ID列表
     * @param planName    联合营销计划名称
     * @return 联合营销计划列表
     */
    IPage<JointMarketingPlanVO> queryApplyJoinPlanListByMerchant(@Param("page") Page<JointMarketingPlanVO> page,
                                                                 @Param("merchantIds") List<Long> merchantIds,
                                                                 @Param("planName") String planName);

    /**
     * 根据发布计划的商家ID查询我可申请加入的联合营销计划列表(连表查询商家信息)
     *
     * @param page        分页参数
     * @param merchantIds 发布计划的商家ID列表
     * @param planName    联合营销计划名称
     * @return 联合营销计划列表
     */
    IPage<JointMarketingPlanVO> queryApplyJoinPlanListByMerchantIds(@Param("page") Page<JointMarketingPlanVO> page,
                                                                    @Param("merchantIds") List<Long> merchantIds,
                                                                    @Param("planName") String planName);

}