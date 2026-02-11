package cn.joywon.poco.pay.handler.impl;

import cn.hutool.core.util.StrUtil;
import cn.hutool.extra.servlet.JakartaServletUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.merchant.OrderModule.feign.OrderFeignClient;
import cn.joywon.poco.pay.entity.PayChannel;
import cn.joywon.poco.pay.entity.PayRefundOrder;
import cn.joywon.poco.pay.entity.PayTradeOrder;
import cn.joywon.poco.pay.handler.PayOrderRefundHandler;
import cn.joywon.poco.pay.mapper.PayChannelMapper;
import cn.joywon.poco.pay.mapper.PayRefundOrderMapper;
import cn.joywon.poco.pay.mapper.PayTradeOrderMapper;
import cn.joywon.poco.pay.utils.OrderStatusEnum;
import cn.joywon.poco.pay.utils.PayChannelNameEnum;
import cn.joywon.poco.pay.utils.TradeStatusEnum;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.ijpay.core.enums.SignType;
import com.ijpay.core.kit.WxPayKit;
import com.ijpay.wxpay.WxPayApi;
import com.ijpay.wxpay.WxPayApiConfig;
import com.ijpay.wxpay.WxPayApiConfigKit;
import com.ijpay.wxpay.model.RefundModel;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 微信退款处理
 *
 * @author poco
 * @date 2025-11-27
 */
@Slf4j
@Service("WEIXIN_REFUND")
@RequiredArgsConstructor
public class WeChatPayOrderRefundHandler implements PayOrderRefundHandler {

    private final PayRefundOrderMapper refundOrderMapper;
    private final PayChannelMapper channelMapper;
    private final PayTradeOrderMapper tradeOrderMapper;
    private final HttpServletRequest request;
    private final StringRedisTemplate stringRedisTemplate;
    private final OrderFeignClient orderFeignClient;

    @Override
    public PayChannel preparePayParams() {
        // 跳过租户过滤，支付渠道配置是平台级别的
        TenantContextHolder.setTenantSkip();
        try {
            PayChannel channel = channelMapper.selectOne(
                    Wrappers.<PayChannel>lambdaQuery()
                            .eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName())
                            .last("LIMIT 1"));

            if (channel == null) {
                throw new IllegalArgumentException("微信支付渠道配置为空");
            }

            return preparePayParamsWithChannel(channel);
        } finally {
            TenantContextHolder.clear();
        }
    }

    /**
     * 根据渠道商户ID准备支付参数
     * @param channelMchId 渠道商户ID
     * @return PayChannel
     */
    public PayChannel preparePayParams(String channelMchId) {
        // 跳过租户过滤，支付渠道配置是平台级别的
        TenantContextHolder.setTenantSkip();
        try {
            PayChannel channel = channelMapper.selectOne(
                    Wrappers.<PayChannel>lambdaQuery()
                            .eq(PayChannel::getChannelMchId, channelMchId)
                            .eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName()));

            if (channel == null) {
                // 降级：尝试只按 channelId 查询
                log.warn("未找到渠道商户号 {} 对应的微信支付配置，尝试降级查询", channelMchId);
                channel = channelMapper.selectOne(
                        Wrappers.<PayChannel>lambdaQuery()
                                .eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName())
                                .last("LIMIT 1"));
            }

            if (channel == null) {
                throw new IllegalArgumentException("微信支付渠道配置为空，渠道商户号: " + channelMchId);
            }

            return preparePayParamsWithChannel(channel);
        } finally {
            TenantContextHolder.clear();
        }
    }

    private PayChannel preparePayParamsWithChannel(PayChannel channel) {
        JSONObject params = JSONUtil.parseObj(channel.getParam());
        WxPayApiConfig wxPayApiConfig = WxPayApiConfig.builder()
                .appId(channel.getAppId())
                .mchId(channel.getChannelMchId())
                .partnerKey(params.getStr("partnerKey"))
                .certPath(params.getStr("certPath"))
                .domain(params.getStr("domain"))
                .build();
        WxPayApiConfigKit.setThreadLocalWxPayApiConfig(wxPayApiConfig);
        return channel;
    }

    @Override
    public PayRefundOrder createPayRefundOrder(PayRefundOrder refundOrder, PayTradeOrder tradeOrder) {
        refundOrder.setPayOrderId(tradeOrder.getOrderId());
        refundOrder.setChannelOrderNo(tradeOrder.getChannelOrderNo());
        refundOrder.setChannelId(PayChannelNameEnum.WEIXIN_MP.getName());
        refundOrder.setChannelMchId(WxPayApiConfigKit.getWxPayApiConfig().getMchId());
        refundOrder.setClientIp(JakartaServletUtil.getClientIP(request));
        refundOrder.setPayAmount(tradeOrder.getAmount());
        
        // 从渠道配置中获取子商户信息（服务商模式）
        try {
            TenantContextHolder.setTenantSkip();
            PayChannel channel = channelMapper.selectOne(
                    Wrappers.<PayChannel>lambdaQuery()
                            .eq(PayChannel::getChannelMchId, tradeOrder.getChannelMchId())
                            .eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName()));
            
            if (channel != null && StrUtil.isNotBlank(channel.getParam())) {
                JSONObject channelParams = JSONUtil.parseObj(channel.getParam());
                String subMchId = channelParams.getStr("subMchId");
                String subAppId = channelParams.getStr("subAppId");
                
                if (StrUtil.isNotBlank(subMchId)) {
                    refundOrder.setSubMchId(subMchId);
                    log.info("设置退款订单子商户号: {}", subMchId);
                }
                if (StrUtil.isNotBlank(subAppId)) {
                    refundOrder.setSubAppId(subAppId);
                    log.info("设置退款订单子商户AppId: {}", subAppId);
                }
            }
        } finally {
            TenantContextHolder.clear();
        }
        
        refundOrderMapper.insert(refundOrder);
        return refundOrder;
    }

    @Override
    @SneakyThrows
    public Object refund(PayRefundOrder refundOrder, PayTradeOrder tradeOrder) {
        WxPayApiConfig wxPayApiConfig = WxPayApiConfigKit.getWxPayApiConfig();
        
        // 跳过租户过滤查询渠道配置
        TenantContextHolder.setTenantSkip();
        PayChannel channel;
        try {
            channel = channelMapper.selectOne(
                    Wrappers.<PayChannel>lambdaQuery()
                            .eq(PayChannel::getChannelMchId, tradeOrder.getChannelMchId())
                            .eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName()));
            
            if (channel == null) {
                // 降级查询
                channel = channelMapper.selectOne(
                        Wrappers.<PayChannel>lambdaQuery()
                                .eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName())
                                .last("LIMIT 1"));
            }
        } finally {
            TenantContextHolder.clear();
        }
        
        if (channel == null) {
            throw new IllegalArgumentException("微信支付渠道配置为空");
        }
        
        JSONObject channelParams = JSONUtil.parseObj(channel.getParam());
        String subMchId = channelParams.getStr("subMchId");
        boolean isServiceMode = StrUtil.isNotBlank(subMchId);

        RefundModel.RefundModelBuilder builder = RefundModel.builder()
                .appid(wxPayApiConfig.getAppId())
                .mch_id(wxPayApiConfig.getMchId())
                .nonce_str(WxPayKit.generateStr())
                .out_trade_no(tradeOrder.getOrderId().toString())
                .out_refund_no(refundOrder.getRefundOrderId().toString())
                .total_fee(tradeOrder.getAmount())
                .refund_fee(refundOrder.getRefundAmount().toString())
                .notify_url(channel.getNotifyUrl() + "/api/pay/notify/wx/refund");

        // 服务商模式：需要传入子商户号
        if (isServiceMode) {
            log.info("使用服务商模式退款，subMchId: {}", subMchId);
            builder.sub_mch_id(subMchId);
        }

        RefundModel model = builder.build();
        Map<String, String> params = model.createSign(wxPayApiConfig.getPartnerKey(), SignType.MD5);

        String xmlResult = WxPayApi.orderRefund(false, params, wxPayApiConfig.getCertPath(), wxPayApiConfig.getMchId());
        
        Map<String, String> result = WxPayKit.xmlToMap(xmlResult);
        
        // 格式化打印日志，一行一个参数
        StringBuilder logBuilder = new StringBuilder("\n======= 微信退款响应解析 =======");
        result.forEach((k, v) -> logBuilder.append("\n").append(k).append(": ").append(v));
        logBuilder.append("\n==============================");
        log.info(logBuilder.toString());
        String returnCode = result.get("return_code");
        String resultCode = result.get("result_code");

        if (WxPayKit.codeIsOk(returnCode) && WxPayKit.codeIsOk(resultCode)) {
            return result;
        } else {
            String errCodeDes = result.get("err_code_des");
            throw new RuntimeException("微信退款失败: " + (StrUtil.isNotBlank(errCodeDes) ? errCodeDes : result.get("return_msg")));
        }
    }

    @Override
    public void updateOrder(Object obj, PayRefundOrder refundOrder, PayTradeOrder tradeOrder) {
        Map<String, String> result = (Map<String, String>) obj;

        // 微信退款同步返回成功，立即更新订单状态
        // 微信的退款回调只是一个额外的通知机制，不影响最终状态
        refundOrder.setMchRefundNo(result.get("refund_id"));  // 记录微信退款单号
        refundOrder.setStatus(Integer.parseInt(TradeStatusEnum.TRADE_SUCCESS.getStatus())); // 1-退款成功
        refundOrder.setRefundSuccTime(LocalDateTime.now());  // 记录退款成功时间
        refundOrderMapper.updateById(refundOrder);
        log.info("退款成功（同步更新）：refundOrderId={}, mchRefundNo={}, status=1", 
            refundOrder.getRefundOrderId(), result.get("refund_id"));

        // 更新交易订单状态为已退款
        tradeOrder.setPaySuccTime(LocalDateTime.now());
        tradeOrder.setStatus(OrderStatusEnum.REFUND_SUCCESS.getStatus());  // 5-已退款
        tradeOrderMapper.updateById(tradeOrder);
        log.info("交易订单已更新为退款状态（同步更新）：orderId={}, status=5", tradeOrder.getOrderId());
        
        // ⭐ 同步调用订单服务更新 orders 表状态（主流程）
        try {
            // 从数据库重新查询退款订单，确保获取到最新的 param1 字段值
            TenantContextHolder.setTenantSkip();
            PayRefundOrder latestRefundOrder;
            try {
                latestRefundOrder = refundOrderMapper.selectById(refundOrder.getRefundOrderId());
            } finally {
                TenantContextHolder.clear();
            }
            
            if (latestRefundOrder != null && StrUtil.isNotBlank(latestRefundOrder.getParam1())) {
                String businessRefundNo = latestRefundOrder.getParam1();
                log.info("退款成功（同步），调用订单服务更新orders表，业务退款单号: {}", businessRefundNo);
                
                // ⭐ 直接调用订单服务的Feign接口更新orders表
                try {
                    orderFeignClient.refundSuccess(businessRefundNo);
                    log.info("订单服务更新成功，业务退款单号: {}", businessRefundNo);
                } catch (Exception e) {
                    log.error("调用订单服务失败，将通过Redis保底通知，业务退款单号: {}", businessRefundNo, e);
                    // ⭐ Feign调用失败时，发送Redis消息作为保底机制
                    stringRedisTemplate.convertAndSend("REFUND_SUCCESS_CHANNEL", businessRefundNo);
                    log.info("已发送Redis保底通知，业务退款单号: {}", businessRefundNo);
                }
            } else {
                log.warn("退款成功，但未找到业务退款单号，无法通知订单服务，refundOrderId={}", refundOrder.getRefundOrderId());
            }
            
        } catch (Exception e) {
            log.error("更新订单服务失败", e);
        }
    }

    @Override
    public Object handle(PayRefundOrder refundOrder) {
        // 跳过租户过滤查询交易订单
        TenantContextHolder.setTenantSkip();
        PayTradeOrder payTradeOrder;
        try {
            payTradeOrder = tradeOrderMapper.selectOne(
                    Wrappers.<PayTradeOrder>lambdaQuery().eq(PayTradeOrder::getOrderId, refundOrder.getPayOrderId()));
        } finally {
            TenantContextHolder.clear();
        }

        if (payTradeOrder == null) {
            throw new IllegalArgumentException("原支付订单不存在");
        }

        // 使用交易订单的渠道商户ID来准备支付参数
        if (StrUtil.isNotBlank(payTradeOrder.getChannelMchId())) {
            preparePayParams(payTradeOrder.getChannelMchId());
        } else {
            preparePayParams();
        }

        createPayRefundOrder(refundOrder, payTradeOrder);

        Object refundResult = refund(refundOrder, payTradeOrder);

        updateOrder(refundResult, refundOrder, payTradeOrder);

        return true;
    }
}
