package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmProduct;
import com.cloudflow.crm.mapper.CrmProductMapper;
import com.cloudflow.crm.service.ICrmProductService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;

@Service
public class CrmProductServiceImpl extends CrmServiceSupport<CrmProductMapper, CrmProduct>
        implements ICrmProductService {

    @Override
    public PageResult<CrmProduct> queryPage(CrmProduct query, PageQuery pageQuery) {
        LambdaQueryWrapper<CrmProduct> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CrmProduct::getDeleted, CrmConstants.DelFlag.NORMAL).orderByDesc(CrmProduct::getUpdateTime);
        likeIfPresent(wrapper, CrmProduct::getProductName, query.getProductName());
        likeIfPresent(wrapper, CrmProduct::getProductNo, query.getProductNo());
        likeIfPresent(wrapper, CrmProduct::getCategory, query.getCategory());
        eqIfPresent(wrapper, CrmProduct::getStatus, query.getStatus());
        return pageResult(pageQuery, wrapper);
    }

    @Override
    public boolean createProduct(CrmProduct product) {
        validate(product);
        if (!StringUtils.hasText(product.getProductNo())) {
            product.setProductNo(Localize.nextNo(CrmConstants.NoPrefix.PRODUCT));
        }
        if (product.getOwnerId() == null) {
            product.setOwnerId(UserContext.getUserId());
        }
        if (!StringUtils.hasText(product.getOwnerName())) {
            product.setOwnerName(currentUserName());
        }
        Localize.fillCommonAudit(product, currentTenantId(), currentUserName(), now());
        return save(product);
    }

    @Override
    public boolean updateProduct(CrmProduct product) {
        if (product == null || product.getProductId() == null) {
            throw new IllegalArgumentException("产品ID不能为空");
        }
        validate(product);
        CrmProduct persisted = requireById(product.getProductId(), "产品不存在");
        product.setTenantId(persisted.getTenantId());
        if (!StringUtils.hasText(product.getProductNo())) {
            product.setProductNo(persisted.getProductNo());
        }
        if (product.getOwnerId() == null) {
            product.setOwnerId(persisted.getOwnerId());
        }
        if (!StringUtils.hasText(product.getOwnerName())) {
            product.setOwnerName(persisted.getOwnerName());
        }
        product.setUpdateBy(currentUserName());
        product.setUpdateTime(now());
        return updateById(product);
    }

    private void validate(CrmProduct product) {
        if (product == null) {
            throw new IllegalArgumentException("产品不能为空");
        }
        if (!StringUtils.hasText(product.getProductName())) {
            throw new IllegalArgumentException("产品名称不能为空");
        }
        if (product.getStandardPrice() == null) {
            product.setStandardPrice(BigDecimal.ZERO);
        }
        if (!StringUtils.hasText(product.getCurrency())) {
            product.setCurrency("CNY");
        }
        if (!StringUtils.hasText(product.getStatus())) {
            product.setStatus(CrmConstants.ProductStatus.ACTIVE);
        }
    }
}
