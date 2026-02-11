package cn.joywon.poco.merchant.MerchantModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.util.List;


@Data
@Schema(description = "商家信息修改参数")
public class MerchantUpdateDTO {

    @Schema(description = "商家名称")
    private String name;

    @Schema(description = "商家logo")
    private String logoUrl;

    @Schema(description = "商家图片列表")
    private List<String> images;

    @Schema(description = "商家简介")
    private String description;

    @Schema(description = "商家联系人")
    private String contactName;

    @Schema(description = "商家联系电话")
    private String contactPhone;

    @Schema(description = "行业分类ID")
    private Long industryId;

    @Schema(description = "区域编码")
    private String regionCode;

    @Pattern(regexp = "^.{1,50}$", message = "详细地址不能超过50字")
    @Schema(description = "详细地址(区-街道-单元)")
    private String addressDetail;

    @NotBlank(message = "提交修改原因不能为空")
    @Schema(description = "提交修改原因")
    private String modifyReason;

}