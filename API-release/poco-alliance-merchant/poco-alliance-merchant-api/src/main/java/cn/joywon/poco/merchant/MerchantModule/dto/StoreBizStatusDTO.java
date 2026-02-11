package cn.joywon.poco.merchant.MerchantModule.dto;

import cn.joywon.poco.merchant.MerchantModule.definition.BusinessStatusEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
@Schema(description = "门店营业状态更新参数")
public class StoreBizStatusDTO {

    @NotNull(message = "门店ID不能为空")
    @Schema(description = "门店ID")
    private String storeId;

    @Pattern(regexp = BusinessStatusEnum.STORE_BIZ_STATUS_REGEX_PATTERN, message = "无效的营业状态")
    @Schema(description = "营业状态: OPEN(营业中), CLOSED(已关店), RESTING(休息中)")
    private String businessStatus;

    @Pattern(regexp = "^([01]\\d|2[0-3]):([0-5]\\d)-([01]\\d|2[0-3]):([0-5]\\d)$", message = "格式必须为 HH:mm-HH:mm")
    @Schema(description = "营业时间")
    private String businessHours;

    @NotBlank(message = "修改原因不能为空")
    @Schema(description = "提交修改原因")
    private String modifyReason;

}