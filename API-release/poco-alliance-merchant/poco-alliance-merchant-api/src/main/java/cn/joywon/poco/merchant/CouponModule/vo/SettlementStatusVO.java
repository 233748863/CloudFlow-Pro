package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Schema(description = "结算状态VO")
public class SettlementStatusVO {

    @Schema(description = "批次ID")
    private String batchId;

    @Schema(description = "结算状态: PROCESSING-处理中, COMPLETED-已完成, FAILED-失败")
    private String status;

    @Schema(description = "总记录数")
    private Integer totalRecords;

    @Schema(description = "成功记录数")
    private Integer successRecords;

    @Schema(description = "失败记录数")
    private Integer failureRecords;

    @Schema(description = "总金额")
    private BigDecimal totalAmount;

    @Schema(description = "成功金额")
    private BigDecimal successAmount;

    @Schema(description = "开始时间")
    private LocalDateTime startTime;

    @Schema(description = "结束时间")
    private LocalDateTime endTime;

    @Schema(description = "进度百分比")
    private Integer progress;

    @Schema(description = "错误信息")
    private String errorMessage;
}