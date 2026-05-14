package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_position")
public class HrPositionPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String positionCode;
    private String positionName;
    private Long familyId;
    private Long levelId;
    private Long postId;
    private String jobDescription;
    private String requirements;
    private Integer status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
