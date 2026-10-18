package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.HrAppraisalRequests;
import com.cloudflow.hr.domain.entity.HrAppraisalCycle;
import com.cloudflow.hr.domain.vo.performance.HrAppraisalViews;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

public interface HrAppraisalCycleMapper extends BaseMapper<HrAppraisalCycle> {
    Long lockCycle(@Param("tenantId") Long tenantId, @Param("cycleId") Long cycleId);
    Page<Long> pageCycles(Page<Long> page, @Param("tenantId") Long tenantId,
            @Param("query") HrAppraisalRequests.Query query, @Param("scope") HrSkillMapper.EmployeeScope scope,
            @Param("mine") boolean mine, @Param("operator") String operator);
    List<HrAppraisalViews.Employee> preview(@Param("tenantId") Long tenantId, @Param("cycle") HrAppraisalCycle cycle,
            @Param("scope") HrSkillMapper.EmployeeScope scope, @Param("today") LocalDate today);
    List<Long> visibleEmployees(@Param("tenantId") Long tenantId, @Param("cycleId") Long cycleId,
            @Param("scope") HrSkillMapper.EmployeeScope scope);
    List<Long> validScopeIds(@Param("tenantId") Long tenantId, @Param("kind") String kind, @Param("identifiers") List<Long> identifiers);
    List<HrAppraisalViews.SourceInput> sourceInputs(@Param("tenantId") Long tenantId, @Param("cycleId") Long cycleId,
            @Param("employeeId") Long employeeId);
    List<Long> employeesForUser(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
    List<HrAppraisalViews.Option> options(@Param("tenantId") Long tenantId, @Param("kind") String kind);
    List<HrAppraisalViews.Option> meetingPeople(@Param("tenantId") Long tenantId, @Param("userIds") List<Long> userIds);
    Page<HrAppraisalViews.Employee> people(Page<HrAppraisalViews.Employee> page, @Param("tenantId") Long tenantId,
            @Param("query") HrAppraisalRequests.Query query, @Param("scope") HrSkillMapper.EmployeeScope scope,
            @Param("today") LocalDate today);
}
