package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_comp_component")
public class HrCompComponentPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String componentCode;
    private String componentName;
    private String componentType;
    private String category;
    private Integer taxable;
    private Integer sortOrder;
    private Integer status;
    private LocalDateTime createTime;
    @Version
    private Integer version;
    private LocalDateTime updateTime;
}
