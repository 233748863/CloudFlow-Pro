package com.cloudflow.hr.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 假期额度补齐明细VO
 */
@Data
public class LeaveQuotaInitItemVO {

    /**
     * 假期类型ID
     */
    private Long leaveTypeId;

    /**
     * 假期类型名称
     */
    private String leaveTypeName;

    /**
     * 处理结果：CREATED / REFRESHED / SKIPPED
     */
    private String action;

    /**
     * 结果说明
     */
    private String message;

    /**
     * 处理后总额度
     */
    private BigDecimal totalQuota;

    /**
     * 处理后过期日期
     */
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expiryDate;
}
