package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrGrievance;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;

public interface HrGrievanceMapper extends BaseMapper<HrGrievance> {
    List<HrGrievance> selectDisputeSources(@Param("tenantId") Long tenantId, @Param("disputeId") Long disputeId);
    List<Map<String, Object>> selectHrUsers(@Param("tenantId") Long tenantId);
    List<Map<String, Object>> selectHandlers(@Param("tenantId") Long tenantId);
    Map<String, Object> selectActiveUser(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    String selectDeptName(@Param("tenantId") Long tenantId, @Param("deptId") Long deptId);
}
