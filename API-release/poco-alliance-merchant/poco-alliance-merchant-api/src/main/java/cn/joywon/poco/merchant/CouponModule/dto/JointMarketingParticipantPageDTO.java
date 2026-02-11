package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "联合营销参与者分页查询DTO")
public class JointMarketingParticipantPageDTO extends PageQueryDTO {

    @Schema(description = "计划ID")
    private Long planId;

    @Schema(description = "商家ID")
    private Long merchantId;
    
    @Schema(description = "状态")
    private String status;
}
