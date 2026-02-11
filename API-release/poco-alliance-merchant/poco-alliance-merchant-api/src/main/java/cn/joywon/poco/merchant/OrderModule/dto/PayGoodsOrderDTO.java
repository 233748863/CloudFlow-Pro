package cn.joywon.poco.merchant.OrderModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;

/**
 * 支付商品订单DTO
 * 用于对接支付平台
 */
@Data
@Schema(description = "支付商品订单DTO")
public class PayGoodsOrderDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 商品ID
     */
    @Schema(description = "商品ID")
    private String goodsId;

    /**
     * 商品名称
     */
    @Schema(description = "商品名称")
    private String goodsName;

    /**
     * 金额,单位分
     */
    @Schema(description = "金额,单位分")
    private String amount;

    /**
     * 用户ID (微信OpenID等)
     */
    @Schema(description = "用户ID")
    private String userId;

    /**
     * 支付订单号
     */
    @Schema(description = "支付订单号")
    private Long payOrderId;

    /**
     * 用户在服务商下的OpenId (直连模式必填)
     */
    @Schema(description = "服务商OpenId")
    private String openId;

    /**
     * 是否分账 (Y-是 N-否)
     */
    @Schema(description = "是否分账")
    private String isProfitSharing;

    /**
     * 商户订单号（微信支付的 out_trade_no）
     * 用于支付平台识别订单，支持单订单支付和批次合并支付
     */
    @Schema(description = "商户订单号")
    private String outTradeNo;
}
