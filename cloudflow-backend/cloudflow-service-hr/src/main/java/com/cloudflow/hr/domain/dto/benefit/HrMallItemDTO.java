package com.cloudflow.hr.domain.dto.benefit;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 积分商城商品创建/修改入参。
 */
@Data
@Schema(name = "HrMallItemDTO", description = "积分商城商品入参")
public class HrMallItemDTO {

    @Schema(description = "商品编号；不传由后端生成")
    @Size(max = 64)
    private String itemNo;

    @Schema(description = "商品名称")
    @NotBlank(message = "商品名称不能为空")
    @Size(max = 128)
    private String itemName;

    @Schema(description = "分类")
    @Size(max = 64)
    private String category;

    @Schema(description = "积分价")
    @NotNull(message = "积分价不能为空")
    @Min(value = 0, message = "积分价不能为负")
    private Integer pointPrice;

    @Schema(description = "库存")
    @Min(value = 0, message = "库存不能为负")
    private Integer stock;

    @Schema(description = "封面图")
    @Size(max = 512)
    private String coverImage;

    @Schema(description = "图集")
    private List<String> images;

    @Schema(description = "详情 HTML")
    private String detailHtml;

    @Schema(description = "状态：DRAFT/ON_SHELF/OFF_SHELF；不传默认 DRAFT")
    @Size(max = 32)
    private String status;

    @Schema(description = "审批阈值（兑换金额超过此积分需要审批）")
    private Integer approvalThreshold;
}
