package cn.joywon.poco.merchant.Common.page;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class CursorQueryDTO {

    @DecimalMin(value = "-180.0", message = "用户地理经度必须在[-180.0, 180.0]之间")
    @DecimalMax(value = "180.0", message = "用户地理经度必须在[-180.0, 180.0]之间")
    @NotNull(message = "用户地理经度不能为空")
    @Schema(description = "用户地理经度")
    private Double longitude;

    @DecimalMin(value = "-90.0", message = "用户地理纬度必须在[-90.0, 90.0]之间")
    @DecimalMax(value = "90.0", message = "用户地理纬度必须在[-90.0, 90.0]之间")
    @NotNull(message = "用户地理纬度不能为空")
    @Schema(description = "用户地理纬度")
    private Double latitude;

    @DecimalMin(value = "0.05", message = "查询半径不能小于50米")
    @Schema(description = "查询半径(千米)", defaultValue = "5.0")
    private Double radius = 1000.0;

    @Min(value = 0, message = "游标必须大于等于0")
    @Schema(description = "游标", defaultValue = "0")
    private Integer cursor = 0;

    @Min(value = 0, message = "页码必须大于等于0")
    @Schema(description = "页码", defaultValue = "1")
    private Integer pageNum = 1;

    @Max(value = 500, message = "每页大小不能大于500")
    @Min(value = 1, message = "每页大小必须大于等于1")
    @Schema(description = "每页大小", defaultValue = "100")
    private Integer pageSize = 100;

}