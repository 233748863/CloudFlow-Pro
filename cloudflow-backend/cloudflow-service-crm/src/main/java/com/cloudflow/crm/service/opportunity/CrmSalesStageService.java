package com.cloudflow.crm.service.opportunity;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmSalesStage;
import com.cloudflow.crm.domain.dto.CrmSalesStageRequest;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmSalesStageMapper;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class CrmSalesStageService {
    private final CrmSalesStageMapper stages;

    public List<CrmSalesStage> list() {
        return stages.selectList(new LambdaQueryWrapper<CrmSalesStage>().eq(CrmSalesStage::getDeleted, 0)
                .orderByAsc(CrmSalesStage::getSortNo).orderByAsc(CrmSalesStage::getStageId));
    }

    public List<CrmSalesStage> lockCatalog() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("阶段规则必须在业务事务内核验");
        List<CrmSalesStage> catalog = stages.lockCatalog(CrmRecordSupport.tenantId());
        CrmOpportunityStagePolicy.catalog(catalog);
        return catalog;
    }

    @Audit(name = "保存销售阶段规则")
    @Transactional(rollbackFor = Exception.class)
    public CrmSalesStage save(CrmSalesStageRequest request) {
        CrmRecordSupport.require(request, "阶段配置不能为空");
        CrmRecordSupport.require(stages.lockTenant(CrmRecordSupport.tenantId()), "当前租户不可用");
        List<CrmSalesStage> catalog = new ArrayList<>(stages.lockCatalog(CrmRecordSupport.tenantId()));
        CrmSalesStage persisted = request.stageId() == null ? null : catalog.stream().filter(stage -> Objects.equals(stage.getStageId(), request.stageId()))
                .findFirst().orElseThrow(() -> new CrmBusinessException("阶段不存在或无权访问"));
        CrmSalesStage entity = new CrmSalesStage();
        entity.setStageId(request.stageId()); entity.setVersion(request.version());
        entity.setStageCode(CrmOpportunityStagePolicy.code(request.stageCode()));
        entity.setStageName(CrmRecordSupport.text(request.stageName(), 100, "阶段名称"));
        entity.setSortNo(request.sortNo()); entity.setDefaultWinRate(CrmSalesAmounts.stageRate(request.defaultWinRate()));
        entity.setAllowSkipFlag(CrmRecordSupport.flag(request.allowSkipFlag()));
        entity.setRequiredFields(request.requiredFields() == null ? List.of() : new ArrayList<>(request.requiredFields()));
        entity.setRequiredActivityFlag(CrmRecordSupport.flag(request.requiredActivityFlag())); entity.setOverdueDays(request.overdueDays());
        entity.setIsWonFlag(CrmRecordSupport.flag(request.isWonFlag())); entity.setIsLostFlag(CrmRecordSupport.flag(request.isLostFlag()));
        entity.setStatus(request.status() == null ? "ACTIVE" : request.status());
        if (persisted == null) CrmRecordSupport.create(entity, "stageId");
        else {
            CrmRecordSupport.update(entity, persisted);
            if (!Objects.equals(entity.getStageCode(), persisted.getStageCode()) && stages.referenced(CrmRecordSupport.tenantId(), persisted.getStageCode()) != 0)
                throw new CrmBusinessException("已被商机或阶段历史引用的编码不能修改");
            catalog.remove(persisted);
        }
        catalog.add(entity); CrmOpportunityStagePolicy.catalog(catalog);
        CrmRecordSupport.saved(persisted == null ? stages.insert(entity) : stages.updateById(entity));
        return stages.selectById(entity.getStageId());
    }

    public List<CrmSalesStage> options() {
        return list().stream().filter(stage -> "ACTIVE".equals(stage.getStatus())).sorted(Comparator.comparing(CrmSalesStage::getSortNo)).toList();
    }
}
