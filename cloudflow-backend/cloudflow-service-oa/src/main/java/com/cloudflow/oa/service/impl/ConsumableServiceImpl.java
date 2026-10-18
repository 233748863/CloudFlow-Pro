package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.SysSupplier;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.ConsumableReplenishmentSuggestionDTO;
import com.cloudflow.oa.mapper.SysConsumableMapper;
import com.cloudflow.oa.mapper.SysSupplierMapper;
import com.cloudflow.oa.service.IConsumableService;
import java.util.Collection;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class ConsumableServiceImpl extends ServiceImpl<SysConsumableMapper, SysConsumable> implements IConsumableService {
    private final SysSupplierMapper suppliers;
    private final ConsumableLedgerService ledger;
    private final ConsumableTransactions transactions;

    @Override
    public IPage<SysConsumable> queryPage(SysConsumable query, int pageNum, int pageSize) {
        if (pageNum < 1 || pageSize < 1 || pageSize > 100) throw new IllegalArgumentException("页码从1开始，每页1至100条");
        LambdaQueryWrapper<SysConsumable> wrapper = new LambdaQueryWrapper<SysConsumable>().eq(SysConsumable::getTenantId, OaRecordSupport.tenantId())
                .eq(SysConsumable::getDeleted, 0).orderByDesc(SysConsumable::getConsumableId);
        wrapper.like(StringUtils.hasText(query.getName()), SysConsumable::getName, query.getName());
        wrapper.like(StringUtils.hasText(query.getModel()), SysConsumable::getModel, query.getModel());
        wrapper.eq(query.getCategoryId() != null, SysConsumable::getCategoryId, query.getCategoryId());
        wrapper.eq(StringUtils.hasText(query.getStatus()), SysConsumable::getStatus, query.getStatus());
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<SysConsumable> getLowStockList() { return baseMapper.selectLowStockList(OaRecordSupport.tenantId()); }

    @Override
    public List<ConsumableReplenishmentSuggestionDTO> getReplenishmentSuggestions() {
        return getLowStockList().stream().filter(material -> "ACTIVE".equals(material.getStatus())).map(this::toSuggestion).toList();
    }

    @Override
    @Audit(name = "新增耗材主数据")
    public void createMaterial(ConsumableCommands.MasterData command) {
        transactions.execute(() -> {
            if (command.getConsumableId() != null || command.getVersion() != null || command.getStatus() != null) {
                throw new IllegalArgumentException("新建时不允许指定ID、版本或状态");
            }
            SysConsumable material = new SysConsumable();
            OaRecordSupport.create(material, "consumableId");
            material.setStatus("ACTIVE");
            fill(material, command);
            material.setQuantity(0);
            material.setAvgCost(ConsumableCostCalculator.ZERO);
            material.setStockAmount(ConsumableCostCalculator.ZERO);
            OaRecordSupport.saved(baseMapper.insert(material));
            return null;
        });
    }

    @Override
    @Audit(name = "编辑或停用耗材", highRisk = true)
    public void editMaterial(ConsumableCommands.MasterData command) {
        transactions.execute(() -> {
            SysConsumable material = ledger.lockAll(List.of(OaRecordSupport.require(command.getConsumableId(), "耗材ID不能为空"))).get(command.getConsumableId());
            ConsumableOperationSupport.version(command.getVersion(), material.getVersion());
            if (!Objects.equals(material.getUnit(), command.getUnit()) && baseMapper.referenceCount(material.getTenantId(), material.getConsumableId()) > 0) {
                throw new IllegalArgumentException("单位已有台账、采购或领用引用，不能修改");
            }
            fill(material, command);
            OaRecordSupport.touch(material);
            OaRecordSupport.saved(baseMapper.updateMaster(material));
            if (material.getQuantity() > material.getLowStockThreshold()) baseMapper.closeRecoveredRisks(material.getTenantId(), material.getConsumableId());
            return null;
        });
    }

    @Override
    @Audit(name = "删除无业务引用耗材", highRisk = true)
    public void deleteMaterials(List<Long> ids) {
        transactions.execute(() -> {
            Collection<SysConsumable> materials = ledger.lockAll(ids).values();
            for (SysConsumable material : materials) {
                if (material.getQuantity() != 0 || material.getStockAmount().signum() != 0 || !canDelete(material.getConsumableId())) {
                    throw new IllegalArgumentException("耗材有库存或采购、台账、领用引用，请改为停用");
                }
            }
            for (SysConsumable material : materials) {
                OaRecordSupport.touch(material);
                OaRecordSupport.saved(baseMapper.softDelete(material));
            }
            return null;
        });
    }

    @Override
    @Audit(name = "检查耗材删除条件", highRisk = true)
    public boolean canDelete(Long id) { return baseMapper.referenceCount(OaRecordSupport.tenantId(), id) == 0; }

    private void fill(SysConsumable material, ConsumableCommands.MasterData command) {
        material.setName(OaRecordSupport.text(command.getName(), 100, "耗材名称"));
        material.setModel(ConsumableOperationSupport.optional(command.getModel(), 100, "规格型号"));
        material.setUnit(OaRecordSupport.text(command.getUnit(), 20, "计量单位"));
        material.setBrand(ConsumableOperationSupport.optional(command.getBrand(), 100, "品牌"));
        material.setStorageLocation(ConsumableOperationSupport.optional(command.getStorageLocation(), 100, "存放说明"));
        material.setLowStockThreshold(nonnegative(command.getLowStockThreshold(), 10));
        material.setTargetStock(nonnegative(command.getTargetStock(), 0));
        material.setMaxStock(command.getMaxStock() == null ? null : nonnegative(command.getMaxStock(), 0));
        material.setWarnEnabled(command.getWarnEnabled() == null ? 1 : OaRecordSupport.flag(command.getWarnEnabled()));
        material.setStatus(OaRecordSupport.code(command.getStatus(), material.getStatus(), Set.of("ACTIVE", "INACTIVE")));
        if (command.getCategoryId() != null && baseMapper.categoryExists(OaRecordSupport.tenantId(), command.getCategoryId()) != 1) {
            throw new IllegalArgumentException("耗材分类不存在或已停用");
        }
        material.setCategoryId(command.getCategoryId());
        if (command.getDefaultSupplierId() != null) {
            SysSupplier supplier = OaRecordSupport.active(suppliers.selectById(command.getDefaultSupplierId()));
            if (!"ACTIVE".equals(supplier.getStatus())) throw new IllegalArgumentException("默认供应商已停用");
        }
        material.setDefaultSupplierId(command.getDefaultSupplierId());
    }

    private int nonnegative(Integer value, int fallback) {
        if (value == null) return fallback;
        if (value < 0) throw new IllegalArgumentException("库存阈值和目标必须为非负整数");
        return value;
    }

    private ConsumableReplenishmentSuggestionDTO toSuggestion(SysConsumable material) {
        ConsumableReplenishmentSuggestionDTO result = new ConsumableReplenishmentSuggestionDTO();
        result.setConsumableId(material.getConsumableId());
        result.setName(material.getName());
        result.setModel(material.getModel());
        result.setUnit(material.getUnit());
        result.setQuantity(material.getQuantity());
        result.setLowStockThreshold(material.getLowStockThreshold());
        result.setTargetStock(material.getTargetStock());
        result.setSuggestedQuantity(Math.max(material.getTargetStock() - material.getQuantity(), 0));
        if (material.getDefaultSupplierId() != null) {
            SysSupplier supplier = suppliers.selectById(material.getDefaultSupplierId());
            if (supplier != null && Objects.equals(supplier.getTenantId(), OaRecordSupport.tenantId())
                    && Integer.valueOf(0).equals(supplier.getDeleted()) && "ACTIVE".equals(supplier.getStatus())) {
                result.setDefaultSupplierId(supplier.getSupplierId());
                result.setDefaultSupplierName(supplier.getSupplierName());
            }
        }
        return result;
    }
}
