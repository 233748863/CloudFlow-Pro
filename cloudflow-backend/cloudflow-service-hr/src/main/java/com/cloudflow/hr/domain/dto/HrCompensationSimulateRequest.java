package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

/**
 * HR-P1-2 薪酬模拟请求体（不持久化）。
 */
@Data
public class HrCompensationSimulateRequest {

    /** 员工 ID（可选；提供时以员工现有薪酬为基础叠加 overrides）。 */
    private Long employeeId;

    /** 假设的薪酬结构 ID（必填）。 */
    private Long structureId;

    /** 假设的薪酬等级 ID（可选）。 */
    private Long gradeId;

    /** 城市（可选；用于个税专项扣除/社保基数地区差异计算）。 */
    private String city;

    /** 假设的薪酬项金额（key=componentCode，value=金额）。 */
    private Map<String, BigDecimal> componentOverrides;

    /** 假设的专项附加扣除（子女教育/赡养老人/房贷利息等，合计金额）。 */
    private BigDecimal specialDeductions;

    /** 假设的社保/公积金缴费基数。 */
    private BigDecimal socialBase;

    /** 假设的社保/公积金合计比例（个人侧，0-1）。 */
    private BigDecimal socialPersonalRate;
}
