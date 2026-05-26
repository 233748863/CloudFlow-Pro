package com.cloudflow.hr.domain.vo.ess;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 合同签署 VO（剔除 deleted/tenantId/ipAddress 等内部字段）。
 */
@Data
@Schema(name = "HrContractSignatureVO", description = "HR 合同签署 VO")
public class HrContractSignatureVO {
    @Schema(description = "签署记录 ID") private Long id;
    @Schema(description = "合同 ID") private Long contractId;
    @Schema(description = "签署方类型") private String signerType;
    @Schema(description = "签署方 ID") private Long signerId;
    @Schema(description = "签署方式") private String signMethod;
    @Schema(description = "签署状态") private String signStatus;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime signTime;
    @Schema(description = "签名图片附件 ID") private Long signatureFileId;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime expireTime;
    @Schema(description = "备注") private String remark;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
