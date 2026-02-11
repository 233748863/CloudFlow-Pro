package cn.joywon.poco.pay.controller;

import cn.hutool.core.util.NumberUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.ijpay.core.kit.WxPayKit;
import com.ijpay.wxpay.WxPayApi;
import com.ijpay.wxpay.WxPayApiConfig;
import com.ijpay.wxpay.WxPayApiConfigKit;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.pay.entity.PayChannel;
import cn.joywon.poco.pay.mapper.PayChannelMapper;
import cn.joywon.poco.pay.utils.PayChannelNameEnum;
import com.ijpay.core.enums.SignType;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 微信支付分账控制器
 * 独立于原有支付流程，专门处理分账相关请求
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/profit-sharing")
@Tag(name = "分账管理")
public class PayProfitSharingController {

    private final PayChannelMapper channelMapper;
    private final cn.joywon.poco.pay.mapper.PayTradeOrderMapper payTradeOrderMapper;

    /**
     * 添加分账接收方
     * @param params 包含 receiver 信息
     * @return 结果
     */
    @PostMapping("/receiver/add")
    @Operation(summary = "添加分账接收方")
    public R<String> addReceiver(@RequestBody Map<String, String> params) {
        try {
            WxPayApiConfig wxPayApiConfig = getWxPayApiConfig();
            
            Map<String, String> map = new HashMap<>();
            map.put("mch_id", wxPayApiConfig.getMchId());
            map.put("appid", wxPayApiConfig.getAppId());
            map.put("nonce_str", WxPayKit.generateStr());
            map.put("receiver", params.get("receiver")); // JSON string {"type":..., "account":...}
            map.put("sign_type", "HMAC-SHA256");

            // 签名
            String sign = WxPayKit.createSign(map, wxPayApiConfig.getPartnerKey(), SignType.HMACSHA256);
            map.put("sign", sign);

            String result = WxPayApi.profitSharingAddReceiver(map);
            log.info("添加分账接收方结果: {}", result);
            
            JSONObject jsonResult = JSONUtil.parseObj(result);
            if ("SUCCESS".equals(jsonResult.getStr("return_code")) && "SUCCESS".equals(jsonResult.getStr("result_code"))) {
                return R.ok(result);
            } else {
                return R.failed(jsonResult.getStr("return_msg", "添加接收方失败"));
            }
        } catch (Exception e) {
            log.error("添加分账接收方异常", e);
            return R.failed("系统异常: " + e.getMessage());
        }
    }

    /**
     * 请求单次分账
     * @param params 分账参数
     * @return 结果
     */
    @PostMapping("/submit")
    @Operation(summary = "请求单次分账")
    public R<String> submitProfitSharing(@RequestBody Map<String, String> params) {
        try {
            WxPayApiConfig wxPayApiConfig = getWxPayApiConfig();

            String transactionId = params.get("transactionId");
            String outTradeNo = params.get("outOrderNo"); // 这里前端/调用方传过来的可能是 payBatchNo

            // 如果没有 transactionId，尝试通过 outOrderNo (payBatchNo) 查找
            if (StrUtil.isBlank(transactionId) && StrUtil.isNotBlank(outTradeNo)) {
                // 注意：这里的 outOrderNo 对应 PayTradeOrder 中的 orderId (Long)
                // 需要处理 BATCH_ 前缀
                String orderIdStr = outTradeNo.replace("BATCH_", "");
                if (NumberUtil.isNumber(orderIdStr)) {
                    Long payOrderId = Long.parseLong(orderIdStr);
                    cn.joywon.poco.pay.entity.PayTradeOrder tradeOrder = payTradeOrderMapper.selectOne(
                            Wrappers.<cn.joywon.poco.pay.entity.PayTradeOrder>lambdaQuery()
                                    .eq(cn.joywon.poco.pay.entity.PayTradeOrder::getOrderId, payOrderId)
                                    .last("LIMIT 1")
                    );
                    if (tradeOrder != null) {
                        transactionId = tradeOrder.getChannelOrderNo();
                    }
                }
            }

            if (StrUtil.isBlank(transactionId)) {
                return R.failed("无法获取微信支付订单号(transaction_id)");
            }

            Map<String, String> map = new HashMap<>();
            map.put("mch_id", wxPayApiConfig.getMchId());
            map.put("appid", wxPayApiConfig.getAppId());
            map.put("nonce_str", WxPayKit.generateStr());
            map.put("transaction_id", transactionId); // 微信支付订单号
            map.put("out_order_no", outTradeNo + "_PS_" + System.currentTimeMillis()); // 商户分账单号，需唯一，建议拼接时间戳
            map.put("receivers", params.get("receivers")); // 分账接收方列表 JSON
            map.put("sign_type", "HMAC-SHA256");
            
            // 签名
            String sign = WxPayKit.createSign(map, wxPayApiConfig.getPartnerKey(), SignType.HMACSHA256);
            map.put("sign", sign);

            // 需要证书
            String result = WxPayApi.profitSharing(map, wxPayApiConfig.getCertPath(), wxPayApiConfig.getMchId());
            log.info("请求分账结果: {}", result);

            JSONObject jsonResult = JSONUtil.parseObj(result);
            if ("SUCCESS".equals(jsonResult.getStr("return_code")) && "SUCCESS".equals(jsonResult.getStr("result_code"))) {
                return R.ok(result);
            } else {
                return R.failed(jsonResult.getStr("err_code_des", jsonResult.getStr("return_msg")));
            }
        } catch (Exception e) {
            log.error("请求分账异常", e);
            return R.failed("系统异常: " + e.getMessage());
        }
    }
    
    /**
     * 完结分账
     * @param params 参数
     * @return 结果
     */
    @PostMapping("/finish")
    @Operation(summary = "完结分账")
    public R<String> finishProfitSharing(@RequestBody Map<String, String> params) {
        try {
            WxPayApiConfig wxPayApiConfig = getWxPayApiConfig();

            Map<String, String> map = new HashMap<>();
            map.put("mch_id", wxPayApiConfig.getMchId());
            map.put("appid", wxPayApiConfig.getAppId());
            map.put("nonce_str", WxPayKit.generateStr());
            map.put("transaction_id", params.get("transactionId"));
            map.put("out_order_no", params.get("outOrderNo"));
            map.put("description", "分账完结");
            map.put("sign_type", "HMAC-SHA256");

            String sign = WxPayKit.createSign(map, wxPayApiConfig.getPartnerKey(), SignType.HMACSHA256);
            map.put("sign", sign);

            String result = WxPayApi.profitSharingFinish(map, wxPayApiConfig.getCertPath(), wxPayApiConfig.getMchId());
            log.info("完结分账结果: {}", result);

            JSONObject jsonResult = JSONUtil.parseObj(result);
            if ("SUCCESS".equals(jsonResult.getStr("return_code")) && "SUCCESS".equals(jsonResult.getStr("result_code"))) {
                return R.ok(result);
            } else {
                return R.failed(jsonResult.getStr("err_code_des", jsonResult.getStr("return_msg")));
            }
        } catch (Exception e) {
            log.error("完结分账异常", e);
            return R.failed("系统异常: " + e.getMessage());
        }
    }

    private WxPayApiConfig getWxPayApiConfig() {
        PayChannel channel = channelMapper.selectOne(
                Wrappers.<PayChannel>lambdaQuery()
                        .eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName())
                        .last("LIMIT 1"));

        if (channel == null) {
            throw new IllegalArgumentException("微信公众号支付渠道配置为空");
        }

        JSONObject params = JSONUtil.parseObj(channel.getParam());
        
        // 构建配置，注意分账需要证书
        WxPayApiConfig wx = WxPayApiConfig.builder()
                .appId(channel.getAppId())
                .mchId(channel.getChannelMchId())
                .partnerKey(params.getStr("partnerKey"))
                .certPath(params.getStr("certPath")) // 假设配置中有 certPath
                .domain(params.getStr("domain")) // 假设配置中有 domain
                .build();

        WxPayApiConfigKit.setThreadLocalWxPayApiConfig(wx);
        return wx;
    }
}
