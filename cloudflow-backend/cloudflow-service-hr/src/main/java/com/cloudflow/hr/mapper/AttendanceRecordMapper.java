package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.AttendanceRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 打卡记录Mapper接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Mapper
public interface AttendanceRecordMapper extends BaseMapper<AttendanceRecord> {
    
    /**
     * 查询员工某天的打卡记录
     * 
     * @param employeeId 员工ID
     * @param attendanceDate 考勤日期
     * @param checkType 打卡类型
     * @return 打卡记录
     */
    AttendanceRecord selectByEmployeeAndDate(@Param("employeeId") Long employeeId,
                                             @Param("attendanceDate") LocalDate attendanceDate,
                                             @Param("checkType") String checkType);
    
    /**
     * 查询员工某天的所有打卡记录
     * 
     * @param employeeId 员工ID
     * @param attendanceDate 考勤日期
     * @return 打卡记录列表
     */
    List<AttendanceRecord> selectByEmployeeAndDateAll(@Param("employeeId") Long employeeId,
                                                       @Param("attendanceDate") LocalDate attendanceDate);
    
    /**
     * 查询员工某个时间段的打卡记录
     * 
     * @param employeeId 员工ID
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @return 打卡记录列表
     */
    List<AttendanceRecord> selectByEmployeeAndDateRange(@Param("employeeId") Long employeeId,
                                                         @Param("startDate") LocalDate startDate,
                                                         @Param("endDate") LocalDate endDate);
}
