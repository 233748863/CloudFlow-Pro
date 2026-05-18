package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmPriceBook;
import com.cloudflow.crm.mapper.CrmPriceBookMapper;
import com.cloudflow.crm.service.ICrmPriceBookService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class CrmPriceBookServiceImpl extends CrmServiceSupport<CrmPriceBookMapper, CrmPriceBook>
        implements ICrmPriceBookService {

    @Override
    public PageResult<CrmPriceBook> queryPage(CrmPriceBook query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmPriceBook> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmPriceBook::getDeleted, CrmConstants.DelFlag.NORMAL).orderByDesc(CrmPriceBook::getUpdateTime);
        likeIfPresent(wrapper, CrmPriceBook::getPriceBookName, query.getPriceBookName());
        likeIfPresent(wrapper, CrmPriceBook::getPriceBookNo, query.getPriceBookNo());
        eqIfPresent(wrapper, CrmPriceBook::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createPriceBook(CrmPriceBook priceBook) {
        validate(priceBook);
        if (!StringUtils.hasText(priceBook.getPriceBookNo())) {
            priceBook.setPriceBookNo(Localize.nextNo(CrmConstants.NoPrefix.PRICE_BOOK));
        }
        if (priceBook.getOwnerId() == null) {
            priceBook.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(priceBook.getOwnerName())) {
            priceBook.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(priceBook, currentTenantId(), currentUserName(), now());
        return save(priceBook);
    }

    @Override
    public boolean updatePriceBook(CrmPriceBook priceBook) {
        if (priceBook == null || priceBook.getPriceBookId() == null) {
            throw new IllegalArgumentException("价目表ID不能为空");
        }
        validate(priceBook);
        CrmPriceBook persisted = requireById(priceBook.getPriceBookId(), "价目表不存在");
        priceBook.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(priceBook.getPriceBookNo())) {
            priceBook.setPriceBookNo(persisted.getPriceBookNo());
        }
        if (priceBook.getOwnerId() == null) {
            priceBook.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(priceBook.getOwnerName())) {
            priceBook.setOwnerName(persisted.getOwnerName());
        }
        priceBook.setUpdateBy(currentUserName());
        priceBook.setUpdateTime(now());
        return updateById(priceBook);
    }

    private void validate(CrmPriceBook priceBook) {
        if (priceBook == null) {
            throw new IllegalArgumentException("价目表不能为空");
        }
        if (!StringUtils.hasText(priceBook.getPriceBookName())) {
            throw new IllegalArgumentException("价目表名称不能为空");
        }
        if (!StringUtils.hasText(priceBook.getCurrency())) {
            priceBook.setCurrency("CNY");
        }
        if (!StringUtils.hasText(priceBook.getStatus())) {
            priceBook.setStatus(CrmConstants.PriceBookStatus.ACTIVE);
        }
    }
}
