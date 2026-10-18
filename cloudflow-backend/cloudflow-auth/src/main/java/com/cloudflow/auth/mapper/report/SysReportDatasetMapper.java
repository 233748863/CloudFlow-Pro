package com.cloudflow.auth.mapper.report;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.report.SysReportDataset;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface SysReportDatasetMapper extends BaseMapper<SysReportDataset> {
    List<SysReportDataset> registered(@Param("tenantId") Long tenantId);
    SysReportDataset byCode(@Param("tenantId") Long tenantId, @Param("code") String code);
    SysReportDataset byId(@Param("tenantId") Long tenantId, @Param("id") Long id);
    int registerMissing(@Param("record") SysReportDataset record);
}
