package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_job_level")
public class HrJobLevelPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String levelCode;
    private String levelName;
    private String levelSeries;
    private Integer levelRank;
    private String description;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
