package cn.joywon.poco.merchant.MerchantModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "门店资质信息返回数据")
public class StoreQualificationVO {

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店营业执照编号")
    private String licenseNo;

    @Schema(description = "门店资质图片列表")
    private List<String> licenseImages;

    @Schema(description = "门店是否正在被审核")
    private Boolean auditing;

}