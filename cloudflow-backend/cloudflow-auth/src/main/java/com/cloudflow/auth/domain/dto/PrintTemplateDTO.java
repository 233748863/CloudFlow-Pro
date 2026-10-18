package com.cloudflow.auth.domain.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import lombok.Data;

/** 仅接收可编辑字段；租户、操作人和版本递增由服务端控制。 */
@Data
public class PrintTemplateDTO {
    private Long templateId;
    @NotBlank @Size(max = 50)
    private String templateCode;
    @NotBlank @Size(max = 100)
    private String templateName;
    @NotBlank @Size(max = 50)
    private String bizType;
    @NotBlank
    private String templateFormat;
    @NotBlank
    private String outputFormat;
    @Size(max = 1048576)
    private String templateContent;
    @Size(max = 500)
    private String templateFileUrl;
    private String paperSize;
    private String orientation;
    private BigDecimal paperWidthMm;
    private BigDecimal paperHeightMm;
    private BigDecimal marginTop;
    private BigDecimal marginBottom;
    private BigDecimal marginLeft;
    private BigDecimal marginRight;
    @Size(max = 65536)
    private String variablesDeclare;
    private Integer defaultFlag;
    @Min(0)
    private Integer version;
    private String status;
    @Size(max = 500)
    private String remark;
}
