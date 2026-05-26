package com.cloudflow.hr.domain.vo.recruitment;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 简历解析字段 VO（剔除 deleted/tenantId/rawText 原文与 parseError 内部诊断字段）。
 *
 * <p>parsedPhone / parsedEmail 因 maskRow 仅作用于 crudService 出口，
 * 此 VO 走 listParsed 走 Service 直转 List<Map>，不经过 maskRow，
 * 由 hr:recruitment:view 权限位由 HR 管理员视角访问，不再二次脱敏。
 */
@Data
@Schema(name = "HrResumeParsedFieldVO", description = "HR 简历解析字段 VO")
public class HrResumeParsedFieldVO {
    @Schema(description = "解析记录 ID") private Long id;
    @Schema(description = "候选人 ID") private Long candidateId;
    @Schema(description = "简历附件 URL") private String resumeUrl;
    @Schema(description = "解析姓名") private String parsedName;
    @Schema(description = "解析手机号") private String parsedPhone;
    @Schema(description = "解析邮箱") private String parsedEmail;
    @Schema(description = "解析学历") private String parsedEducation;
    @Schema(description = "解析毕业院校") private String parsedSchool;
    @Schema(description = "解析技能数组") private JsonNode parsedSkills;
    @Schema(description = "解析工作经历数组") private JsonNode parsedExperiences;
    @Schema(description = "解析置信度（0-1）") private BigDecimal confidence;
    @Schema(description = "复核状态 PENDING/CONFIRMED/REJECTED") private String reviewStatus;
    @Schema(description = "复核人 ID") private Long reviewerId;
    @Schema(description = "复核人姓名") private String reviewerName;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime reviewTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
