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
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import cn.joywon.poco.pay.entity.PayGoodsOrder;
import cn.joywon.poco.pay.entity.PayNotifyRecord;
import cn.joywon.poco.pay.handler.PayNotifyCallbakHandler;
import cn.joywon.poco.pay.service.PayGoodsOrderService;
import cn.joywon.poco.pay.service.PayNotifyRecordService;
import cn.joywon.poco.pay.utils.PayConstants;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.Map;

/**
 * @author poco
 * @date 2019-06-27
 */
@Slf4j
public abstract class AbstractPayNotifyCallbakHandler implements PayNotifyCallbakHandler {

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @Autowired
    private PayGoodsOrderService payGoodsOrderService;

    /**
     * 获取StringRedisTemplate供子类使用
     */
    protected StringRedisTemplate getStringRedisTemplate() {
        return stringRedisTemplate;
    }

	/**
	 * 调用入口
	 * @param params
	 * @return
	 */
	@Override
	public String handle(Map<String, String> params) {

		// 初始化租户
		before(params);

		// 去重处理
		if (duplicateChecker(params)) {
			return null;
		}

		// 验签处理
		if (!verifyNotify(params)) {
			return null;
		}

		String result = parse(params);
		// 保存处理结果
		saveNotifyRecord(params, result);

        // 发送Redis消息通知订单模块（发送业务订单号，而不是支付订单号）
        try {
            String payOrderNo = params.get(PayConstants.OUT_TRADE_NO);
            if (StrUtil.isNotBlank(payOrderNo)) {
                // 查询PayGoodsOrder获取业务订单号（goodsId字段存储的是业务订单ID）
                PayGoodsOrder goodsOrder = payGoodsOrderService.getOne(
                    Wrappers.<PayGoodsOrder>lambdaQuery()
                        .eq(PayGoodsOrder::getPayOrderId, payOrderNo)
                        .last("limit 1")
                );
                
                if (goodsOrder != null && StrUtil.isNotBlank(goodsOrder.getGoodsId())) {
                    String businessOrderId = goodsOrder.getGoodsId();
                    log.info("支付回调成功，发送Redis通知，支付订单号: {}, 业务订单ID: {}", payOrderNo, businessOrderId);
                    stringRedisTemplate.convertAndSend("PAY_SUCCESS_CHANNEL", businessOrderId);
                } else {
                    log.warn("支付回调：未找到对应的商品订单或goodsId为空, payOrderNo={}", payOrderNo);
                }
            }
        } catch (Exception e) {
            log.error("发送支付成功通知失败", e);
        }

		return result;
	}

	/**
	 * 保存记录
	 * @param params
	 * @param result
	 * @param record
	 * @param notifyId
	 * @param recordService
	 */
	void saveRecord(Map<String, String> params, String result, PayNotifyRecord record, String notifyId,
			PayNotifyRecordService recordService) {
		record.setNotifyId(notifyId);
		String orderNo = params.get(PayConstants.OUT_TRADE_NO);
		record.setOrderNo(orderNo);
		record.setRequest(MapUtil.join(params, StrUtil.DASHED, StrUtil.DASHED));
		record.setResponse(result);
		recordService.save(record);
	}

}
