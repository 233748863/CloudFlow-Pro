package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.cloudflow.oa.service.ISupplierService;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

/**
 * 供应商 Service 实现。
 */
@Service
public class SupplierServiceImpl extends ServiceImpl<SysSupplierMapper, SysSupplier> implements ISupplierService {

    @Override
    public IPage<SysSupplier> queryPage(SysSupplier query, int pageNum, int pageSize) {
        LambdaQueryWrapper<SysSupplier> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysSupplier::getDelFlag, "0")
                .like(StringUtils.hasText(query.getSupplierName()), SysSupplier::getSupplierName, query.getSupplierName())
                .eq(StringUtils.hasText(query.getStatus()), SysSupplier::getStatus, query.getStatus())
                .orderByDesc(SysSupplier::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    @Audit(name = "创建供应商", spel = "#supplier")
    public boolean createSupplier(SysSupplier supplier) {
        validateSupplier(supplier);
        LocalDateTime now = LocalDateTime.now();
        supplier.setTenantId(UserContext.getTenantId());
        supplier.setStatus(StringUtils.hasText(supplier.getStatus()) ? supplier.getStatus() : "ACTIVE");
        supplier.setDelFlag("0");
        supplier.setCreateBy(UserContext.getUserName());
        supplier.setCreateTime(now);
        supplier.setUpdateBy(UserContext.getUserName());
        supplier.setUpdateTime(now);
        return save(supplier);
    }

    @Override
    @Audit(name = "更新供应商", spel = "#supplier", oldVal = "@supplierServiceImpl.getById(#supplier.supplierId)")
    public boolean updateSupplier(SysSupplier supplier) {
        if (supplier == null || supplier.getSupplierId() == null) {
            throw new IllegalArgumentException("供应商ID不能为空");
        }
        validateSupplier(supplier);
        supplier.setUpdateBy(UserContext.getUserName());
        supplier.setUpdateTime(LocalDateTime.now());
        return updateById(supplier);
    }

    private void validateSupplier(SysSupplier supplier) {
        if (supplier == null) {
            throw new IllegalArgumentException("供应商不能为空");
        }
        if (!StringUtils.hasText(supplier.getSupplierName())) {
            throw new IllegalArgumentException("供应商名称不能为空");
        }
    }
}
