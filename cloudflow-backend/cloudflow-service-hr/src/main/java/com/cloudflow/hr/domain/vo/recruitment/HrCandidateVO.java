package com.cloudflow.hr.domain.vo.recruitment;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 候选人 VO（剔除 deleted/tenantId，phone/email 由 maskRow 自动脱敏）。
 */
@Data
@Schema(name = "HrCandidateVO", description = "HR 候选人 VO")
public class HrCandidateVO {
    @Schema(description = "候选人 ID") private Long id;
    @Schema(description = "候选人编号") private String candidateNo;
    @Schema(description = "招聘需求 ID") private Long requisitionId;
    @Schema(description = "姓名") private String name;
    @Schema(description = "性别") private String gender;
    @Schema(description = "手机号（按 hr:comp:view 权限脱敏）") private Object phone;
    @Schema(description = "邮箱（按 hr:comp:view 权限脱敏）") private Object email;
    @Schema(description = "来源") private String source;
    @Schema(description = "渠道 ID") private Long channelId;
    @Schema(description = "状态") private String status;
    @Schema(description = "拒绝原因") private String rejectReason;
    @Schema(description = "简历附件") private List<String> resumeAttachmentUrls;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
