package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.OaSupplierCategory;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.cloudflow.oa.mapper.OaSupplierCategoryMapper;
import com.cloudflow.oa.service.ISupplierService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class SupplierServiceImpl extends ServiceImpl<SysSupplierMapper, SysSupplier> implements ISupplierService {
    private final OaSupplierCategoryMapper categoryMapper;
    private static final Set<String> DERIVED = Set.of("score","standing","indicatorColor","lastScoreTime","qualificationExpireDate","blacklistFlag","blacklistReason","blacklistBy","blacklistTime","bypassFlag","bypassReason","bypassBy","bypassExpireDate","instanceId");
    private static final Set<String> PRIVATE_FIELDS = Set.of("address", "contactPhone", "contactEmail", "bankAccount");

    @Override
    public IPage<SysSupplier> queryPage(SysSupplier query, int pageNum, int pageSize) {
        return page(new Page<>(Math.max(1,pageNum),Math.max(1,Math.min(100,pageSize))), new LambdaQueryWrapper<SysSupplier>()
                .eq(SysSupplier::getTenantId,OaRecordSupport.tenantId()).eq(SysSupplier::getDeleted,0)
                .like(StringUtils.hasText(query.getSupplierName()),SysSupplier::getSupplierName,query.getSupplierName())
                .eq(StringUtils.hasText(query.getStatus()),SysSupplier::getStatus,query.getStatus())
                .eq(StringUtils.hasText(query.getStanding()),SysSupplier::getStanding,query.getStanding())
                .eq(query.getCategoryId()!=null,SysSupplier::getCategoryId,query.getCategoryId())
                .eq(query.getBlacklistFlag()!=null,SysSupplier::getBlacklistFlag,query.getBlacklistFlag()).orderByDesc(SysSupplier::getCreateTime,SysSupplier::getSupplierId));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name="创建供应商",spel="#supplier")
    public boolean createSupplier(SysSupplier supplier) {
        validate(supplier); OaRecordSupport.create(supplier,"supplierId");
        BeanWrapperImpl target = new BeanWrapperImpl(supplier);
        for (String field : DERIVED) target.setPropertyValue(field,null);
        supplier.setBlacklistFlag(0); supplier.setBypassFlag(0);
        OaRecordSupport.saved(baseMapper.insert(supplier)); return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name="更新供应商",spel="#supplier",oldVal="@supplierServiceImpl.getById(#supplier.supplierId)")
    public boolean updateSupplier(SysSupplier supplier) {
        OaRecordSupport.require(supplier.getSupplierId(),"供应商ID不能为空");
        SysSupplier previous = OaRecordSupport.active(baseMapper.selectForUpdate(supplier.getSupplierId(),OaRecordSupport.tenantId()));
        validate(supplier); OaRecordSupport.update(supplier,previous);
        BeanWrapperImpl target = new BeanWrapperImpl(supplier), original = new BeanWrapperImpl(previous);
        for (String field : PRIVATE_FIELDS) {
            String storedValue = (String) original.getPropertyValue(field);
            String submittedValue = (String) target.getPropertyValue(field);
            if (StringUtils.hasText(storedValue) && SensitiveUtils.maskByFieldName(field, storedValue).equals(submittedValue)) {
                target.setPropertyValue(field, storedValue);
            }
        }
        for (String field : DERIVED) target.setPropertyValue(field,original.getPropertyValue(field));
        OaRecordSupport.saved(baseMapper.updateById(supplier)); return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    @Audit(name="删除供应商",highRisk=true,spel="#ids")
    public void removeSuppliers(List<Long> ids) {
        for (Long id : ids) {
            SysSupplier supplier = OaRecordSupport.active(baseMapper.selectForUpdate(id,OaRecordSupport.tenantId()));
            if (baseMapper.countReferences(id,OaRecordSupport.tenantId()) > 0) throw new IllegalArgumentException("供应商仍被业务单据引用，请改为停用");
            OaRecordSupport.touch(supplier);
            OaRecordSupport.saved(baseMapper.update(null, new LambdaUpdateWrapper<SysSupplier>()
                    .eq(SysSupplier::getSupplierId, id).eq(SysSupplier::getTenantId, OaRecordSupport.tenantId())
                    .eq(SysSupplier::getDeleted, 0).eq(SysSupplier::getVersion, supplier.getVersion())
                    .set(SysSupplier::getDeleted, 1).set(SysSupplier::getVersion, supplier.getVersion() + 1)
                    .set(SysSupplier::getUpdateBy, supplier.getUpdateBy()).set(SysSupplier::getUpdateTime, supplier.getUpdateTime())));
        }
    }

    private void validate(SysSupplier supplier) {
        supplier.setSupplierName(OaRecordSupport.text(supplier.getSupplierName(),100,"供应商名称"));
        supplier.setStatus(OaRecordSupport.code(supplier.getStatus(),"ACTIVE",Set.of("ACTIVE","DISABLED")));
        supplier.setSupplierCode(StringUtils.hasText(supplier.getSupplierCode()) ? OaRecordSupport.text(supplier.getSupplierCode(),50,"供应商编号") : null);
        supplier.setCreditCode(StringUtils.hasText(supplier.getCreditCode()) ? OaRecordSupport.text(supplier.getCreditCode(),18,"统一社会信用代码").toUpperCase(Locale.ROOT) : null);
        if (supplier.getCreditCode()!=null && !supplier.getCreditCode().matches("[A-Z0-9]{18}")) throw new IllegalArgumentException("统一社会信用代码应为18位字母数字");
        if (supplier.getCategoryId()!=null) {
            OaSupplierCategory category = OaRecordSupport.active(categoryMapper.selectById(supplier.getCategoryId()));
            if (!"ACTIVE".equals(category.getStatus())) throw new IllegalArgumentException("供应商分类已停用");
        }
        if (supplier.getRegisterCapital()!=null) supplier.setRegisterCapital(OaRecordSupport.decimal(supplier.getRegisterCapital(),14,2,false,"注册资本"));
        if (supplier.getTaxRate()!=null) {
            supplier.setTaxRate(OaRecordSupport.decimal(supplier.getTaxRate(),6,4,false,"税率"));
            if (supplier.getTaxRate().compareTo(BigDecimal.ONE)>0) throw new IllegalArgumentException("税率不能超过1");
        }
        supplier.setCurrency(OaRecordSupport.text(supplier.getCurrency()==null?"CNY":supplier.getCurrency(),10,"币种"));
        supplier.setPreventPurchaseFlag(OaRecordSupport.flag(supplier.getPreventPurchaseFlag())); supplier.setPreventRfqFlag(OaRecordSupport.flag(supplier.getPreventRfqFlag()));
        if (supplier.getSupplierType()!=null) supplier.setSupplierType(OaRecordSupport.code(supplier.getSupplierType(),null,Set.of("MANUFACTURER","DEALER","SERVICE","INDIVIDUAL")));
    }
}
