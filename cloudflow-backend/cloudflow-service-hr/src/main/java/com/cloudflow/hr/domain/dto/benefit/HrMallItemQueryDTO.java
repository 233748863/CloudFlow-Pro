package com.cloudflow.hr.domain.dto.benefit;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 积分商城商品分页查询入参。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrMallItemQueryDTO", description = "积分商城商品分页查询入参")
public class HrMallItemQueryDTO extends PageQuery {

    @Schema(description = "商品名称 模糊匹配")
    private String itemName;

    @Schema(description = "分类")
    private String category;

    @Schema(description = "状态：DRAFT/ON_SHELF/OFF_SHELF")
    private String status;
}
