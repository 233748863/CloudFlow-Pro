/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */
package cn.joywon.poco.pay.service.impl;

import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.pay.dto.PayRefundDTO;
import cn.joywon.poco.pay.entity.PayChannel;
import cn.joywon.poco.pay.entity.PayGoodsOrder;
import cn.joywon.poco.pay.entity.PayRefundOrder;
import cn.joywon.poco.pay.entity.PayTradeOrder;
import cn.joywon.poco.pay.handler.PayOrderRefundHandler;
import cn.joywon.poco.pay.mapper.PayChannelMapper;
import cn.joywon.poco.pay.mapper.PayGoodsOrderMapper;
import cn.joywon.poco.pay.mapper.PayRefundOrderMapper;
import cn.joywon.poco.pay.mapper.PayTradeOrderMapper;
import cn.joywon.poco.pay.service.PayRefundOrderService;
import cn.joywon.poco.pay.utils.PayChannelNameEnum;
import cn.joywon.poco.pay.utils.RefundNameEnum;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Map;

/**
 * 退款服务实现类
 * 
 * <p>职责说明：</p>
 * <ul>
 *   <li>处理退款请求，调用第三方支付平台（微信、支付宝）执行退款</li>
 *   <li>更新支付平台相关表（pay_refund_order、pay_trade_order、pay_goods_order）</li>
 *   <li>不直接更新业务订单表，通过Redis消息通知订单服务处理</li>
 * </ul>
 *
 * @author poco
 * @date 2019-05-28 23:58:11
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PayRefundOrderServiceImpl extends ServiceImpl<PayRefundOrderMapper, PayRefundOrder>
        implements PayRefundOrderService {

    private final Map<String, PayOrderRefundHandler> refundHandlerMap;
    private final PayChannelMapper channelMapper;
    private final PayTradeOrderMapper tradeOrderMapper;
    private final PayGoodsOrderMapper goodsOrderMapper;

    /**
     * 退款操作（基础方法）
     *
     * @param refundOrder 退款订单
     * @return true/false
     */
    @Override
    public Boolean refund(PayRefundOrder refundOrder) {
        PayChannel payChannel = channelMapper.selectOne(
                Wrappers.<PayChannel>lambdaQuery()
                        .eq(PayChannel::getChannelMchId, refundOrder.getChannelMchId())
        );

        // 判断用哪个通道
        if (StrUtil.equals(payChannel.getChannelId(), PayChannelNameEnum.ALIPAY_WAP.getName())) {
            refundHandlerMap.get(RefundNameEnum.ALIPAY.getName()).handle(refundOrder);
            return true;
        }

        if (StrUtil.equals(payChannel.getChannelId(), PayChannelNameEnum.WEIXIN_MP.getName())) {
            refundHandlerMap.get(RefundNameEnum.WEIXIN.getName()).handle(refundOrder);
            return true;
        }

        throw new UnsupportedOperationException("暂不支持该渠道退款");
    }

    /**
     * 根据订单号退款（供Feign调用）
     * 
     * <p>流程说明：</p>
     * <ol>
     *   <li>通过业务订单ID查找支付记录（pay_goods_order → pay_trade_order）</li>
     *   <li>构建退款订单，调用第三方支付平台执行退款</li>
     *   <li>更新支付平台相关表（pay_refund_order、pay_trade_order）</li>
     *   <li>退款成功后，微信会异步回调，回调处理器会发送Redis消息</li>
     *   <li>订单服务监听Redis消息，更新业务订单状态</li>
     * </ol>
     * 
     * @param refundDTO 退款参数
     * @return 退款结果
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public R<Boolean> refundByOrderNo(PayRefundDTO refundDTO) {
        log.info("收到退款请求: orderNo={}, refundNo={}, refundAmount={}", 
                refundDTO.getOrderNo(), refundDTO.getRefundNo(), refundDTO.getRefundAmount());
        
        // 1. 参数校验
        if (StrUtil.isBlank(refundDTO.getOrderNo())) {
            return R.failed("订单号不能为空");
        }
        if (refundDTO.getRefundAmount() == null || refundDTO.getRefundAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return R.failed("退款金额必须大于0");
        }

        // orderNo 传的是业务订单ID（orders.id）
        // 需要通过 pay_goods_order.goods_id 找到 pay_order_id，再查 pay_trade_order
        String businessOrderId = refundDTO.getOrderNo();
        
        // 2. 查询支付记录（跳过租户过滤）
        TenantContextHolder.setTenantSkip();
        PayGoodsOrder goodsOrder;
        PayTradeOrder tradeOrder;
        try {
            // 2.1 先通过 goods_id（业务订单ID）查找商品订单，获取 pay_order_id
            goodsOrder = goodsOrderMapper.selectOne(
                    Wrappers.<PayGoodsOrder>lambdaQuery()
                            .eq(PayGoodsOrder::getGoodsId, businessOrderId)
                            .orderByDesc(PayGoodsOrder::getCreateTime)
                            .last("LIMIT 1"));
            
            if (goodsOrder == null) {
                log.error("未找到商品订单记录, goodsId: {}", businessOrderId);
                return R.failed("未找到支付订单记录");
            }
            
            log.info("找到商品订单: goodsOrderId={}, payOrderId={}", goodsOrder.getGoodsOrderId(), goodsOrder.getPayOrderId());
            
            // 2.2 通过 pay_order_id 查找支付交易记录
            tradeOrder = tradeOrderMapper.selectOne(
                    Wrappers.<PayTradeOrder>lambdaQuery()
                            .eq(PayTradeOrder::getOrderId, goodsOrder.getPayOrderId())
                            .orderByDesc(PayTradeOrder::getCreateTime)
                            .last("LIMIT 1"));
        } finally {
            TenantContextHolder.clear();
        }

        if (tradeOrder == null) {
            log.error("未找到支付交易记录, payOrderId: {}", goodsOrder.getPayOrderId());
            return R.failed("未找到支付订单记录");
        }
        
        log.info("找到支付交易记录: orderId={}, channelId={}, amount={}", 
                tradeOrder.getOrderId(), tradeOrder.getChannelId(), tradeOrder.getAmount());

        // 3. 构建退款订单
        PayRefundOrder refundOrder = new PayRefundOrder();
        refundOrder.setPayOrderId(tradeOrder.getOrderId());
        refundOrder.setChannelMchId(tradeOrder.getChannelMchId());
        refundOrder.setChannelId(tradeOrder.getChannelId());
        // 退款金额转换为分
        refundOrder.setRefundAmount(refundDTO.getRefundAmount().multiply(new BigDecimal("100")).longValue());
        refundOrder.setRemark(refundDTO.getRefundReason());
        // ⭐ 保存业务退款单号到 param1 字段，用于退款成功后通知订单服务
        refundOrder.setParam1(refundDTO.getRefundNo());
        log.info("保存业务退款单号: {}", refundDTO.getRefundNo());

        try {
            // 4. 根据渠道选择退款处理器，调用第三方支付平台
            if (StrUtil.equals(tradeOrder.getChannelId(), PayChannelNameEnum.WEIXIN_MP.getName())) {
                refundHandlerMap.get(RefundNameEnum.WEIXIN.getName()).handle(refundOrder);
                log.info("微信退款请求已发送, refundOrderId={}", refundOrder.getRefundOrderId());
                return R.ok(true, "退款请求已提交");
            }

            if (StrUtil.equals(tradeOrder.getChannelId(), PayChannelNameEnum.ALIPAY_WAP.getName())) {
                refundHandlerMap.get(RefundNameEnum.ALIPAY.getName()).handle(refundOrder);
                log.info("支付宝退款请求已发送, refundOrderId={}", refundOrder.getRefundOrderId());
                return R.ok(true, "退款请求已提交");
            }

            return R.failed("暂不支持该渠道退款");
        } catch (Exception e) {
            log.error("退款失败", e);
            return R.failed("退款失败: " + e.getMessage());
        }
    }
}
