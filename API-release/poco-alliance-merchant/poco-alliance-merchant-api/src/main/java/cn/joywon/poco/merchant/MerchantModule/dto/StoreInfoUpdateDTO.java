package cn.joywon.poco.merchant.MerchantModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "门店信息修改参数")
public class StoreInfoUpdateDTO {

    @NotNull(message = "门店ID不能为空")
    @Schema(description = "门店ID")
    private String storeId;

    @Schema(description = "行业ID")
    private String industryId;

    @Schema(description = "门店名称")
    private String name;

    @Schema(description = "门店简介")
    private String description;

    @Schema(description = "门店电话")
    private String phone;

    @Schema(description = "门店logo")
    private String logoUrl;

    @Schema(description = "门店展示图片")
    private List<String> images;

    @Schema(description = "地区编码")
    private String regionCode;

    @Pattern(regexp = "^.{1,50}$", message = "详细地址不能超过50字")
    @Schema(description = "详细地址(区-街道-单元)")
    private String addressDetail;

    @NotBlank(message = "修改原因不能为空")
    @Schema(description = "提交修改原因")
    private String modifyReason;

}