package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("hr_training_plan")
public class HrTrainingPlanPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String planNo;
    private String planName;
    private String planType;

    @TableField("`year`")
    private Integer year;

    @TableField("`quarter`")
    private Integer quarter;

    private Long deptId;
    private Long ownerId;
    private BigDecimal budget;
    private String status;
    private String description;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
