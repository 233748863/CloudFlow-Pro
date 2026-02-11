package cn.joywon.poco.merchant.OrderModule.dto;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 退款申请分页查询DTO
 *
 * @author poco
 * @date 2025-12-30
 */
@Data
@Schema(description = "退款申请分页查询DTO")
public class RefundApplyPageQueryDTO {

    @Schema(description = "当前页码", example = "1")
    private Integer current = 1;

    @Schema(description = "每页条数", example = "10")
    private Integer size = 10;

    @Schema(description = "订单ID")
    private Long orderId;

    @Schema(description = "订单号")
    private String orderNo;

    @Schema(description = "退款单号")
    private String refundNo;

    @Schema(description = "退款状态: PENDING-待审核, APPROVED-已通过, REJECTED-已拒绝, REFUNDED-已退款")
    private String status;

    @Schema(description = "退款类型: FULL-全额退款, PARTIAL-部分退款")
    private String refundType;

    @Schema(description = "申请开始时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime;

    @Schema(description = "申请结束时间")
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime;

    /**
     * 构建分页对象
     */
    public <T> Page<T> page() {
        return new Page<>(current, size);
    }
}
