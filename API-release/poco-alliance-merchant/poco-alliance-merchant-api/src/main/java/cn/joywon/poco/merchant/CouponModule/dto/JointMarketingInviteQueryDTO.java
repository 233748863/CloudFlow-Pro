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
public class JointMarketingInviteQueryDTO extends PageQueryDTO {

    @Schema(description = "邀请状态")
    private String status;

    @Schema(description = "发起邀请的商家ID列表")
    private List<String> invitationMerchantIds;

    @Schema(description = "邀请开始时间")
    private LocalDate inviteStartDate;

    @Schema(description = "邀请结束时间")
    private LocalDate inviteEndDate;

    @Schema(description = "接受邀请开始时间")
    private LocalDate acceptStartDate;

    @Schema(description = "接受邀请结束时间")
    private LocalDate acceptEndDate;

    @Schema(description = "是否按收到邀请时间升序排序")
    private Boolean orderByAsc;

    @Schema(hidden = true)
    private LocalDateTime inviteStartTime;

    @Schema(hidden = true)
    private LocalDateTime inviteEndTime;

    @Schema(hidden = true)
    private LocalDateTime acceptStartTime;

    @Schema(hidden = true)
    private LocalDateTime acceptEndTime;

    @Schema(hidden = true)
    private Long merchantId;

}