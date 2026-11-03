package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface HrLookupMapper {

    String findDeptName(@Param("tenantId") long tenantId, @Param("deptId") Long deptId);

    String findPostName(@Param("tenantId") long tenantId, @Param("postId") Long postId);

    List<NamedReference> findDeptNames(@Param("tenantId") long tenantId, @Param("deptIds") List<Long> deptIds);

    boolean activeDepartmentExists(@Param("tenantId") long tenantId, @Param("deptId") Long deptId);

    record NamedReference(Long id, String name) { }
}
