package com.cloudflow.hr.domain.vo.benefit;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

/**
 * HR 我的福利总览 VO。
 */
@Data
@Schema(name = "HrBenefitMineVO", description = "HR 我的福利总览 VO")
public class HrBenefitMineVO {
    @Schema(description = "在享福利项列表") private List<HrEmployeeBenefitVO> activeBenefits;
    @Schema(description = "积分账户") private HrPointAccountVO pointAccount;
    @Schema(description = "进行中订单") private List<HrMallOrderVO> inFlightOrders;
    @Schema(description = "近期申领") private List<HrBenefitRequestVO> recentRequests;
}
