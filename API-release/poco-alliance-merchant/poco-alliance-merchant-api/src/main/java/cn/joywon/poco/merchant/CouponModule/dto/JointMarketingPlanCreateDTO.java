package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "创建联合营销计划DTO")
public class JointMarketingPlanCreateDTO {

    @Schema(description = "计划名称")
    @NotBlank(message = "计划名称不能为空")
    private String name;

    @Schema(description = "计划描述")
    private String description;

    @Schema(description = "开始时间")
    @NotNull(message = "开始时间不能为空")
    private LocalDateTime startTime;

    @Schema(description = "结束时间")
    @NotNull(message = "结束时间不能为空")
    private LocalDateTime endTime;
}
