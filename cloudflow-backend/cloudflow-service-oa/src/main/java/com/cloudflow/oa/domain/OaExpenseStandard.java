package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * OA-P0-3 费用标准（按职级 × 类别 × 城市）。
 */
@Data
@TableName("oa_expense_standard")
public class OaExpenseStandard implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long standardId;

    private Long tenantId;
    /** 职级编码(对应 hr_emp_position_level.level_code 或自由文本) */
    private String positionLevel;
    /** 报销类别 TRAVEL/OFFICE/ENTERTAIN/TRANSPORT/OTHER */
    private String category;
    /** 城市/区域(可空表示通用) */
    private String city;
    /** 限额(单笔或日累计, 按 limitType 区分) */
    private BigDecimal limitAmount;
    /** 限额类型 PER_ITEM/DAILY/MONTHLY/YEARLY */
    private String limitType;
    /** 状态 ACTIVE/INACTIVE */
    private String status;
    private String remark;
    private Integer deleted;
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;

    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}
