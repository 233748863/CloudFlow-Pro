package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_self_service_message")
public class HrSelfServiceMessagePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private String category;
    private String title;
    private String summary;
    private String linkUrl;
    private Long relatedId;
    private Boolean readFlag;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
