package com.cloudflow.crm.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.domain.CrmPriceBook;

public interface ICrmPriceBookService extends IService<CrmPriceBook> {

    PageResult<CrmPriceBook> queryPage(CrmPriceBook query, PageQuery pageQuery);

    boolean createPriceBook(CrmPriceBook priceBook);

    boolean updatePriceBook(CrmPriceBook priceBook);
}
