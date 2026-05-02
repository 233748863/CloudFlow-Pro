package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.BizPaymentRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

/**
 * 付款申请Mapper接口
 */
@Mapper
public interface BizPaymentRequestMapper extends BaseMapper<BizPaymentRequest> {

    IPage<BizPaymentRequest> selectPageByDataScope(Page<BizPaymentRequest> page,
                                                   @Param("status") String status,
                                                   @Param("paymentType") String paymentType,
                                                   @Param("userId") Long userId,
                                                   @Param("dataScope") DataScope dataScope);

    List<BizPaymentRequest> selectListByDataScope(@Param("status") String status,
                                                  @Param("paymentType") String paymentType,
                                                  @Param("userId") Long userId,
                                                  @Param("dataScope") DataScope dataScope);

    /**
     * 获取今日付款单号最大序号
     */
    @Select("SELECT MAX(CAST(SUBSTRING(payment_no, 11) AS UNSIGNED)) FROM biz_payment_request " +
            "WHERE payment_no LIKE CONCAT('FK', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();

    /**
     * 按部门统计月度付款费用
     */
    List<Map<String, Object>> selectMonthlyPaymentByDept(@Param("month") String month);
}
