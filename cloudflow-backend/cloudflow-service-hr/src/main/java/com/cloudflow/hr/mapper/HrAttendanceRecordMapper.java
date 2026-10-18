package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.cloudflow.hr.domain.dto.attendance.HrAttendanceCommonQueryDTO;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import com.cloudflow.hr.domain.vo.attendance.HrAttendanceRecordVO;
import com.cloudflow.hr.service.HrEmployeeReadScope;
import org.apache.ibatis.annotations.Param;

import java.util.Map;

public interface HrAttendanceRecordMapper extends BaseMapper<HrAttendanceRecord> {
    IPage<HrAttendanceRecordVO> selectAccessiblePage(IPage<HrAttendanceRecordVO> page, @Param("tenantId") Long tenantId,
                                                   @Param("query") HrAttendanceCommonQueryDTO query, @Param("scope") HrEmployeeReadScope scope);

    java.util.List<HrAttendanceRecordVO> selectAccessibleList(@Param("tenantId") Long tenantId,
                                                            @Param("query") HrAttendanceCommonQueryDTO query, @Param("scope") HrEmployeeReadScope scope);

    java.util.List<HrAttendanceRecord> selectEmployeeDates(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
                                                         @Param("from") java.time.LocalDate from, @Param("to") java.time.LocalDate to);

    int insertCalculatedBatch(@Param("records") java.util.List<HrAttendanceRecord> records);
    int updateCalculatedBatch(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
                              @Param("records") java.util.List<HrAttendanceRecord> records);
    int linkCalculatedCheckins(@Param("tenantId") Long tenantId, @Param("employeeId") Long employeeId,
                              @Param("dates") java.util.List<java.time.LocalDate> dates);

    /**
     * 按 id+租户 取整行原始字段为 Map（含 snake_case 列名），用于审计 before 快照。
     * 找不到返回 null。
     */
    Map<String, Object> selectRowAsMap(@Param("id") Long id, @Param("tenantId") Long tenantId);

}
