package cn.joywon.poco.merchant.ReportModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ReportModule.entity.ReportJointMarketing;
import org.apache.ibatis.annotations.Mapper;

/**
 * 联合营销效果报表Mapper
 * 支持DataScope权限过滤
 *
 * @author poco
 * @date 2025-01-05
 */
@Mapper
public interface ReportJointMarketingMapper extends PocoBaseMapper<ReportJointMarketing> {
}
