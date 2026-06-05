package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.oa.domain.BizPurchaseRequest;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 采购申请 Mapper。
 */
@Mapper
public interface BizPurchaseRequestMapper extends BaseMapper<BizPurchaseRequest> {

    IPage<BizPurchaseRequest> selectPageByDataScope(Page<BizPurchaseRequest> page,
                                                    @Param("status") String status,
                                                    @Param("supplierId") Long supplierId,
                                                    @Param("userId") Long userId,
                                                    @Param("dataScope") DataScope dataScope);

    List<BizPurchaseRequest> selectListByDataScope(@Param("status") String status,
                                                   @Param("supplierId") Long supplierId,
                                                   @Param("userId") Long userId,
                                                   @Param("dataScope") DataScope dataScope);

    /**
     * 查询采购申请详情（含明细）。
     */
    BizPurchaseRequest selectRequestWithItems(@Param("id") Long id);

    /**
     * 获取今日采购单号最大序号。
     */
    Integer getTodayMaxSeq();
}
