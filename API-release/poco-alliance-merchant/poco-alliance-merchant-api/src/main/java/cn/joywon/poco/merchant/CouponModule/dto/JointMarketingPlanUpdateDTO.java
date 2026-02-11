package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "更新联合营销计划DTO")
public class JointMarketingPlanUpdateDTO {

    @Schema(description = "计划ID")
    @NotNull(message = "计划ID不能为空")
    private Long id;

    @Schema(description = "计划名称")
    private String name;

    @Schema(description = "计划描述")
    private String description;

    @Schema(description = "开始时间")
    private LocalDateTime startTime;

    @Schema(description = "结束时间")
    private LocalDateTime endTime;
}
