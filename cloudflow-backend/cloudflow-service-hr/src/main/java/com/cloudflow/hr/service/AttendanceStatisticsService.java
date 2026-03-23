package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.AttendanceAnomalyQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceMonthlyQueryDTO;
import com.cloudflow.hr.domain.dto.AttendanceReportExportDTO;
import com.cloudflow.hr.domain.vo.AttendanceAnomalyVO;
import com.cloudflow.hr.domain.vo.AttendanceMonthlyVO;
import com.cloudflow.hr.domain.vo.AttendanceRateVO;

import java.util.List;

/**
 * 考勤统计服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface AttendanceStatisticsService {

    /**
     * 生成月度考勤汇总（批量生成所有员工）
     * 
     * @param year 年份
     * @param month 月份
     */
    void generateMonthlyAttendance(Integer year, Integer month);

    /**
     * 生成员工月度考勤汇总
     * 
     * @param employeeId 员工ID
     * @param year 年份
     * @param month 月份
     */
    void generateEmployeeMonthlyAttendance(Long employeeId, Integer year, Integer month);

    /**
     * 获取员工月度考勤汇总
     * 
     * @param employeeId 员工ID
     * @param year 年份
     * @param month 月份
     * @return 月度考勤汇总
     */
    AttendanceMonthlyVO getMonthlyAttendance(Long employeeId, Integer year, Integer month);

    /**
     * 查询月度考勤汇总列表
     * 
     * @param query 查询条件
     * @return 月度考勤汇总列表
     */
    List<AttendanceMonthlyVO> listMonthlyAttendance(AttendanceMonthlyQueryDTO query);

    /**
     * 查询异常考勤统计
     * 
     * @param query 查询条件
     * @return 异常考勤列表
     */
    List<AttendanceAnomalyVO> listAttendanceAnomalies(AttendanceAnomalyQueryDTO query);

    /**
     * 获取部门出勤率分析
     * 
     * @param deptId 部门ID（可选，不填则统计全公司）
     * @param year 年份
     * @param month 月份
     * @return 出勤率分析数据
     */
    AttendanceRateVO getAttendanceRate(Long deptId, Integer year, Integer month);

    /**
     * 导出考勤报表
     * 
     * @param dto 导出参数
     * @return 文件URL
     */
    String exportAttendanceReport(AttendanceReportExportDTO dto);
}
