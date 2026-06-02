package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_training_category")
public class HrTrainingCategoryPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long parentId;
    private String name;
    private Integer sort;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
