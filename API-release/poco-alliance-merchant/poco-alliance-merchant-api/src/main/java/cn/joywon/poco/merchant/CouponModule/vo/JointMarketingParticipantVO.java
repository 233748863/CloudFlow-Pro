package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Schema(description = "联合营销参与者VO")
public class JointMarketingParticipantVO {

    @Schema(description = "ID")
    private Long id;

    @Schema(description = "计划ID")
    private Long planId;

    @Schema(description = "商家ID")
    private Long merchantId;
    
    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "角色")
    private String role;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "加入时间")
    private LocalDateTime joinTime;
    
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;
}
