package com.cloudflow.hr.domain.vo.benefit;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 积分商城商品 VO（剔除 deleted/tenantId/version）。
 */
@Data
@Schema(name = "HrMallItemVO", description = "HR 积分商城商品 VO")
public class HrMallItemVO {
    @Schema(description = "商品 ID") private Long id;
    @Schema(description = "商品编号") private String itemNo;
    @Schema(description = "商品名称") private String itemName;
    @Schema(description = "类别") private String category;
    @Schema(description = "积分售价") private Integer pointPrice;
    @Schema(description = "库存") private Integer stock;
    @Schema(description = "累计销量") private Integer salesCount;
    @Schema(description = "封面图 URL") private String coverImage;
    @Schema(description = "图片集") private List<String> images;
    @Schema(description = "商品详情 HTML") private String detailHtml;
    @Schema(description = "状态") private String status;
    @Schema(description = "审批阈值（超过则进审批）") private Integer approvalThreshold;
    @Schema(description = "创建人") private String createBy;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}
