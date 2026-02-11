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

package cn.joywon.poco.pay.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.pay.entity.PayGoodsOrder;

import java.util.Map;

/**
 * 商品
 *
 * @author poco
 * @date 2019-05-28 23:58:27
 */
public interface PayGoodsOrderService extends IService<PayGoodsOrder> {

	/**
	 * 购买商品
	 * @param goodsOrder goods
	 * @param isMerge 是否是服务商
	 * @return
	 */
	Map<String, Object> buy(PayGoodsOrder goodsOrder, boolean isMerge);

	/**
	 * 微信小程序支付
	 * @param goodsOrder goods
	 * @return 支付参数
	 */
	Map<String, Object> buyMini(PayGoodsOrder goodsOrder);

	/**
	 * 微信JSAPI支付（使用WEIXIN_MP渠道配置）
	 * @param goodsOrder goods
	 * @return 支付参数
	 */
	Map<String, Object> buyWxJsapi(PayGoodsOrder goodsOrder);

}
