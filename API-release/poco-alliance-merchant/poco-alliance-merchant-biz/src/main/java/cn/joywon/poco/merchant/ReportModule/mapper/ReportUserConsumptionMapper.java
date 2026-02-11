package cn.joywon.poco.merchant.ReportModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ReportModule.entity.ReportUserConsumption;
import org.apache.ibatis.annotations.Mapper;

/**
 * 用户消费分析报表Mapper
 * 支持DataScope权限过滤
 *
 * @author poco
 * @date 2025-01-05
 */
@Mapper
public interface ReportUserConsumptionMapper extends PocoBaseMapper<ReportUserConsumption> {
}
