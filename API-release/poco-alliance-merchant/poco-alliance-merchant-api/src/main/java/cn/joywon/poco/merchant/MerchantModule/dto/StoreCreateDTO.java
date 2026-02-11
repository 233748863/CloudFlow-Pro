package cn.joywon.poco.merchant.MerchantModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "门店创建参数")
public class StoreCreateDTO {

    @Schema(description = "商家ID")
    private String merchantId;

    @NotBlank(message = "门店名称不能为空")
    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "门店简介")
    private String description;

    @Schema(description = "行业ID")
    private String industryId;

    @NotBlank(message = "区域编码不能为空")
    @Schema(description = "区域编码")
    private String regionCode;

    @NotBlank(message = "详细地址不能为空")
    @Pattern(regexp = "^.{1,50}$", message = "详细地址不能超过50字")
    @Schema(description = "详细地址(区-街道-单元)")
    private String addressDetail;

    @NotBlank(message = "门店电话不能为空")
    @Schema(description = "门店电话")
    private String phone;

    @NotBlank(message = "门店logo不能为空")
    @Schema(description = "门店logo")
    private String logoUrl;

    @Schema(description = "门店展示图片")
    private List<String> images;

    @Pattern(regexp = "^([01]\\d|2[0-3]):([0-5]\\d)-([01]\\d|2[0-3]):([0-5]\\d)$", message = "格式必须为 HH:mm-HH:mm")
    @Schema(description = "营业时间, 不填写默认24小时")
    private String businessHours;

    @NotBlank(message = "营业执照不能为空")
    @Schema(description = "营业执照编号")
    private String licenseNo;

    @NotEmpty(message = "门店资质图片URL列表不能为空")
    @Schema(description = "门店资质图片URL列表")
    private List<String> licenseImages;

}