package cn.joywon.poco.merchant.ReportModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.io.Serializable;
import java.time.LocalDate;

/**
 * 报表查询通用参数
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@Schema(description = "报表查询通用参数")
public class ReportQueryDTO implements Serializable {

    @Schema(description = "开始日期 (yyyy-MM-dd)")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;

    @Schema(description = "结束日期 (yyyy-MM-dd)")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "统计月份 (yyyy-MM)")
    private String statMonth;

    @Schema(description = "支付渠道: WECHAT_MINI-微信小程序; WECHAT_MP-微信公众号; BALANCE-余额支付")
    private String payChannel;

    @Schema(description = "商品分类ID")
    private Long categoryId;

    @Schema(description = "分页页码")
    private Integer pageNo = 1;

    @Schema(description = "分页大小")
    private Integer pageSize = 10;
}
