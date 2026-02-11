package cn.joywon.poco.merchant.ReportModule.service;

import cn.joywon.poco.merchant.ReportModule.dto.ReportQueryDTO;
import cn.joywon.poco.merchant.ReportModule.vo.GoodsSalesTrendVO;
import cn.joywon.poco.merchant.ReportModule.vo.PlatformTrendVO;
import cn.joywon.poco.merchant.ReportModule.vo.StoreTrendVO;
import cn.joywon.poco.merchant.ReportModule.vo.UserConsumptionTrendVO;

import java.util.List;

/**
 * 报表趋势对比服务接口
 * 提供周同比、月同比等趋势数据查询功能
 *
 * @author poco
 * @date 2025-01-06
 */
public interface ReportTrendService {

    /**
     * 获取门店经营趋势数据
     * 包含当日数据、周同比（与上周同日对比）、月同比（与上月同日对比）
     *
     * @param queryDTO 查询条件（含日期范围、门店ID、商家ID）
     * @return 门店经营趋势列表
     */
    List<StoreTrendVO> getStoreDailyTrend(ReportQueryDTO queryDTO);

    /**
     * 获取商品销售趋势数据
     * 包含当期销量、上周销量、变化率
     *
     * @param queryDTO 查询条件（含日期范围、门店ID、商家ID、分类ID）
     * @return 商品销售趋势列表
     */
    List<GoodsSalesTrendVO> getGoodsSalesTrend(ReportQueryDTO queryDTO);

    /**
     * 获取用户消费趋势数据
     * 包含新用户、活跃用户、复购率的周同比和月同比
     *
     * @param queryDTO 查询条件（含日期范围、门店ID、商家ID）
     * @return 用户消费趋势列表
     */
    List<UserConsumptionTrendVO> getUserConsumptionTrend(ReportQueryDTO queryDTO);

    /**
     * 获取平台运营趋势数据（最近30天）
     * 返回GMV、订单数、活跃商家数、活跃用户数的时间序列
     * 仅平台管理员可访问
     *
     * @return 平台运营趋势（含周环比、月环比）
     */
    PlatformTrendVO getPlatformTrend();
}
