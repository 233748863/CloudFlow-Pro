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

import cn.joywon.poco.common.data.datascope.DataScope;
import cn.joywon.poco.common.data.datascope.PocoBaseMapper;
import cn.joywon.poco.merchant.OrderModule.dto.RefundApplyPageQueryDTO;
import cn.joywon.poco.merchant.OrderModule.entity.OrderRefundApply;
import cn.joywon.poco.merchant.OrderModule.vo.OrderRefundApplyVO;
import cn.joywon.poco.merchant.ReportModule.dto.RefundAnalysisAggDTO;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 订单退款申请表
 *
 * @author poco
 * @date 2025-11-02
 */
@Mapper
public interface OrderRefundApplyMapper extends PocoBaseMapper<OrderRefundApply> {

    /**
     * 根据订单ID查询退款申请列表
     *
     * @param orderId 订单ID
     * @return 退款申请列表
     */
    List<OrderRefundApplyVO> getRefundAppliesByOrderId(@Param("orderId") Long orderId);

    /**
     * 根据退款单号查询退款申请
     *
     * @param refundNo 退款单号
     * @return 退款申请
     */
    OrderRefundApply getRefundApplyByRefundNo(@Param("refundNo") String refundNo);

    /**
     * 更新退款状态
     *
     * @param id           退款申请ID
     * @param status       退款状态
     * @param auditRemark  审核备注
     * @return 更新行数
     */
    int updateRefundStatus(@Param("id") Long id,
                          @Param("status") String status,
                          @Param("auditRemark") String auditRemark);

    /**
     * 分页查询退款申请（商家后台，使用DataScope权限过滤）
     *
     * @param page 分页参数
     * @param query 查询条件
     * @param dataScope 数据权限范围
     * @return 退款申请列表
     */
    IPage<OrderRefundApplyVO> getRefundApplyPage(Page<OrderRefundApplyVO> page,
                                                  @Param("query") RefundApplyPageQueryDTO query,
                                                  @Param("dataScope") DataScope dataScope);

    /**
     * 统计退款申请数量（商家后台，使用DataScope权限过滤）
     *
     * @param query 查询条件
     * @param dataScope 数据权限范围
     * @return 数量
     */
    Long countRefundApply(@Param("query") RefundApplyPageQueryDTO query,
                          @Param("dataScope") DataScope dataScope);

    /**
     * 分页查询退款申请（消费者端，使用DataScope权限过滤）
     *
     * @param page 分页参数
     * @param query 查询条件
     * @param dataScope 数据权限范围
     * @return 退款申请列表
     */
    IPage<OrderRefundApplyVO> getConsumerRefundApplyPage(Page<OrderRefundApplyVO> page,
                                                          @Param("query") RefundApplyPageQueryDTO query,
                                                          @Param("dataScope") DataScope dataScope);

    /**
     * 统计消费者退款申请数量
     *
     * @param query 查询条件
     * @param dataScope 数据权限范围
     * @return 数量
     */
    Long countConsumerRefundApply(@Param("query") RefundApplyPageQueryDTO query,
                                   @Param("dataScope") DataScope dataScope);

    // ==================== 报表聚合查询方法 ====================

    /**
     * 聚合退款分析数据
     * 按退款类型分组统计退款订单数、退款金额、平均处理时长
     *
     * @param statDate 统计日期
     * @return 退款分析聚合结果列表
     */
    List<RefundAnalysisAggDTO> aggregateRefundAnalysis(@Param("statDate") LocalDate statDate);
}