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
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.pay.dto.PayRefundDTO;
import cn.joywon.poco.pay.entity.PayRefundOrder;

/**
 * 退款
 *
 * @author poco
 * @date 2019-05-28 23:58:11
 */
public interface PayRefundOrderService extends IService<PayRefundOrder> {

	/**
	 * 退款操作
	 * @param refundOrder refundOrder
	 * @return true/false
	 */
	Boolean refund(PayRefundOrder refundOrder);

	/**
	 * 根据订单号退款（供Feign调用）
	 * @param refundDTO 退款参数
	 * @return 退款结果
	 */
	R<Boolean> refundByOrderNo(PayRefundDTO refundDTO);

}
