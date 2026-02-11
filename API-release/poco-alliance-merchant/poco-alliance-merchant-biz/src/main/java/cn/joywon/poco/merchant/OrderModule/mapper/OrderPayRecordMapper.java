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

package cn.joywon.poco.merchant.OrderModule.mapper;

import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.OrderModule.entity.OrderPayRecord;
import cn.joywon.poco.merchant.OrderModule.vo.OrderPayRecordVO;
import cn.joywon.poco.merchant.ReportModule.dto.MerchantSettlementAggDTO;
import cn.joywon.poco.merchant.ReportModule.dto.PayChannelReconcileAggDTO;
import cn.joywon.poco.merchant.ReportModule.dto.ReceivableAggDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 订单支付流水表
 *
 * @author poco
 * @date 2025-11-02
 */
@Mapper
public interface OrderPayRecordMapper extends PocoBaseMapper<OrderPayRecord> {

    /**
     * 根据订单ID查询支付流水列表
     *
     * @param orderId 订单ID
     * @return 支付流水列表
     */
    List<OrderPayRecordVO> getPayRecordsByOrderId(@Param("orderId") Long orderId);

    /**
     * 根据第三方支付单号查询支付流水
     *
     * @param thirdPayNo 第三方支付单号
     * @return 支付流水
     */
    OrderPayRecordVO getPayRecordByThirdPayNo(@Param("thirdPayNo") String thirdPayNo);

    /**
     * 更新支付状态
     *
     * @param id        支付流水ID
     * @param status 支付状态
     * @return 更新行数
     */
    int updatePaymentStatus(@Param("id") Long id,
                            @Param("status") String status,
                            @Param("actualAmount") BigDecimal actualAmount,
                            @Param("paymentTime") LocalDateTime paymentTime,
                            @Param("callbackTime") LocalDateTime callbackTime,
                            @Param("callbackData") Map<String, Object> callbackData);

    // ==================== 报表聚合查询方法 ====================

    /**
     * 聚合商家结算日报数据
     * 按商家和支付渠道分组统计收入
     *
     * @param statDate 统计日期
     * @return 商家结算聚合结果列表
     */
    List<MerchantSettlementAggDTO> aggregateMerchantSettlement(@Param("statDate") LocalDate statDate);

    /**
     * 聚合支付渠道对账数据
     * 按支付渠道分组统计交易笔数和金额
     *
     * @param statDate 统计日期
     * @return 支付渠道对账聚合结果列表
     */
    List<PayChannelReconcileAggDTO> aggregatePayChannelReconcile(@Param("statDate") LocalDate statDate);

    /**
     * 聚合应收账款数据
     * 计算待结算金额和账龄分布
     *
     * @param statDate 统计日期
     * @return 应收账款聚合结果列表
     */
    List<ReceivableAggDTO> aggregateReceivable(@Param("statDate") LocalDate statDate);
}