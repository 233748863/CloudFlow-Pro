package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrPayrollCorrection;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface HrPayrollCorrectionMapper extends BaseMapper<HrPayrollCorrection> {
    @Select("""
            SELECT EXISTS (
                SELECT 1 FROM hr_payroll_correction correction
                JOIN hr_salary_slip slip ON slip.id = correction.correction_slip_id
                    AND slip.tenant_id = correction.tenant_id AND slip.deleted = 0
                WHERE correction.tenant_id = #{tenantId} AND correction.deleted = 0
                    AND correction.status = 'PENDING' AND slip.employee_id = #{employeeId}
                    AND slip.period_month >= #{firstMonth} AND slip.period_month < #{nextYearMonth}
            )
            """)
    boolean hasPendingForEmployeeYear(@Param("tenantId") Long tenantId,
                                     @Param("employeeId") Long employeeId,
                                     @Param("firstMonth") String firstMonth,
                                     @Param("nextYearMonth") String nextYearMonth);
}
