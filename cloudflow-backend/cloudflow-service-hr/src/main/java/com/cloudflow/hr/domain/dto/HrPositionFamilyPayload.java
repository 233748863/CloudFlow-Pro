package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_position_family")
public class HrPositionFamilyPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String familyCode;
    private String familyName;
    private String description;
    private Integer sortOrder;
    private Integer status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;
}
