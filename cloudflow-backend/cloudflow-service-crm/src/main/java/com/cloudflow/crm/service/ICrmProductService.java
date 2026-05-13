package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmProduct;

public interface ICrmProductService extends IService<CrmProduct> {

    PageResult<CrmProduct> queryPage(CrmProduct query, PageQuery pageQuery);

    boolean createProduct(CrmProduct product);

    boolean updateProduct(CrmProduct product);
}
