package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.HrSkillRequests;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.domain.entity.HrEmployeeSkill;
import com.cloudflow.hr.domain.entity.HrPosition;
import com.cloudflow.hr.domain.entity.HrSkill;
import com.cloudflow.hr.domain.entity.HrTrainingCourse;
import com.cloudflow.hr.domain.vo.skill.HrSkillViews;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public interface HrSkillMapper extends BaseMapper<HrSkill> {
    HrEmployee lockEmployee(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId);
    HrPosition lockPosition(@Param("tenantId") Long tenantId, @Param("positionId") Long positionId);
    HrTrainingCourse lockCourse(@Param("tenantId") Long tenantId, @Param("courseId") Long courseId);
    int updateCourseTarget(@Param("tenantId") Long tenantId, @Param("courseId") Long courseId,
            @Param("input") HrSkillRequests.CourseTarget input, @Param("operator") String operator);
    int advancePositionVersion(@Param("tenantId") Long tenantId, @Param("positionId") Long positionId,
            @Param("version") Integer version);
    Page<HrEmployeeSkill> assessments(Page<HrEmployeeSkill> page, @Param("tenantId") Long tenantId,
            @Param("query") HrSkillRequests.Query query, @Param("scope") EmployeeScope scope,
            @Param("evidenceKey") String evidenceKey);
    Page<HrEmployee> employees(Page<HrEmployee> page, @Param("tenantId") Long tenantId,
            @Param("query") HrSkillRequests.Query query, @Param("scope") EmployeeScope scope,
            @Param("today") LocalDate today);
    List<HrSkillViews.Recommendation> recommendations(@Param("tenantId") Long tenantId,
            @Param("employeeId") Long employeeId, @Param("skillId") Long skillId,
            @Param("requiredLevel") int requiredLevel, @Param("now") LocalDateTime now);

    record EmployeeScope(int type, Long userId, Long deptId, List<Long> deptIds) { }
}
