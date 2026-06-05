package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface HrLookupMapper {

    String findDeptName(@Param("tenantId") long tenantId, @Param("deptId") Long deptId);

    String findPostName(@Param("tenantId") long tenantId, @Param("postId") Long postId);
}
