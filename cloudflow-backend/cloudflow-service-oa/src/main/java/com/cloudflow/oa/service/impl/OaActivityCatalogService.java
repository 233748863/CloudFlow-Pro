package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.oa.domain.OaActivityType;
import com.cloudflow.oa.domain.OaActivityCost;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.OaActivityTypeMapper;
import com.cloudflow.oa.mapper.OaActivityCostMapper;
import com.cloudflow.oa.mapper.OaIdentityReferenceMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaActivityCatalogService {
    private final OaActivityTypeMapper types;
    private final OaActivityCostMapper costs;
    private final OaIdentityReferenceMapper identities;
    private final OaProjectAuditService audit;

    public List<OaActivityType> types() {
        return types.selectList(new LambdaQueryWrapper<OaActivityType>().eq(OaActivityType::getTenantId, OaRecordSupport.tenantId())
                .eq(OaActivityType::getDeleted, 0).orderByAsc(OaActivityType::getSortNo, OaActivityType::getTypeId));
    }

    public OaActivityType requireType(Long id) {
        OaActivityType type = OaRecordSupport.active(types.selectById(id));
        if (!"ACTIVE".equals(type.getStatus())) throw new IllegalArgumentException("活动类型已停用");
        return type;
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存工时活动类型", spel = "#type")
    public Long saveType(OaActivityType type) {
        type.setTypeCode(OaRecordSupport.text(type.getTypeCode(), 50, "活动编码"));
        type.setTypeName(OaRecordSupport.text(type.getTypeName(), 100, "活动名称"));
        type.setBillableDefaultFlag(OaRecordSupport.flag(type.getBillableDefaultFlag()));
        type.setSortNo(type.getSortNo() == null ? 0 : type.getSortNo());
        type.setStatus(OaRecordSupport.code(type.getStatus(), "ACTIVE", Set.of("ACTIVE", "DISABLED")));
        if (type.getTypeId() == null) { OaRecordSupport.create(type, "typeId"); OaRecordSupport.saved(types.insert(type)); }
        else {
            OaActivityType previous = OaRecordSupport.active(types.selectForUpdate(type.getTypeId(), OaRecordSupport.tenantId()));
            OaRecordSupport.update(type, previous); OaRecordSupport.saved(types.updateById(type));
        }
        return type.getTypeId();
    }

    public List<OaActivityCost> costs(Long typeId) {
        return costs.selectList(new LambdaQueryWrapper<OaActivityCost>().eq(OaActivityCost::getTenantId, OaRecordSupport.tenantId())
                .eq(OaActivityCost::getDeleted, 0).eq(typeId != null, OaActivityCost::getActivityTypeId, typeId)
                .orderByDesc(OaActivityCost::getEffectiveStart));
    }

    @Transactional(rollbackFor = Exception.class)
    public Long saveCost(OaActivityCost cost) {
        OaRecordSupport.active(types.selectForUpdate(cost.getActivityTypeId(), OaRecordSupport.tenantId()));
        cost.setEmployeeId(cost.getEmployeeId() == null ? 0L : cost.getEmployeeId());
        cost.setJobLevelId(cost.getJobLevelId() == null ? 0L : cost.getJobLevelId());
        if (cost.getEmployeeId() < 0 || cost.getJobLevelId() < 0 || cost.getEmployeeId() > 0 && cost.getJobLevelId() > 0) throw new IllegalArgumentException("单价范围只能选择员工、职级或默认其中一项");
        if (cost.getEmployeeId() > 0) OaRecordSupport.require(identities.employee(cost.getEmployeeId(), OaRecordSupport.tenantId()), "员工不存在或无权访问");
        if (cost.getJobLevelId() > 0) OaRecordSupport.require(identities.jobLevel(cost.getJobLevelId(), OaRecordSupport.tenantId()), "职级不存在或无权访问");
        cost.setCostingRate(OaRecordSupport.decimal(cost.getCostingRate(), 12, 2, false, "成本单价"));
        cost.setBillingRate(OaRecordSupport.decimal(cost.getBillingRate(), 12, 2, false, "计费单价"));
        cost.setCurrency(OaRecordSupport.code(cost.getCurrency(), "CNY", Set.of("CNY")));
        OaRecordSupport.require(cost.getEffectiveStart(), "生效开始日不能为空");
        if (cost.getEffectiveEnd() != null && cost.getEffectiveEnd().isBefore(cost.getEffectiveStart())) throw new IllegalArgumentException("生效结束日早于开始日");
        cost.setStatus(OaRecordSupport.code(cost.getStatus(), "ACTIVE", Set.of("ACTIVE", "DISABLED")));
        if ("ACTIVE".equals(cost.getStatus())) {
            for (OaActivityCost existing : costs(cost.getActivityTypeId())) {
                if (Objects.equals(existing.getCostId(), cost.getCostId()) || !"ACTIVE".equals(existing.getStatus())
                        || !existing.getEmployeeId().equals(cost.getEmployeeId()) || !existing.getJobLevelId().equals(cost.getJobLevelId())) continue;
                if ((existing.getEffectiveEnd() == null || !existing.getEffectiveEnd().isBefore(cost.getEffectiveStart()))
                        && (cost.getEffectiveEnd() == null || !cost.getEffectiveEnd().isBefore(existing.getEffectiveStart()))) throw new IllegalArgumentException("同一范围的单价有效期不能重叠");
            }
        }
        OaProjectAuditService.Snapshot before;
        if (cost.getCostId() == null) {
            before = audit.absentCost();
            OaRecordSupport.create(cost, "costId"); OaRecordSupport.saved(costs.insert(cost));
        }
        else {
            OaActivityCost previous = OaRecordSupport.active(costs.selectForUpdate(cost.getCostId(), OaRecordSupport.tenantId()));
            OaRecordSupport.same(previous.getActivityTypeId(), cost.getActivityTypeId(), "单价不能更换活动类型");
            before = audit.cost(previous);
            OaRecordSupport.update(cost, previous); OaRecordSupport.saved(costs.updateById(cost));
        }
        audit.record(OaProjectAuditService.Action.COST_CONFIGURED, before, audit.cost(cost), java.util.Map.of(), null);
        return cost.getCostId();
    }

    public void lockTypes(java.util.Collection<Long> ids) {
        for (Long id : ids.stream().distinct().sorted().toList()) OaRecordSupport.active(types.selectForUpdate(id, OaRecordSupport.tenantId()));
    }

    public OaActivityCost resolve(Long activityTypeId, OaIdentityReference employee, LocalDate date, boolean required) {
        OaRecordSupport.active(types.selectForUpdate(activityTypeId, OaRecordSupport.tenantId()));
        OaActivityCost selected = costs(activityTypeId).stream().filter(item -> "ACTIVE".equals(item.getStatus())
                && !item.getEffectiveStart().isAfter(date) && (item.getEffectiveEnd() == null || !item.getEffectiveEnd().isBefore(date))
                && (item.getEmployeeId().equals(employee.getId()) || item.getEmployeeId() == 0
                && (item.getJobLevelId() == 0 || item.getJobLevelId().equals(employee.getJobLevelId()))))
                .max(Comparator.comparingInt(item -> item.getEmployeeId() > 0 ? 3 : item.getJobLevelId() > 0 ? 2 : 1)).orElse(null);
        if (required && selected == null) throw new IllegalArgumentException("工作日期未匹配到有效单价，请联系管理者配置");
        return selected;
    }
}
