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

package cn.joywon.poco.pay.handler.impl;

import cn.hutool.core.map.MapUtil;
import cn.hutool.core.util.EnumUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.pay.entity.PayGoodsOrder;
import cn.joywon.poco.pay.entity.PayNotifyRecord;
import cn.joywon.poco.pay.entity.PayTradeOrder;
import cn.joywon.poco.pay.handler.MessageDuplicateCheckerHandler;
import cn.joywon.poco.pay.service.PayGoodsOrderService;
import cn.joywon.poco.pay.service.PayNotifyRecordService;
import cn.joywon.poco.pay.service.PayTradeOrderService;
import cn.joywon.poco.pay.utils.OrderStatusEnum;
import cn.joywon.poco.pay.utils.PayConstants;
import cn.joywon.poco.pay.utils.TradeStatusEnum;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * @author poco
 * @date 2019-06-27
 * <p>
 * 支付宝回调处理
 */
@Slf4j
@AllArgsConstructor
@Service("alipayCallback")
public class AlipayPayNotifyCallbackHandler extends AbstractPayNotifyCallbakHandler {

    private final MessageDuplicateCheckerHandler duplicateCheckerHandler;

    private final PayTradeOrderService tradeOrderService;

    private final PayGoodsOrderService goodsOrderService;

    private final PayNotifyRecordService recordService;

    /**
     * 维护租户信息
     *
     * @param params
     */
    @Override
    public void before(Map<String, String> params) {
        Long tenant = MapUtil.getLong(params, "passback_params");
        TenantContextHolder.setTenantId(tenant);
    }

    /**
     * 去重处理
     *
     * @param params 回调报文
     * @return
     */
    @Override
    public Boolean duplicateChecker(Map<String, String> params) {
        // 判断是否是为支付中
        if (StrUtil.equals(TradeStatusEnum.WAIT_BUYER_PAY.getDescription(), params.get(PayConstants.TRADE_STATUS))) {
            log.info("支付宝订单待支付 {} 不做处理", params);
            return true;
        }

        // 判断10秒内是否已经回调处理
        if (duplicateCheckerHandler.isDuplicate(params.get(PayConstants.OUT_TRADE_NO))) {
            log.info("支付宝订单重复回调 {} 不做处理", params);
            this.saveNotifyRecord(params, "重复回调");
            return true;
        }
        return false;
    }

    /**
     * 验签逻辑
     *
     * @param params 回调报文
     * @return
     */
    @Override
    public Boolean verifyNotify(Map<String, String> params) {
        return true;
    }

    /**
     * 解析报文
     *
     * @param params 回调报文
     * @return
     */
    @Override
    public String parse(Map<String, String> params) {
        String tradeStatus = EnumUtil.fromString(TradeStatusEnum.class, params.get(PayConstants.TRADE_STATUS))
                .getStatus();

        String orderNo = params.get(PayConstants.OUT_TRADE_NO);
        PayGoodsOrder goodsOrder = goodsOrderService
                .getOne(Wrappers.<PayGoodsOrder>lambdaQuery().eq(PayGoodsOrder::getPayOrderId, orderNo));
        goodsOrder.setStatus(tradeStatus);
        goodsOrderService.updateById(goodsOrder);

        PayTradeOrder tradeOrder = tradeOrderService
                .getOne(Wrappers.<PayTradeOrder>lambdaQuery().eq(PayTradeOrder::getOrderId, orderNo));
        tradeOrder.setPaySuccTime(LocalDateTime.now());
        tradeOrder.setChannelOrderNo(params.get("trade_no"));
        tradeOrder.setStatus(TradeStatusEnum.TRADE_SUCCESS.getStatus());
        // 退款也会回调,trade_status=TRADE_CLOSED ,具体看报文记录
        if (OrderStatusEnum.REFUND_SUCCESS.getStatus().equals(tradeStatus)) {
            tradeOrder.setStatus(OrderStatusEnum.REFUND_SUCCESS.getStatus());
        } else {
            tradeOrder.setStatus(TradeStatusEnum.TRADE_SUCCESS.getStatus());
        }
        tradeOrderService.updateById(tradeOrder);
        return "success";
    }

    /**
     * 保存回调记录
     *
     * @param result 处理结果
     * @param params 回调报文
     */
    @Override
    public void saveNotifyRecord(Map<String, String> params, String result) {
        PayNotifyRecord record = new PayNotifyRecord();
        String notifyId = params.get("notify_id");
        saveRecord(params, result, record, notifyId, recordService);
    }

}
