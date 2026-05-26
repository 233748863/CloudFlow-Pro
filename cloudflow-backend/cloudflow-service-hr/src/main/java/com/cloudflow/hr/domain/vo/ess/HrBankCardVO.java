package com.cloudflow.hr.domain.vo.ess;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 员工银行卡 VO（accountNo 按权限掩码，剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrBankCardVO", description = "HR 员工银行卡 VO")
public class HrBankCardVO {
    @Schema(description = "银行卡 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "银行名称") private String bankName;
    @Schema(description = "支行") private String bankBranch;
    @Schema(description = "账号（按权限掩码）") private String accountNo;
    @Schema(description = "户名") private String accountHolder;
    @Schema(description = "是否主账户") private Boolean isPrimary;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
}
