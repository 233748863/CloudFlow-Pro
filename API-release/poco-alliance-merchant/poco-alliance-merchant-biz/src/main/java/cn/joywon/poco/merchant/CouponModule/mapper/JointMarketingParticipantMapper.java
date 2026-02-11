package cn.joywon.poco.merchant.CouponModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.CouponModule.dto.JointMarketingInviteQueryDTO;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingParticipant;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingApplyJoinVO;
import cn.joywon.poco.merchant.CouponModule.vo.JointMarketingInviteRecordVO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface JointMarketingParticipantMapper extends PocoBaseMapper<JointMarketingParticipant> {

    /**
     * 查询联合营销邀请记录
     *
     * @param page 分页参数
     * @param dto  查询参数
     * @return 联合营销邀请记录分页列表
     */
    Page<JointMarketingInviteRecordVO> queryInviteRecord(@Param("page") Page<JointMarketingInviteRecordVO> page,
                                                         @Param("dto") JointMarketingInviteQueryDTO dto);

    /**
     * 获取联合营销计划申请加入列表
     *
     * @param page   分页参数
     * @param planId 联合营销计划ID
     * @return 联合营销计划申请加入列表
     */
    IPage<JointMarketingApplyJoinVO> getApplyJoinList(@Param("page") Page<JointMarketingApplyJoinVO> page,
                                                      @Param("planId") Long planId);

}