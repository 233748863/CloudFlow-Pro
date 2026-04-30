package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.oa.domain.SysSupplier;

/**
 * 供应商 Service。
 */
public interface ISupplierService extends IService<SysSupplier> {

    IPage<SysSupplier> queryPage(SysSupplier query, int pageNum, int pageSize);

    boolean createSupplier(SysSupplier supplier);

    boolean updateSupplier(SysSupplier supplier);
}
