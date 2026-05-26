package com.cloudflow.hr.domain.vo.benefit;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 积分商城订单 VO（剔除 deleted/tenantId/version；receiverPhone/receiverAddress 由 maskRow 按权限脱敏）。
 */
@Data
@Schema(name = "HrMallOrderVO", description = "HR 积分商城订单 VO")
public class HrMallOrderVO {
    @Schema(description = "订单 ID") private Long id;
    @Schema(description = "订单号") private String orderNo;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "总积分") private Integer totalPoints;
    @Schema(description = "收货人姓名") private String receiverName;
    @Schema(description = "收货人电话（掩码由权限决定）") private Object receiverPhone;
    @Schema(description = "收货地址（掩码由权限决定）") private Object receiverAddress;
    @Schema(description = "快递单号") private String expressNo;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批流程实例 ID") private String processInstanceId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime shippedAt;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime completedAt;
    @Schema(description = "备注") private String remark;
    @Schema(description = "订单明细（仅详情返回）") private List<HrMallOrderItemVO> items;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
