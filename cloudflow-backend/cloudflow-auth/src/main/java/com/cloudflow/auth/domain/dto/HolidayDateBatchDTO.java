package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 批量保存节假日明细。
 */
@Data
public class HolidayDateBatchDTO {
    @NotNull(message = "日历ID不能为空")
    private Long calendarId;
    @NotNull(message = "年份不能为空")
    private Integer yearNo;
    private List<HolidayDateItemDTO> dates;
}
