package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 采购申请 Mapper。
 */
@Mapper
public interface BizPurchaseRequestMapper extends BaseMapper<BizPurchaseRequest> {

    /**
     * 查询采购申请详情（含明细）。
     */
    BizPurchaseRequest selectRequestWithItems(@Param("id") Long id);

    /**
     * 获取今日采购单号最大序号。
     */
    @Select("SELECT MAX(CAST(SUBSTRING(purchase_no, 11) AS UNSIGNED)) FROM biz_purchase_request " +
            "WHERE purchase_no LIKE CONCAT('CG', DATE_FORMAT(NOW(), '%Y%m%d'), '%')")
    Integer getTodayMaxSeq();
}
