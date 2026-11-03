package com.cloudflow.crm.mapper;

import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmStaffMapper {
    Long selectUserDept(@Param("userId") Long userId, @Param("tenantId") Long tenantId);
    Department selectDepartment(@Param("deptId") Long deptId, @Param("tenantId") Long tenantId);
    Long selectLeaderUser(@Param("userId") Long userId, @Param("tenantId") Long tenantId);

    @Data
    class Department {
        private Long deptId;
        private Long parentId;
        private Long leaderUserId;
    }
}
