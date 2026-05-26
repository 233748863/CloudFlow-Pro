package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 培训证书模板 VO（剔除 deleted/tenantId；保留 fields JSON 配置）。
 */
@Data
@Schema(name = "HrTrainingCertificateTemplateVO", description = "HR 培训证书模板 VO")
public class HrTrainingCertificateTemplateVO {
    @Schema(description = "模板 ID") private Long id;
    @Schema(description = "模板编码") private String templateCode;
    @Schema(description = "模板名称") private String templateName;
    @Schema(description = "背景图片 URL") private String backgroundUrl;
    @Schema(description = "渲染字段配置（label/key/x/y/font/size 等）") private List<Map<String, Object>> fields;
    @Schema(description = "状态") private String status;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
