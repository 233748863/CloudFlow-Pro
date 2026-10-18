package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 消息模板维护请求。
 */
@Data
public class MessageTemplateDTO {
    private Long templateId;
    @NotBlank(message = "模板编码不能为空")
    private String templateCode;
    @NotBlank(message = "模板名称不能为空")
    private String templateName;
    @NotBlank(message = "渠道类型不能为空")
    private String channelType;
    private String bizModule;
    private String messageCategory;
    private String titleTemplate;
    @NotBlank(message = "内容模板不能为空")
    private String contentTemplate;
    private String paramsDeclare;
    private Integer forceSendFlag;
    private Integer dedupeWindowSec;
    private String linkUrlTemplate;
    private String status;
    private String remark;
}
