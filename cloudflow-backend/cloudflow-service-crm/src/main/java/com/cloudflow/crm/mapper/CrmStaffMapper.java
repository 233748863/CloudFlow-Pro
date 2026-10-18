package com.cloudflow.crm.mapper;

import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CrmStaffMapper {
    Long selectUserDept(@Param("userId") Long userId);
    Department selectDepartment(@Param("deptId") Long deptId);
    List<Long> selectLeaderUsers(@Param("leader") String leader);

    @Data
    class Department {
        private Long deptId;
        private Long parentId;
        private String leader;
    }
}
