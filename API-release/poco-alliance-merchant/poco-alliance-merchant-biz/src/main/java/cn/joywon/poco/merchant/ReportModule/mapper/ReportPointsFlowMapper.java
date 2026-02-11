package cn.joywon.poco.merchant.ReportModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ReportModule.entity.ReportPointsFlow;
import org.apache.ibatis.annotations.Mapper;

/**
 * 积分流水报表Mapper
 * 支持DataScope权限过滤
 *
 * @author poco
 * @date 2025-01-05
 */
@Mapper
public interface ReportPointsFlowMapper extends PocoBaseMapper<ReportPointsFlow> {
}
