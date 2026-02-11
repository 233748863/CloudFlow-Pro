package cn.joywon.poco.merchant.MerchantModule.vo;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "门店信息返回数据")
public class StoreInfoVO {

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "门店区域编码")
    private String regionCode;

    @Schema(description = "门店所在区域")
    private String location;

    @Schema(description = "门店地址")
    private String addressDetail;

    @Schema(description = "门店电话")
    private String phone;

    @Schema(description = "门店logoURL")
    private String logoUrl;

    @Schema(description = "门店图片URL列表")
    private List<String> images;

    @Schema(description = "行业分类ID")
    private Long industryId;

    @Schema(description = "营业时间")
    private String businessHours;

    @Schema(description = "营业状态")
    private BusinessStatusEnum businessStatus;

    @Schema(description = "是否正在审核中")
    private Boolean auditing;

    @Schema(description = "是否被平台启用: true-启用; false-禁用")
    private Boolean enable;

}