package cn.joywon.poco.merchant.CouponModule.dto;

import cn.joywon.poco.merchant.Common.page.PageQueryDTO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "联合营销计划分页查询DTO")
public class JointMarketingPlanPageDTO extends PageQueryDTO {

    @Schema(description = "计划名称(模糊查询)")
    private String name;

    @Schema(description = "计划状态")
    private String status;

    @Schema(description = "计划邀请状态")
    private String acceptStatus;

    @Schema(description = "是否只显示当前商户创建的计划")
    private Boolean onlyOwnerPublish;

    @Schema(description = "是否只显示当前商户参与的计划")
    private Boolean onlyOwnerAccept;

    @Schema(description = "计划开始时间")
    private LocalDate startDate;

    @Schema(description = "计划结束时间")
    private LocalDate endDate;

    @Schema(description = "邀请开始时间")
    private LocalDate acceptStartDate;

    @Schema(description = "邀请结束时间")
    private LocalDate acceptEndDate;

    @Schema(description = "发布计划商家ID列表")
    private List<String> publishMerchantIds;

    @Schema(hidden = true)
    private LocalDateTime startTime;

    @Schema(hidden = true)
    private LocalDateTime endTime;

    @Schema(hidden = true)
    private LocalDateTime acceptStartTime;

    @Schema(hidden = true)
    private LocalDateTime acceptEndTime;

}