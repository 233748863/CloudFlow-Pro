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
import cn.joywon.poco.merchant.OrderModule.dto.OrderPageQueryDTO;
import cn.joywon.poco.merchant.OrderModule.entity.Order;
import cn.joywon.poco.merchant.OrderModule.vo.OrderDetailVO;
import cn.joywon.poco.merchant.OrderModule.vo.OrderListVO;
import cn.joywon.poco.merchant.ReportModule.dto.*;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 订单主表
 *
 * @author poco
 * @date 2025-11-02
 */
@Mapper
public interface OrderMapper extends PocoBaseMapper<Order> {


    /**
     * 分页查询订单列表
     *
     * @param page    分页参数
     * @param q       查询参数
     * @param dataScope 数据权限范围（演示：支持按 store_id / merchant_id 过滤）
     * @return 订单列表分页数据
     */
    IPage<OrderListVO> getOrderListPageByDTO(Page page,
                                             @Param("q") OrderPageQueryDTO q,
                                             @Param("dataScope") DataScope dataScope);

    /**
     * 统计订单列表
     *
     * @param q       查询参数
     * @param dataScope 数据权限范围（演示：支持按 store_id / merchant_id 过滤）
     * @return 订单列表统计数据
     */
    Long countOrderListByDTO(@Param("q") OrderPageQueryDTO q,
                             @Param("dataScope") DataScope dataScope);


    /**
     * 根据ID查询订单详情
     *
     * @param orderId 订单ID
     * @return 订单详情
     */
    OrderDetailVO getOrderDetailById(@Param("orderId") Long orderId, @Param("dataScope") DataScope dataScope);

    /**
     * 根据订单号查询订单
     *
     * @param orderNo 订单号
     * @return 订单信息
     */
    Order getOrderByOrderNo(@Param("orderNo") String orderNo);

    /**
     * 批量更新订单状态
     *
     * @param orderIds 订单ID列表
     * @param status   新状态
     * @param updateBy 更新人
     * @return 更新行数
     */
    int batchUpdateOrderStatus(@Param("orderIds") List<Long> orderIds, 
                              @Param("status") String status, 
                              @Param("updateBy") Long updateBy);

    // ==================== 报表聚合查询方法 ====================

    /**
     * 聚合门店经营日报数据
     * 按门店分组统计订单数、GMV、实付金额、退款等指标
     *
     * @param statDate 统计日期
     * @return 门店经营日报聚合结果列表
     */
    List<StoreDailyStatsAggDTO> aggregateStoreDailyStats(@Param("statDate") LocalDate statDate);

    /**
     * 聚合商品销售日报数据
     * 按SKU分组统计销售数量和销售金额
     *
     * @param statDate 统计日期
     * @return 商品销售日报聚合结果列表
     */
    List<GoodsSalesAggDTO> aggregateGoodsSalesDaily(@Param("statDate") LocalDate statDate);

    /**
     * 聚合分类销售汇总数据
     * 按商品分类分组统计销售数量和销售金额
     *
     * @param statDate 统计日期
     * @return 分类销售汇总聚合结果列表
     */
    List<CategorySalesAggDTO> aggregateCategorySalesSummary(@Param("statDate") LocalDate statDate);

    /**
     * 聚合时段销售趋势数据
     * 按小时分组统计订单数、销售额、客单价
     *
     * @param statDate 统计日期
     * @return 时段销售趋势聚合结果列表
     */
    List<HourlySalesAggDTO> aggregateHourlySales(@Param("statDate") LocalDate statDate);

    /**
     * 聚合用户消费分析数据
     * 统计新用户、活跃用户、消费金额分布
     *
     * @param statDate 统计日期
     * @return 用户消费分析聚合结果列表
     */
    List<UserConsumptionAggDTO> aggregateUserConsumption(@Param("statDate") LocalDate statDate);
}
