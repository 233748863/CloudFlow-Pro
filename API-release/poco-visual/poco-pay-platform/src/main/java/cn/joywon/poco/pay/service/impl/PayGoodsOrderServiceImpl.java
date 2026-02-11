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

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.pay.entity.PayGoodsOrder;
import cn.joywon.poco.pay.handler.PayOrderHandler;
import cn.joywon.poco.pay.mapper.PayGoodsOrderMapper;
import cn.joywon.poco.pay.service.PayGoodsOrderService;
import cn.joywon.poco.pay.utils.PayChannelNameEnum;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.Map;

/**
 * 商品
 *
 * @author poco
 * @date 2019-05-28 23:58:27
 */
@Slf4j
@Service
@AllArgsConstructor
public class PayGoodsOrderServiceImpl extends ServiceImpl<PayGoodsOrderMapper, PayGoodsOrder>
		implements PayGoodsOrderService {

	private final Map<String, PayOrderHandler> orderHandlerMap;

	private final HttpServletRequest request;

	/**
	 * 下单购买
	 * @param goodsOrder
	 * @param isMerge
	 * @return
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public Map<String, Object> buy(PayGoodsOrder goodsOrder, boolean isMerge) {
		// 是否聚合支付
		String ua = isMerge ? "MERGE_PAY" : request.getHeader(HttpHeaders.USER_AGENT);

		Enum channel = PayChannelNameEnum.getChannel(ua);
		PayOrderHandler orderHandler = orderHandlerMap.get(channel.name());
		goodsOrder.setGoodsName("测试产品");
		goodsOrder.setGoodsId("10001");
		Object params = orderHandler.handle(goodsOrder);

		Map<String, Object> result = new HashMap<>(4);
		result.put("channel", channel.name());
		result.put("goods", goodsOrder);
		result.put("params", params);
		return result;
	}

	/**
	 * 微信小程序支付
	 * @param goodsOrder
	 * @return
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public Map<String, Object> buyMini(PayGoodsOrder goodsOrder) {
		PayOrderHandler orderHandler = orderHandlerMap.get(PayChannelNameEnum.WEIXIN_MINI.name());
		if (orderHandler == null) {
			throw new IllegalArgumentException("微信小程序支付渠道未配置");
		}
		
		if (goodsOrder.getGoodsName() == null) {
			goodsOrder.setGoodsName("商品订单");
		}
		if (goodsOrder.getGoodsId() == null) {
			goodsOrder.setGoodsId(String.valueOf(goodsOrder.getPayOrderId()));
		}
		
		Object params = orderHandler.handle(goodsOrder);

		Map<String, Object> result = new HashMap<>(4);
		result.put("channel", PayChannelNameEnum.WEIXIN_MINI.name());
		result.put("goods", goodsOrder);
		result.put("params", params);
		return result;
	}

	/**
	 * 微信JSAPI支付（使用WEIXIN_MP渠道配置，公众号/小程序通用）
	 * @param goodsOrder
	 * @return
	 */
	@Override
	@Transactional(rollbackFor = Exception.class)
	public Map<String, Object> buyWxJsapi(PayGoodsOrder goodsOrder) {
		PayOrderHandler orderHandler = orderHandlerMap.get(PayChannelNameEnum.WEIXIN_MP.name());
		if (orderHandler == null) {
			throw new IllegalArgumentException("微信支付渠道未配置");
		}
		
		if (goodsOrder.getGoodsName() == null) {
			goodsOrder.setGoodsName("商品订单");
		}
		if (goodsOrder.getGoodsId() == null) {
			goodsOrder.setGoodsId(String.valueOf(goodsOrder.getPayOrderId()));
		}
		
		Object params = orderHandler.handle(goodsOrder);

		Map<String, Object> result = new HashMap<>(4);
		result.put("channel", PayChannelNameEnum.WEIXIN_MP.name());
		result.put("goods", goodsOrder);
		result.put("params", params);
		return result;
	}

}
