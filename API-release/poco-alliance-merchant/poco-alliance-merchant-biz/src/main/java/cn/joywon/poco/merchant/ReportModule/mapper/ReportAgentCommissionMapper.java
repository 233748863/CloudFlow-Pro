package cn.joywon.poco.merchant.ReportModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ReportModule.entity.ReportAgentCommission;
import org.apache.ibatis.annotations.Mapper;

/**
 * 区域代理佣金报表Mapper
 * 仅平台管理员可访问
 * 支持DataScope权限过滤
 *
 * @author poco
 * @date 2025-01-05
 */
@Mapper
public interface ReportAgentCommissionMapper extends PocoBaseMapper<ReportAgentCommission> {
}
