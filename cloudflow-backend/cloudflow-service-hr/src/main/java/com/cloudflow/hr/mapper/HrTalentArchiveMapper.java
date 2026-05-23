package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

/**
 * 人才档案聚合查询 Mapper：单员工历次盘点、所在池、培养行动、继任提名一站式纵览。
 * 跨表聚合视图，不属于单表 CRUD，因此不继承 BaseMapper。
 */
@Mapper
public interface HrTalentArchiveMapper {

    Map<String, Object> selectEmployeeBrief(@Param("employeeId") Long employeeId,
                                            @Param("tenantId") Long tenantId);

    List<Map<String, Object>> selectArchiveReviews(@Param("employeeId") Long employeeId,
                                                   @Param("tenantId") Long tenantId);

    List<Map<String, Object>> selectArchivePools(@Param("employeeId") Long employeeId,
                                                 @Param("tenantId") Long tenantId);

    List<Map<String, Object>> selectArchiveDevelopmentActions(@Param("employeeId") Long employeeId,
                                                              @Param("tenantId") Long tenantId);

    List<Map<String, Object>> selectArchiveSuccessors(@Param("employeeId") Long employeeId,
                                                      @Param("tenantId") Long tenantId);
}
