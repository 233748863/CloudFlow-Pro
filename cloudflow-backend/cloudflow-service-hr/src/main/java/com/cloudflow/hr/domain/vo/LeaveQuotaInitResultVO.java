package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 假期额度补齐结果VO
 */
@Data
public class LeaveQuotaInitResultVO {

    /**
     * 员工ID
     */
    private Long employeeId;

    /**
     * 员工姓名
     */
    private String employeeName;

    /**
     * 年度
     */
    private Integer year;

    /**
     * 处理模式：SINGLE / BATCH
     */
    private String mode;

    /**
     * 本次纳入处理的假种数量
     */
    private Integer requestedCount;

    /**
     * 新建数量
     */
    private Integer createdCount;

    /**
     * 刷新数量
     */
    private Integer refreshedCount;

    /**
     * 跳过数量
     */
    private Integer skippedCount;

    /**
     * 明细列表
     */
    private List<LeaveQuotaInitItemVO> items = new ArrayList<>();
}
