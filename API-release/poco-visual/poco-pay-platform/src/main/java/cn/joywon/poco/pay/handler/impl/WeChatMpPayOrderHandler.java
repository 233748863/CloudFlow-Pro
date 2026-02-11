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

import cn.hutool.extra.servlet.JakartaServletUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.ijpay.core.enums.SignType;
import com.ijpay.core.enums.TradeType;
import com.ijpay.core.kit.WxPayKit;
import com.ijpay.wxpay.WxPayApi;
import com.ijpay.wxpay.WxPayApiConfig;
import com.ijpay.wxpay.WxPayApiConfigKit;
import com.ijpay.wxpay.model.UnifiedOrderModel;
import cn.joywon.poco.common.core.util.WebUtils;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.pay.entity.PayChannel;
import cn.joywon.poco.pay.entity.PayGoodsOrder;
import cn.joywon.poco.pay.entity.PayTradeOrder;
import cn.joywon.poco.pay.mapper.PayChannelMapper;
import cn.joywon.poco.pay.mapper.PayGoodsOrderMapper;
import cn.joywon.poco.pay.mapper.PayTradeOrderMapper;
import cn.joywon.poco.pay.utils.ChannelPayApiConfigKit;
import cn.joywon.poco.pay.utils.OrderStatusEnum;
import cn.joywon.poco.pay.utils.PayChannelNameEnum;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * @author poco
 * @date 2019-05-31
 * <p>
 * 微信公众号支付
 */
@Slf4j
@Service("WEIXIN_MP")
@RequiredArgsConstructor
public class WeChatMpPayOrderHandler extends AbstractPayOrderHandler {

	private final PayTradeOrderMapper tradeOrderMapper;

	private final PayGoodsOrderMapper goodsOrderMapper;

	private final PayChannelMapper channelMapper;

	private final HttpServletRequest request;

	/**
	 * 准备支付参数
	 * @return PayChannel
	 */
	@Override
	public PayChannel preparePayParams() {
		PayChannel channel = channelMapper.selectOne(
				Wrappers.<PayChannel>lambdaQuery()
						.eq(PayChannel::getChannelId, PayChannelNameEnum.WEIXIN_MP.getName())
						.last("LIMIT 1"));

		if (channel == null) {
			throw new IllegalArgumentException("微信公众号支付渠道配置为空");
		}

		JSONObject params = JSONUtil.parseObj(channel.getParam());
		WxPayApiConfig wx = WxPayApiConfig.builder()
			.appId(channel.getAppId())
			.mchId(channel.getChannelMchId())
			.partnerKey(params.getStr("partnerKey"))
			.build();

		WxPayApiConfigKit.setThreadLocalWxPayApiConfig(wx);
		return channel;
	}

	/**
	 * 创建交易订单
	 * @param goodsOrder
	 * @return
	 */
	@Override
	public PayTradeOrder createTradeOrder(PayGoodsOrder goodsOrder) {
		PayTradeOrder tradeOrder = new PayTradeOrder();
		tradeOrder.setOrderId(goodsOrder.getPayOrderId());
		tradeOrder.setAmount(goodsOrder.getAmount());
		tradeOrder.setChannelId(PayChannelNameEnum.WEIXIN_MP.getName());
		tradeOrder.setChannelMchId(WxPayApiConfigKit.getWxPayApiConfig().getMchId());
		tradeOrder.setClientIp(JakartaServletUtil.getClientIP(request));
		tradeOrder.setCurrency("CNY");
		tradeOrder.setStatus(OrderStatusEnum.INIT.getStatus());
		tradeOrder.setBody(goodsOrder.getGoodsName());
		tradeOrderMapper.insert(tradeOrder);
		return tradeOrder;
	}

	/**
	 * 调起渠道支付
	 * @param goodsOrder 商品订单
	 * @param tradeOrder 交易订单
	 */
	@Override
	public Object pay(PayGoodsOrder goodsOrder, PayTradeOrder tradeOrder) {
		String ip = JakartaServletUtil.getClientIP(request);
		WxPayApiConfig wxPayApiConfig = WxPayApiConfigKit.getWxPayApiConfig();
		PayChannel channel = ChannelPayApiConfigKit.get();
		JSONObject channelParams = JSONUtil.parseObj(channel.getParam());
		
		// 获取子商户配置（服务商模式）
		String subAppId = channelParams.getStr("subAppId");
		String subMchId = channelParams.getStr("subMchId");
		boolean isServiceMode = cn.hutool.core.util.StrUtil.isNotBlank(subMchId);

		UnifiedOrderModel.UnifiedOrderModelBuilder builder = UnifiedOrderModel.builder()
			.appid(wxPayApiConfig.getAppId())
			.mch_id(wxPayApiConfig.getMchId())
			.nonce_str(WxPayKit.generateStr())
			.body(goodsOrder.getGoodsName())
			.attach(TenantContextHolder.getTenantId().toString())
			.out_trade_no(String.valueOf(tradeOrder.getOrderId()))
			.total_fee(goodsOrder.getAmount())
			.spbill_create_ip(ip)
			.notify_url(String.format("%s/api/%s/notify/wx/callbak", channel.getNotifyUrl(), WebUtils.isMicro() ? "pay" : "admin"))
			.trade_type(TradeType.JSAPI.getTradeType())
			.profit_sharing(goodsOrder.getIsProfitSharing());

		// 服务商模式：需要传入子商户信息
		if (isServiceMode) {
			log.info("使用服务商模式支付，subAppId: {}, subMchId: {}", subAppId, subMchId);
			builder.sub_appid(subAppId)
				   .sub_mch_id(subMchId)
				   .sub_openid(goodsOrder.getOpenId());  // 用户在子商户小程序的openid
		} else {
			// 直连模式
			builder.openid(goodsOrder.getUserId());
		}

		Map<String, String> params = builder.build()
			.createSign(wxPayApiConfig.getPartnerKey(), SignType.HMACSHA256);

		String xmlResult = WxPayApi.pushOrder(false, params);
		log.info("微信统一下单返回 {}", xmlResult);
		Map<String, String> resultMap = WxPayKit.xmlToMap(xmlResult);
		
		String returnCode = resultMap.get("return_code");
		if (!"SUCCESS".equals(returnCode)) {
			log.error("微信支付通信失败: {}", resultMap.get("return_msg"));
			throw new RuntimeException("微信支付通信失败: " + resultMap.get("return_msg"));
		}
		
		String resultCode = resultMap.get("result_code");
		if (!"SUCCESS".equals(resultCode)) {
			log.error("微信支付业务失败: {} - {}", resultMap.get("err_code"), resultMap.get("err_code_des"));
			throw new RuntimeException("微信支付失败: " + resultMap.get("err_code_des"));
		}
		
		String prepayId = resultMap.get("prepay_id");
		// 服务商模式返回子商户的appId给前端调起支付
		String returnAppId = isServiceMode ? subAppId : wxPayApiConfig.getAppId();
		return WxPayKit.prepayIdCreateSign(prepayId, returnAppId, wxPayApiConfig.getPartnerKey(),
				SignType.HMACSHA256);
	}

	/**
	 * 更新订单信息
	 * @param goodsOrder 商品订单
	 * @param tradeOrder 交易订单
	 */
	@Override
	public void updateOrder(PayGoodsOrder goodsOrder, PayTradeOrder tradeOrder) {
		tradeOrderMapper.updateById(tradeOrder);
		goodsOrderMapper.updateById(goodsOrder);
	}

}
