package com.cloudflow.hr.domain.vo.benefit;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * HR 积分账户 VO（剔除 deleted/tenantId/version）。
 */
@Data
@Schema(name = "HrPointAccountVO", description = "HR 积分账户 VO")
public class HrPointAccountVO {
    @Schema(description = "账户 ID") private Long id;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "可用积分") private Integer availablePoints;
    @Schema(description = "累计获取积分") private Integer totalEarned;
    @Schema(description = "累计消费积分") private Integer totalSpent;
    @Schema(description = "冻结积分") private Integer frozenPoints;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime lastActiveAt;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
