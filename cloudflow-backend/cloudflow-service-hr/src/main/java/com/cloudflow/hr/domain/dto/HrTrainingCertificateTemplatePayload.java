package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@TableName(value = "hr_training_certificate_template", autoResultMap = true)
public class HrTrainingCertificateTemplatePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String templateCode;
    private String templateName;
    private String backgroundUrl;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> fields;

    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    @Version
    private Integer version;
}
