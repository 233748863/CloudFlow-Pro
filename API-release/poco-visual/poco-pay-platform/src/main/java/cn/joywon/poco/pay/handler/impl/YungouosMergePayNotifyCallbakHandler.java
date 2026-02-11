package cn.joywon.poco.pay.handler.impl;

import cn.hutool.core.map.MapUtil;
import cn.hutool.core.util.RandomUtil;
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
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * @author poco
 * @date 2021/1/4
 * <p>
 * 聚合支付回调处理
 */
@Slf4j
@AllArgsConstructor
@Service("mergePayCallback")
public class YungouosMergePayNotifyCallbakHandler extends AbstractPayNotifyCallbakHandler {

	private final MessageDuplicateCheckerHandler duplicateCheckerHandler;

	private final PayNotifyRecordService recordService;

	private final PayTradeOrderService tradeOrderService;

	private final PayGoodsOrderService goodsOrderService;

	/**
	 * 初始化执行
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
		if (duplicateCheckerHandler.isDuplicate(params.get(PayConstants.MERGE_OUT_TRADE_NO))) {
			log.info("聚合支付订单重复回调 {} 不做处理", params);
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
		return Boolean.TRUE;
	}

	/**
	 * 解析报文
	 * @param params
	 * @return
	 */
	@Override
	public String parse(Map<String, String> params) {
		String mergeCode = params.get(PayConstants.MERGE_CODE);
		String orderNo = params.get(PayConstants.MERGE_OUT_TRADE_NO);
		PayGoodsOrder goodsOrder = goodsOrderService
			.getOne(Wrappers.<PayGoodsOrder>lambdaQuery().eq(PayGoodsOrder::getPayOrderId, orderNo));
		PayTradeOrder tradeOrder = tradeOrderService
			.getOne(Wrappers.<PayTradeOrder>lambdaQuery().eq(PayTradeOrder::getOrderId, orderNo));

		if (OrderStatusEnum.SUCCESS.getStatus().equals(mergeCode)) {
			goodsOrder.setStatus(OrderStatusEnum.SUCCESS.getStatus());
			tradeOrder.setStatus(OrderStatusEnum.SUCCESS.getStatus());
		}
		else {
			goodsOrder.setStatus(OrderStatusEnum.FAIL.getStatus());
			tradeOrder.setStatus(OrderStatusEnum.FAIL.getStatus());
		}

		goodsOrderService.updateById(goodsOrder);

		tradeOrder.setPaySuccTime(LocalDateTime.now());
		tradeOrder.setChannelOrderNo(params.get("orderNo"));
		// 修改实际的支付渠道
		String payChannel = params.get(PayConstants.MERGE_OUT_TRADE_NO);
		tradeOrder.setChannelId(payChannel);
		tradeOrderService.updateById(tradeOrder);
		return "SUCCESS";
	}

	/**
	 * 保存回调记录
	 * @param params 回调报文
	 * @param result 处理结果
	 */
	@Override
	public void saveNotifyRecord(Map<String, String> params, String result) {
		PayNotifyRecord record = new PayNotifyRecord();
		String notifyId = RandomUtil.randomNumbers(12);
		MapUtil.renameKey(params, PayConstants.MERGE_OUT_TRADE_NO, PayConstants.OUT_TRADE_NO);
		saveRecord(params, result, record, notifyId, recordService);
	}

}
