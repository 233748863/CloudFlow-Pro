package cn.joywon.poco.merchant.ReportModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ReportModule.entity.ReportHourlySales;
import org.apache.ibatis.annotations.Mapper;

/**
 * 时段销售趋势报表Mapper
 * 支持DataScope权限过滤
 *
 * @author poco
 * @date 2025-01-05
 */
@Mapper
public interface ReportHourlySalesMapper extends PocoBaseMapper<ReportHourlySales> {
}
