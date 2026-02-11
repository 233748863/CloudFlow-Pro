package cn.joywon.poco.merchant.ReportModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.ReportModule.entity.ReportPlatformOverview;
import org.apache.ibatis.annotations.Mapper;

/**
 * 平台运营概览报表Mapper
 * 仅平台管理员可访问
 *
 * @author poco
 * @date 2025-01-05
 */
@Mapper
public interface ReportPlatformOverviewMapper extends PocoBaseMapper<ReportPlatformOverview> {
}
