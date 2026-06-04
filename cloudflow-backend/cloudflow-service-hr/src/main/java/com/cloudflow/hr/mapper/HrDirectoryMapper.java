package com.cloudflow.hr.mapper;

import com.cloudflow.hr.domain.vo.HrDeptSummaryVO;
import com.cloudflow.hr.domain.vo.HrEmployeeSummaryVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Collection;
import java.util.List;

@Mapper
public interface HrDirectoryMapper {

    @Select("""
            <script>
            SELECT e.id AS employeeId,
                   e.employee_no AS employeeNo,
                   e.name AS employeeName,
                   e.birth_date AS birthDate,
                   e.dept_id AS deptId,
                   e.position_id AS positionId,
                   e.employee_status AS status,
                   e.user_id AS userId,
                   d.dept_name AS deptName,
                   p.position_name AS positionName
            FROM hr_employee e
            LEFT JOIN sys_dept d ON d.dept_id = e.dept_id
            LEFT JOIN hr_position p ON p.id = e.position_id
            WHERE e.deleted = 0
              AND e.tenant_id = #{tenantId}
              AND e.id = #{employeeId}
            LIMIT 1
            </script>
            """)
    HrEmployeeSummaryVO findEmployee(@Param("tenantId") long tenantId, @Param("employeeId") Long employeeId);

    @Select("""
            <script>
            SELECT e.id AS employeeId,
                   e.employee_no AS employeeNo,
                   e.name AS employeeName,
                   e.birth_date AS birthDate,
                   e.dept_id AS deptId,
                   e.position_id AS positionId,
                   e.employee_status AS status,
                   e.user_id AS userId,
                   d.dept_name AS deptName,
                   p.position_name AS positionName
            FROM hr_employee e
            LEFT JOIN sys_dept d ON d.dept_id = e.dept_id
            LEFT JOIN hr_position p ON p.id = e.position_id
            WHERE e.deleted = 0
              AND e.tenant_id = #{tenantId}
              AND e.user_id = #{userId}
            LIMIT 1
            </script>
            """)
    HrEmployeeSummaryVO findEmployeeByUserId(@Param("tenantId") long tenantId, @Param("userId") Long userId);

    @Select("""
            <script>
            SELECT e.id AS employeeId,
                   e.employee_no AS employeeNo,
                   e.name AS employeeName,
                   e.birth_date AS birthDate,
                   e.dept_id AS deptId,
                   e.position_id AS positionId,
                   e.employee_status AS status,
                   e.user_id AS userId,
                   d.dept_name AS deptName,
                   p.position_name AS positionName
            FROM hr_employee e
            LEFT JOIN sys_dept d ON d.dept_id = e.dept_id
            LEFT JOIN hr_position p ON p.id = e.position_id
            WHERE e.deleted = 0
              AND e.tenant_id = #{tenantId}
              AND e.id IN
              <foreach collection="ids" item="id" open="(" separator="," close=")">
                #{id}
              </foreach>
            </script>
            """)
    List<HrEmployeeSummaryVO> listEmployees(@Param("tenantId") long tenantId, @Param("ids") Collection<Long> ids);

    @Select("""
            <script>
            SELECT e.id AS employeeId,
                   e.employee_no AS employeeNo,
                   e.name AS employeeName,
                   e.birth_date AS birthDate,
                   e.dept_id AS deptId,
                   e.position_id AS positionId,
                   e.employee_status AS status,
                   e.user_id AS userId,
                   d.dept_name AS deptName,
                   p.position_name AS positionName
            FROM hr_employee e
            LEFT JOIN sys_dept d ON d.dept_id = e.dept_id
            LEFT JOIN hr_position p ON p.id = e.position_id
            WHERE e.deleted = 0
              AND e.tenant_id = #{tenantId}
              AND e.user_id IN
              <foreach collection="userIds" item="userId" open="(" separator="," close=")">
                #{userId}
              </foreach>
            </script>
            """)
    List<HrEmployeeSummaryVO> listEmployeesByUserIds(@Param("tenantId") long tenantId, @Param("userIds") Collection<Long> userIds);

    @Select("""
            <script>
            SELECT dept_id AS deptId,
                   dept_name AS deptName,
                   parent_id AS parentId,
                   status
            FROM sys_dept
            WHERE deleted = 0
              AND tenant_id = #{tenantId}
            <if test="deptIds != null and deptIds.size() &gt; 0">
              AND dept_id IN
              <foreach collection="deptIds" item="deptId" open="(" separator="," close=")">
                #{deptId}
              </foreach>
            </if>
            </script>
            """)
    List<HrDeptSummaryVO> listDepartments(@Param("tenantId") long tenantId, @Param("deptIds") Collection<Long> deptIds);
}
