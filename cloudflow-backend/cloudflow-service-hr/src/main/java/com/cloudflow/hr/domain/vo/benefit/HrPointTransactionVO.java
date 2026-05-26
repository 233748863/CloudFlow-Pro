package com.cloudflow.hr.domain.vo.benefit;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 积分交易流水 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrPointTransactionVO", description = "HR 积分交易流水 VO")
public class HrPointTransactionVO {
    @Schema(description = "流水 ID") private Long id;
    @Schema(description = "账户 ID") private Long accountId;
    @Schema(description = "流水编号") private String txnNo;
    @Schema(description = "方向 IN/OUT") private String direction;
    @Schema(description = "来源类型") private String sourceType;
    @Schema(description = "来源 ID") private Long sourceId;
    @Schema(description = "积分数") private Integer points;
    @Schema(description = "变动后余额") private Integer balanceAfter;
    @Schema(description = "生效日期") private LocalDate effectiveDate;
    @Schema(description = "过期日期") private LocalDate expireDate;
    @Schema(description = "备注") private String remark;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
