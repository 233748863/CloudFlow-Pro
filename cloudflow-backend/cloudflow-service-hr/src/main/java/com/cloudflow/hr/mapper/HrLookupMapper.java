package com.cloudflow.hr.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface HrLookupMapper {

    @Select("""
            SELECT dept_name
            FROM sys_dept
            WHERE dept_id = #{deptId}
              AND (tenant_id = #{tenantId} OR tenant_id IS NULL)
            LIMIT 1
            """)
    String findDeptName(@Param("tenantId") long tenantId, @Param("deptId") Long deptId);

    @Select("""
            SELECT post_name
            FROM sys_post
            WHERE post_id = #{postId}
              AND (tenant_id = #{tenantId} OR tenant_id IS NULL)
            LIMIT 1
            """)
    String findPostName(@Param("tenantId") long tenantId, @Param("postId") Long postId);
}
