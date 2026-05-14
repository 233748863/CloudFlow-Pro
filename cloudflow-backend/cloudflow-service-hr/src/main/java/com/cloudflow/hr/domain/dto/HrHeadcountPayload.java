package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_headcount")
public class HrHeadcountPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String targetType;
    private Long targetId;
    private String targetName;
    private Integer approvedCount;
    private Integer actualCount;
    private Integer vacancyCount;
    private LocalDate effectiveDate;
    private LocalDate expiryDate;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
