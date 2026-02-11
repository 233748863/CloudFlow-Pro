package cn.joywon.poco.merchant.CouponModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingRebateRecord;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitRankDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitReportDTO;
import cn.joywon.poco.merchant.ReportModule.dto.JointMarketingProfitTrendDTO;
import cn.joywon.poco.merchant.ReportModule.vo.JointMarketingMerchantProfitRankVO;
import cn.joywon.poco.merchant.ReportModule.vo.JointMarketingProfitReportVO;
import cn.joywon.poco.merchant.ReportModule.vo.JointMarketingProfitTrendVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface JointMarketingRebateRecordMapper extends PocoBaseMapper<JointMarketingRebateRecord> {

    /**
     * 获取联合营销计划分润明细
     *
     * @param dto 查询参数
     * @return 联合营销计划分润明细
     */
    List<JointMarketingProfitReportVO.MerchantProfitDetail> getMerchantProfitDetails(@Param("dto") JointMarketingProfitReportDTO dto);

    /**
     * 获取联合营销时间维度统计
     *
     * @param dto 联合营销计划分润查询参数
     * @return 时间维度统计
     */
    List<JointMarketingProfitReportVO.TimeDimensionStat> getTimeDimensionStats(@Param("dto") JointMarketingProfitReportDTO dto);

    /**
     * 获取联合营销计划分润趋势
     *
     * @param dto 联合营销计划分润查询参数
     * @return 联合营销计划分润趋势
     */
    List<JointMarketingProfitTrendVO> getProfitTrendData(@Param("dto") JointMarketingProfitTrendDTO dto);

    /**
     * 获取联合营销商家分润排名
     *
     * @param dto 联合营销计划分润查询参数
     * @return 商家分润排名
     */
    List<JointMarketingMerchantProfitRankVO> getMerchantProfitRanking(@Param("dto") JointMarketingProfitRankDTO dto);

}