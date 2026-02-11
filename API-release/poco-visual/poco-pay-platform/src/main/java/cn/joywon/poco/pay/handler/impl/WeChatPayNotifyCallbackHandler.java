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
import cn.hutool.crypto.SecureUtil;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import cn.joywon.poco.pay.entity.*;
import cn.joywon.poco.pay.service.*;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.ijpay.core.kit.WxPayKit;
import cn.joywon.poco.common.data.tenant.TenantContextHolder;
import cn.joywon.poco.pay.handler.MessageDuplicateCheckerHandler;
import cn.joywon.poco.pay.utils.PayConstants;
import cn.joywon.poco.pay.utils.TradeStatusEnum;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * @author poco
 * @date 2019-06-27
 * <p>
 * 微信回调处理
 */
@Slf4j
@AllArgsConstructor
@Service("weChatCallback")
public class WeChatPayNotifyCallbackHandler extends AbstractPayNotifyCallbakHandler {

	private final MessageDuplicateCheckerHandler duplicateCheckerHandler;

	private final PayTradeOrderService tradeOrderService;

	private final PayGoodsOrderService goodsOrderService;

	private final PayNotifyRecordService recordService;
	
	private final PayRefundOrderService refundOrderService;
	
	private final PayChannelService payChannelService;

	/**
	 * 维护租户信息
	 * @param params
	 */
	@Override
	public void before(Map<String, String> params) {
		Long tenant = MapUtil.getLong(params, "attach");
		TenantContextHolder.setTenantId(tenant);
	}

	/**
	 * 去重处理
	 * @param params 回调报文
	 * @return
	 */
	@Override
	public Boolean duplicateChecker(Map<String, String> params) {
		// 判断10秒内是否已经回调处理
		if (duplicateCheckerHandler.isDuplicate(params.get(PayConstants.OUT_TRADE_NO))) {
			log.info("微信订单重复回调 {} 不做处理", params);
			this.saveNotifyRecord(params, "重复回调");
			return true;
		}
		return false;
	}

	/**
	 * 验签逻辑
	 * @param params 回调报文
	 * @return
	 */
	@Override
	public Boolean verifyNotify(Map<String, String> params) {
		return true;
	}

	/**
	 * 解析报文
	 * @param params
	 * @return
	 */
	@Override
	public String parse(Map<String, String> params) {
		log.info("微信支付回调参数: {}", params);

		String tradeStatus = EnumUtil.fromString(TradeStatusEnum.class, params.get(PayConstants.RESULT_CODE))
			.getStatus();

		String orderNo = params.get(PayConstants.OUT_TRADE_NO);
		PayGoodsOrder goodsOrder = goodsOrderService
			.getOne(Wrappers.<PayGoodsOrder>lambdaQuery().eq(PayGoodsOrder::getPayOrderId, orderNo));
		goodsOrder.setStatus(tradeStatus);
		goodsOrderService.updateById(goodsOrder);

		PayTradeOrder tradeOrder = tradeOrderService
			.getOne(Wrappers.<PayTradeOrder>lambdaQuery().eq(PayTradeOrder::getOrderId, orderNo));
		tradeOrder.setPaySuccTime(LocalDateTime.now());
		tradeOrder.setStatus(tradeStatus);
		tradeOrder.setChannelOrderNo(params.get("transaction_id"));
		tradeOrder.setErrMsg(params.get("err_code_des"));
		tradeOrder.setErrCode(params.get("err_code"));
		tradeOrderService.updateById(tradeOrder);

		// 发送Redis消息通知业务订单服务
		try {
			if (StrUtil.isNotBlank(orderNo) && "2".equals(tradeStatus)) { // 2-支付成功
				log.info("支付回调成功，发送Redis通知，订单号: {}", orderNo);
				getStringRedisTemplate().convertAndSend("PAY_SUCCESS_CHANNEL", orderNo);
			}
		} catch (Exception e) {
			log.error("发送支付成功通知失败", e);
		}

		Map<String, String> xml = new HashMap<>(4);
		xml.put("return_code", "SUCCESS");
		xml.put("return_msg", "OK");
		return WxPayKit.toXml(xml);
	}

	/**
	 * 退款回调处理（保底机制）
	 * @param params 回调报文
	 * @return 响应XML
	 */
	@Override
	public String handleRefund(Map<String, String> params) {
		// 格式化打印原始回调参数
		StringBuilder rawLogBuilder = new StringBuilder("\n========== 微信退款回调原始数据 ==========");
		params.forEach((k, v) -> rawLogBuilder.append("\n").append(k).append(": ").append(v));
		rawLogBuilder.append("\n======================================");
		log.info(rawLogBuilder.toString());

		String returnCode = params.get("return_code");
		if (!"SUCCESS".equals(returnCode)) {
			log.error("微信退款回调失败: {}", params.get("return_msg"));
			// 返回成功避免微信重复回调
			return buildRefundResponse("SUCCESS", "OK");
		}

		// 解密退款回调数据
		String reqInfo = params.get("req_info");
		if (StrUtil.isBlank(reqInfo)) {
			log.error("微信退款回调缺少req_info字段");
			// 返回成功避免微信重复回调
			return buildRefundResponse("SUCCESS", "OK");
		}

		Map<String, String> refundData;
		try {
			// 解密退款数据
			refundData = decryptRefundNotify(reqInfo);
			
			// 格式化打印解密后的退款回调数据
			StringBuilder logBuilder = new StringBuilder("\n======= 微信退款回调解密数据 =======");
			refundData.forEach((k, v) -> logBuilder.append("\n").append(k).append(": ").append(v));
			logBuilder.append("\n==================================");
			log.info(logBuilder.toString());
		} catch (Exception e) {
			log.error("微信退款回调解密失败", e);
			// 返回成功避免微信重复回调
			return buildRefundResponse("SUCCESS", "OK");
		}

		// 从解密后的数据中获取关键字段
		String refundStatus = refundData.get("refund_status");
		String outRefundNo = refundData.get("out_refund_no"); // 退款单号（String类型）
		String outTradeNo = refundData.get("out_trade_no");   // 原支付订单号
		String refundId = refundData.get("refund_id");        // 微信退款单号
		String transactionId = refundData.get("transaction_id"); // 微信支付订单号

		log.info("退款回调关键信息 - refundStatus: {}, outRefundNo: {}, outTradeNo: {}, refundId: {}", 
			refundStatus, outRefundNo, outTradeNo, refundId);

		if (!"SUCCESS".equals(refundStatus)) {
			log.warn("微信退款未成功, refundStatus={}, outRefundNo={}", refundStatus, outRefundNo);
			return buildRefundResponse("SUCCESS", "OK");
		}

		// 去重处理
		if (duplicateCheckerHandler.isDuplicate("REFUND_" + outRefundNo)) {
			log.info("微信退款重复回调 {} 不做处理", outRefundNo);
			return buildRefundResponse("SUCCESS", "OK");
		}
		
		// ⭐ 类型转换：String → Long（修复核心问题）
		Long refundOrderId = convertToLong(outRefundNo);
		if (refundOrderId == null) {
			log.error("退款单号类型转换失败，无法处理回调: outRefundNo={}", outRefundNo);
			// 返回成功避免微信重复回调
			return buildRefundResponse("SUCCESS", "OK");
		}
		log.info("类型转换成功: outRefundNo={} -> refundOrderId={}", outRefundNo, refundOrderId);

		// 更新支付表状态（确保与微信状态一致）
		try {
			// 1. 查询退款订单（使用Long类型）
			PayRefundOrder refundOrder = null;
			if (refundOrderId != null) {
				// 跳过租户过滤
				TenantContextHolder.setTenantSkip();
				try {
					// 通过退款单号查询退款记录（使用Long类型）
					refundOrder = refundOrderService.getOne(
						Wrappers.<PayRefundOrder>lambdaQuery()
							.eq(PayRefundOrder::getRefundOrderId, refundOrderId)
							.last("LIMIT 1"));
					
					if (refundOrder != null) {
						log.info("成功查询到退款订单: refundOrderId={}, status={}, param1={}", 
							refundOrderId, refundOrder.getStatus(), refundOrder.getParam1());
					} else {
						log.warn("未找到退款记录, refundOrderId={}", refundOrderId);
					}
				} finally {
					TenantContextHolder.clear();
				}
			}
			
			// 2. 更新 pay_refund_order 表（使用智能判断和乐观锁）
			if (refundOrder != null && needsUpdate(refundOrder)) {
				TenantContextHolder.setTenantSkip();
				try {
					// 只更新状态不是成功的订单，使用乐观锁避免并发冲突
					if (refundOrder.getStatus() != 1) {
						long startTime = System.currentTimeMillis();
						
						// 使用乐观锁更新（基于status字段）
						boolean updated = refundOrderService.update(
							Wrappers.<PayRefundOrder>lambdaUpdate()
								.eq(PayRefundOrder::getRefundOrderId, refundOrderId)
								.eq(PayRefundOrder::getStatus, refundOrder.getStatus()) // 乐观锁：只有状态未变时才更新
								.set(PayRefundOrder::getStatus, 1)
								.set(PayRefundOrder::getMchRefundNo, refundId)
								.set(PayRefundOrder::getRefundSuccTime, LocalDateTime.now())
						);
						
						long endTime = System.currentTimeMillis();
						long duration = endTime - startTime;
						
						if (updated) {
							log.info("已更新 pay_refund_order 表（异步回调，乐观锁成功）, refundOrderId={}, status=1, 耗时={}ms", 
								refundOrderId, duration);
						} else {
							log.info("退款订单已被其他线程更新（乐观锁冲突），跳过, refundOrderId={}, 耗时={}ms", 
								refundOrderId, duration);
						}
					} else {
						log.info("退款订单已是成功状态但需要补偿更新, refundOrderId={}", refundOrderId);
					}
				} finally {
					TenantContextHolder.clear();
				}
			} else if (refundOrder != null) {
				log.info("根据智能判断，跳过退款订单更新, refundOrderId={}", refundOrderId);
			}

			// 3. 更新 pay_trade_order 表（添加状态检查和性能监控）
			if (StrUtil.isNotBlank(outTradeNo)) {
				TenantContextHolder.setTenantSkip();
				try {
					PayTradeOrder tradeOrder = tradeOrderService.getOne(
						Wrappers.<PayTradeOrder>lambdaQuery()
							.eq(PayTradeOrder::getOrderId, outTradeNo)
							.last("LIMIT 1"));
					
					if (tradeOrder != null) {
						// 检查是否已经是退款状态（避免重复更新）
						if (!"5".equals(tradeOrder.getStatus())) {
							long startTime = System.currentTimeMillis();
							
							// 使用乐观锁更新（基于status字段）
							boolean updated = tradeOrderService.update(
								Wrappers.<PayTradeOrder>lambdaUpdate()
									.eq(PayTradeOrder::getOrderId, outTradeNo)
									.eq(PayTradeOrder::getStatus, tradeOrder.getStatus()) // 乐观锁：只有状态未变时才更新
									.set(PayTradeOrder::getStatus, "5")
							);
							
							long endTime = System.currentTimeMillis();
							long duration = endTime - startTime;
							
							if (updated) {
								log.info("已更新 pay_trade_order 表（异步回调，乐观锁成功）, orderId={}, status=5, 耗时={}ms", 
									outTradeNo, duration);
							} else {
								log.info("交易订单已被其他线程更新（乐观锁冲突），跳过, orderId={}, 耗时={}ms", 
									outTradeNo, duration);
							}
						} else {
							log.info("交易订单已是退款状态（同步已更新），跳过, orderId={}", outTradeNo);
						}
					}
				} finally {
					TenantContextHolder.clear();
				}
			}
		} catch (Exception e) {
			log.error("更新支付表失败", e);
			// 不抛异常，避免影响微信回调响应
		}

		// 4. 智能发送保底通知（仅在需要时发送）
		try {
			if (refundOrderId != null) {
				TenantContextHolder.setTenantSkip();
				try {
					// 重新查询退款订单，获取最新状态
					PayRefundOrder latestRefundOrder =
						refundOrderService.getOne(Wrappers.<PayRefundOrder>lambdaQuery()
							.eq(PayRefundOrder::getRefundOrderId, refundOrderId)
							.last("LIMIT 1"));
					
					// 使用智能判断方法决定是否发送保底通知
					sendFallbackNotification(latestRefundOrder);
				} finally {
					TenantContextHolder.clear();
				}
			}
		} catch (Exception e) {
			log.error("发送退款成功通知失败", e);
		}

		// 4. 保存回调记录
		saveNotifyRecord(params, "退款成功");
		
		log.info("========== 微信退款回调处理完成 ==========");
		return buildRefundResponse("SUCCESS", "OK");
	}

	/**
	 * 解密微信退款回调的req_info字段
	 * 
	 * @param reqInfo Base64编码的加密数据
	 * @return 解密后的退款数据Map
	 * @throws Exception 解密失败时抛出异常
	 */
	private Map<String, String> decryptRefundNotify(String reqInfo) throws Exception {
		// 1. Base64解码
		byte[] encryptedData = Base64.getDecoder().decode(reqInfo);
		
		// 2. 获取API密钥（需要从配置中获取，这里需要根据实际情况调整）
		// TODO: 从配置或数据库中获取商户API密钥
		// 临时方案：从支付渠道配置中获取
		String apiKey = getApiKeyFromConfig();
		
		// 3. 使用MD5(API密钥)作为AES密钥
		String md5Key = SecureUtil.md5(apiKey).toLowerCase();
		
		// 4. AES-256-ECB解密
		SecretKeySpec keySpec = new SecretKeySpec(md5Key.getBytes(StandardCharsets.UTF_8), "AES");
		Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
		cipher.init(Cipher.DECRYPT_MODE, keySpec);
		byte[] decryptedData = cipher.doFinal(encryptedData);
		
		// 5. 转换为字符串
		String decryptedXml = new String(decryptedData, StandardCharsets.UTF_8);
		log.debug("解密后的XML: {}", decryptedXml);
		
		// 6. 解析XML为Map
		return WxPayKit.xmlToMap(decryptedXml);
	}

	/**
	 * 从配置中获取API密钥
	 * 
	 * @return API密钥
	 */
	private String getApiKeyFromConfig() {
		try {
			// 跳过租户过滤查询渠道配置
			TenantContextHolder.setTenantSkip();
			try {
				// 查询微信支付渠道配置（WEIXIN_MP或WEIXIN_MINI都可以，partnerKey是一样的）
				PayChannel channel = payChannelService.getOne(
					Wrappers.<PayChannel>lambdaQuery()
						.eq(PayChannel::getChannelId, "WEIXIN_MP")
						.last("LIMIT 1")
				);
				
				if (channel == null) {
					// 如果没有WEIXIN_MP，尝试查询WEIXIN_MINI
					channel = payChannelService.getOne(
						Wrappers.<PayChannel>lambdaQuery()
							.eq(PayChannel::getChannelId, "WEIXIN_MINI")
							.last("LIMIT 1")
					);
				}
				
				if (channel != null && StrUtil.isNotBlank(channel.getParam())) {
					JSONObject params = JSONUtil.parseObj(channel.getParam());
					String partnerKey = params.getStr("partnerKey");
					if (StrUtil.isNotBlank(partnerKey)) {
						log.debug("成功获取微信商户API密钥");
						return partnerKey;
					}
				}
				
				log.error("未找到微信支付渠道配置或partnerKey为空");
				return "";
			} finally {
				TenantContextHolder.clear();
			}
		} catch (Exception e) {
			log.error("获取API密钥失败", e);
			return "";
		}
	}

	private String buildRefundResponse(String returnCode, String returnMsg) {
		Map<String, String> xml = new HashMap<>(4);
		xml.put("return_code", returnCode);
		xml.put("return_msg", returnMsg);
		return WxPayKit.toXml(xml);
	}
	
	/**
	 * 安全地将String转换为Long
	 * 用于处理微信回调中的退款单号类型转换
	 * 
	 * @param value 字符串值
	 * @return Long值，转换失败返回null
	 */
	private Long convertToLong(String value) {
		if (StrUtil.isBlank(value)) {
			log.warn("类型转换失败：输入值为空");
			return null;
		}
		try {
			return Long.parseLong(value);
		} catch (NumberFormatException e) {
			log.error("类型转换失败: {} -> Long, 错误: {}", value, e.getMessage());
			return null;
		}
	}
	
	/**
	 * 判断是否需要更新退款状态
	 * 用于避免重复更新和优化性能
	 * 
	 * @param refundOrder 退款订单
	 * @return true-需要更新，false-跳过更新
	 */
	private boolean needsUpdate(PayRefundOrder refundOrder) {
		if (refundOrder == null) {
			log.info("退款订单为空，无需更新");
			return false;
		}
		
		// 如果已经是成功状态，检查更新时间
		if (refundOrder.getStatus() == 1) {
			LocalDateTime refundSuccTime = refundOrder.getRefundSuccTime();
			if (refundSuccTime != null) {
				long secondsDiff = java.time.Duration.between(refundSuccTime, LocalDateTime.now()).getSeconds();
				// 如果是5秒内刚更新的，说明是同步刚完成，跳过
				if (secondsDiff <= 5) {
					log.info("退款刚刚同步成功（{}秒前），跳过异步回调更新, refundOrderId={}", 
						secondsDiff, refundOrder.getRefundOrderId());
					return false;
				}
				log.info("退款订单已成功但时间较早（{}秒前），可能需要补偿更新, refundOrderId={}", 
					secondsDiff, refundOrder.getRefundOrderId());
			}
		} else {
			log.info("退款订单状态未成功（status={}），需要更新, refundOrderId={}", 
				refundOrder.getStatus(), refundOrder.getRefundOrderId());
		}
		
		return true;
	}
	
	/**
	 * 智能判断是否发送保底通知
	 * 用于在Feign调用失败时通过Redis保底机制通知业务系统
	 * 
	 * @param refundOrder 退款订单
	 */
	private void sendFallbackNotification(PayRefundOrder refundOrder) {
		if (refundOrder == null) {
			log.warn("无法发送保底通知：退款订单为空");
			return;
		}
		
		if (StrUtil.isBlank(refundOrder.getParam1())) {
			log.warn("无法发送保底通知：业务退款单号为空, refundOrderId={}", refundOrder.getRefundOrderId());
			return;
		}
		
		String businessRefundNo = refundOrder.getParam1();
		
		// 检查是否需要发送保底通知
		// 策略：如果退款成功时间距离现在超过5秒，说明可能是Feign调用失败的场景
		LocalDateTime refundSuccTime = refundOrder.getRefundSuccTime();
		if (refundSuccTime != null) {
			long secondsDiff = java.time.Duration.between(refundSuccTime, LocalDateTime.now()).getSeconds();
			
			if (secondsDiff > 5) {
				try {
					log.info("【保底通知】检测到可能的Feign调用失败场景（{}秒前退款成功），发送Redis保底通知: {}", 
						secondsDiff, businessRefundNo);
					getStringRedisTemplate().convertAndSend("REFUND_SUCCESS_CHANNEL", businessRefundNo);
					log.info("【保底通知】Redis通知发送成功, businessRefundNo={}", businessRefundNo);
				} catch (Exception e) {
					log.error("【保底通知】Redis通知发送失败, businessRefundNo={}", businessRefundNo, e);
				}
			} else {
				log.info("退款刚刚同步成功（{}秒前），跳过保底通知（Feign应该已成功）, businessRefundNo={}", 
					secondsDiff, businessRefundNo);
			}
		} else {
			log.warn("退款成功时间为空，无法判断是否需要保底通知, refundOrderId={}", refundOrder.getRefundOrderId());
		}
	}

	/**
	 * 保存回调记录
	 * @param result 处理结果
	 * @param params 回调报文
	 */
	@Override
	public void saveNotifyRecord(Map<String, String> params, String result) {
		PayNotifyRecord record = new PayNotifyRecord();
		String notifyId = params.get("transaction_id");
		saveRecord(params, result, record, notifyId, recordService);
	}

}
