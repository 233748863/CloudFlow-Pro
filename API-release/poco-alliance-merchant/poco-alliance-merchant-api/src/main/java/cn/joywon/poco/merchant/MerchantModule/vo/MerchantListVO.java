package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "商家列表信息返回数据")
public class MerchantListVO {

    @Schema(description = "商家ID")
    private Long id;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logo图片URL")
    private String logoUrl;

    @Schema(description = "联系人姓名")
    private String contactName;

    @Schema(description = "商家联系电话")
    private String contactPhone;

    @Schema(description = "商家详细地址")
    private String addressDetail;

    @Schema(description = "行业分类名称")
    private String industryName;

    @Schema(description = "商家经营状态: PREPARING-准备中; OPERATING-经营中; SUSPENDED-停业中; TERMINATED-已结业")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "商家是否启用: true-启用; false-禁用")
    private Boolean enable;

    @Schema(description = "商家入驻时间")
    private LocalDateTime createdTime;

}