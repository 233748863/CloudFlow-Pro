package cn.joywon.poco.merchant.MerchantModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "商家入驻申请参数")
public class MerchantCreateDTO {

    @NotBlank(message = "商家名称不能为空")
    @Schema(description = "商家名称")
    private String merchantName;

    @NotBlank(message = "商家logo不能为空")
    @Schema(description = "商家logo")
    private String logoUrl;

    @Schema(description = "商家图片列表")
    private List<String> images;

    @Schema(description = "商家简介")
    private String description;

    @NotBlank(message = "商家联系人不能为空")
    @Schema(description = "商家联系人")
    private String contactName;

    @NotBlank(message = "商家联系电话不能为空")
    @Schema(description = "商家联系电话")
    private String contactPhone;

    @Schema(description = "行业分类ID")
    private Long industryId;

    @Schema(description = "区域代理商ID")
    private Long agentId;

    @NotBlank(message = "法人姓名不能为空")
    @Schema(description = "法人姓名")
    private String legalPerson;

    @NotBlank(message = "子商户号不能为空")
    @Schema(description = "子商户号(微信支付服务商模式)")
    private String subMchId;

    @NotBlank(message = "营业执照编号不能为空")
    @Schema(description = "营业执照编号")
    private String licenseNo;

    @NotEmpty(message = "商家资质图片列表不能为空")
    @Schema(description = "商家资质图片列表")
    private List<String> licenseImages;

    @Schema(description = "商家所在地区编码")
    private String regionCode;

    @NotBlank(message = "详细地址不能为空")
    @Pattern(regexp = "^.{1,50}$", message = "详细地址不能超过50字")
    @Schema(description = "详细地址(区-街道-单元)")
    private String addressDetail;

    @Schema(hidden = true)
    private Long merchantId;

}