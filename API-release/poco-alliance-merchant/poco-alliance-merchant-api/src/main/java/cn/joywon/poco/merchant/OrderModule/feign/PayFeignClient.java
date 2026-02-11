package cn.joywon.poco.merchant.OrderModule.feign;

import cn.joywon.poco.merchant.OrderModule.dto.PayGoodsOrderDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.cloud.openfeign.SpringQueryMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.merchant.OrderModule.dto.PayRefundDTO;


import java.util.Map;

/**
 * 支付平台Feign客户端
 */
@FeignClient(contextId = "payFeignClient", value = "poco-pay-platform")
public interface PayFeignClient {

    /**
     * 购买商品（根据User-Agent自动选择支付方式）
     *
     * @param goodsOrder 商品订单信息
     * @return 支付参数
     */
    @GetMapping("/goods/buy")
    Map<String, Object> buy(@SpringQueryMap PayGoodsOrderDTO goodsOrder);


    /**
     * 聚合支付购买商品
     *
     * @param goodsOrder 商品订单信息
     * @return 支付参数
     */
    @GetMapping("/goods/merge/buy")
    Map<String, Object> mergeBuy(@SpringQueryMap PayGoodsOrderDTO goodsOrder);

    /**
     * 微信小程序支付
     *
     * @param goodsOrder 商品订单信息
     * @return 支付参数
     */
    @GetMapping("/goods/mini/buy")
    Map<String, Object> miniBuy(@SpringQueryMap PayGoodsOrderDTO goodsOrder);

    /**
     * 微信JSAPI支付（使用WEIXIN_MP渠道配置，公众号/小程序通用）
     *
     * @param goodsOrder 商品订单信息
     * @return 支付参数
     */
    @GetMapping("/goods/wx/jsapi")
    Map<String, Object> wxJsapiPay(@SpringQueryMap PayGoodsOrderDTO goodsOrder);

    /**
     * 订单退款
     *
     * @param refundDTO 退款信息
     * @return 退款结果
     */
    @PostMapping("/refund/order")
    R<Boolean> refundOrder(@RequestBody PayRefundDTO refundDTO);

    /**
     * 请求分账
     * @param params 分账参数
     * @return 结果
     */
    @PostMapping("/profit-sharing/submit")
    R<String> submitProfitSharing(@RequestBody Map<String, String> params);

    /**
     * 添加分账接收方
     * @param params 参数
     * @return 结果
     */
    @PostMapping("/profit-sharing/receiver/add")
    R<String> addReceiver(@RequestBody Map<String, String> params);

    /**
     * 完结分账
     * @param params 参数
     * @return 结果
     */
    @PostMapping("/profit-sharing/finish")
    R<String> finishProfitSharing(@RequestBody Map<String, String> params);

}
