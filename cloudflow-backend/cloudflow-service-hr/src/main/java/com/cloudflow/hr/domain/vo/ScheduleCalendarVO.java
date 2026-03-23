package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.YearMonth;
import java.util.List;

/**
 * 排班日历视图对象
 * 用于返回员工的月度排班日历
 */
@Data
public class ScheduleCalendarVO {
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 员工姓名
     */
    private String employeeName;
    
    /**
     * 年月
     */
    private YearMonth yearMonth;
    
    /**
     * 排班计划列表
     */
    private List<SchedulePlanVO> schedulePlans;
    
    /**
     * 统计信息
     */
    private ScheduleStatistics statistics;
    
    /**
     * 排班统计信息内部类
     */
    @Data
    public static class ScheduleStatistics {
        /**
         * 总排班天数
         */
        private Integer totalDays;
        
        /**
         * 工作日天数
         */
        private Integer workDays;
        
        /**
         * 休息日天数
         */
        private Integer restDays;
        
        /**
         * 预计工作时长（小时）
         */
        private Double expectedWorkHours;
    }
}
