package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.hr.domain.dto.HrHRequests.*;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.domain.vo.attendance.HrHViews.*;
import com.cloudflow.hr.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import static com.cloudflow.hr.service.HrHException.*;
import static com.cloudflow.hr.service.HrRuleSupport.*;

@Service
@RequiredArgsConstructor
public class HrOvertimeTypeService {
    private final HrOvertimeTypeMapper mapper;
    private final HrOvertimeRequestMapper requests;
    private final HrCompComponentMapper components;
    private final HrLeaveTypeMapper leaveTypes;
    private final HrHSupport helper;
    private final HrRuleSupport support;

    public List<OvertimeTypeVO> list() {
        helper.permission("hr:overtime-type:list");
        return all().stream().map(this::view).toList();
    }

    public OvertimeTypeVO detail(Long id) { helper.permission("hr:overtime-type:list"); return view(get(id)); }

    public HrOvertimeType get(Long id) {
        HrOvertimeType type = id == null ? null : mapper.selectById(id);
        if (type == null || !Objects.equals(type.getTenantId(), tenantId()) || flag(type.getDeleted())) throw conflict("OVERTIME_TYPE_MISSING", "加班类型未配置");
        return type;
    }

    public List<HrOvertimeType> all() {
        return mapper.selectList(new LambdaQueryWrapper<HrOvertimeType>().eq(HrOvertimeType::getTenantId, tenantId())
                .eq(HrOvertimeType::getDeleted, 0).orderByAsc(HrOvertimeType::getTypeId));
    }

    public HrOvertimeType match(String dayType) {
        List<HrOvertimeType> types = all().stream().filter(type -> dayType.equals(type.getApplicableDayType())).toList();
        if (types.size() != 1) throw conflict("OVERTIME_TYPE_MISSING", "日历日期没有唯一加班类型配置");
        HrOvertimeType type = types.get(0);
        if (!flag(type.getStatus())) throw conflict("OVERTIME_TYPE_DISABLED", "加班类型尚未核定启用");
        validateEnabled(type);
        return type;
    }

    public OvertimeTypeVO save(Long id, OvertimeTypeDTO input) {
        helper.permission(id == null ? "hr:overtime-type:add" : "hr:overtime-type:edit"); helper.validate(input);
        return support.locked("attendance-config", () -> {
            HrOvertimeType type = id == null ? new HrOvertimeType() : get(id);
            if (id != null) {
                HrHSupport.version(input.getVersion(), type.getVersion());
                if ((!type.getTypeCode().equals(input.getTypeCode().trim()) || !type.getApplicableDayType().equals(input.getApplicableDayType()))
                        && requests.selectCount(new LambdaQueryWrapper<HrOvertimeRequest>().eq(HrOvertimeRequest::getTenantId, tenantId()).eq(HrOvertimeRequest::getOvertimeTypeId, id)) > 0) {
                    throw conflict("OVERTIME_TYPE_REFERENCED", "已引用类型不能更换编码或日类型");
                }
            }
            BeanUtils.copyProperties(input, type, "version");
            type.setTypeCode(HrHSupport.text(input.getTypeCode(), 50)); type.setTypeName(HrHSupport.text(input.getTypeName(), 100));
            type.setRemark(input.getRemark() == null ? null : input.getRemark().trim());
            if (id == null) {
                type.setTenantId(tenantId()); type.setDeleted(0); type.setVersion(0); type.setStatus(0);
                type.setCreateBy(userName()); type.setCreateTime(HrHSupport.now());
            }
            type.setUpdateBy(userName()); type.setUpdateTime(HrHSupport.now());
            if (flag(type.getStatus())) validateEnabled(type);
            long duplicates = all().stream().filter(other -> !Objects.equals(id, other.getTypeId()))
                    .filter(other -> other.getTypeCode().equals(type.getTypeCode()) || other.getApplicableDayType().equals(type.getApplicableDayType())).count();
            if (duplicates > 0) throw conflict("OVERTIME_TYPE_DUPLICATE", "加班编码或日类型已存在");
            if (id == null) mapper.insert(type); else if (mapper.updateById(type) != 1) throw conflict("VERSION_CONFLICT", "加班类型已变化");
            support.audit("HR_OVERTIME_TYPE", type.getTypeId(), id == null ? "CREATE" : "UPDATE", Map.of("typeId", type.getTypeId(), "version", type.getVersion(), "status", type.getStatus()));
            return view(type);
        });
    }

    @Audit(name = "启停加班类型", spel = "#id", highRisk = true)
    public OvertimeTypeVO changeStatus(Long id, OvertimeTypeStatusDTO input) {
        helper.permission("hr:overtime-type:edit"); helper.validate(input);
        return support.locked("attendance-config", () -> {
            HrOvertimeType type = get(id); HrHSupport.version(input.getVersion(), type.getVersion());
            if (flag(input.getStatus())) validateEnabled(type);
            type.setStatus(input.getStatus()); type.setUpdateBy(userName()); type.setUpdateTime(HrHSupport.now());
            if (mapper.updateById(type) != 1) throw conflict("VERSION_CONFLICT", "加班类型已变化");
            support.audit("HR_OVERTIME_TYPE", id, "STATUS", Map.of("typeId", id, "version", type.getVersion(), "status", type.getStatus()));
            return view(type);
        });
    }

    public void validateEnabled(HrOvertimeType type) {
        if (!Integer.valueOf(1).equals(type.getNeedApprovalFlag()) || type.getMaxHoursPerDay() == null || type.getMaxHoursPerMonth() == null
                || type.getMaxHoursPerDay().signum() <= 0 || type.getMaxHoursPerMonth().signum() <= 0
                || type.getMaxHoursPerDay().compareTo(type.getMaxHoursPerMonth()) > 0) throw conflict("OVERTIME_POLICY_MISSING", "日月上限及强制审批须先核定");
        component(type.getSalaryComponentId());
        if (type.getRateMultiplier() == null || type.getRateMultiplier().signum() <= 0) throw conflict("OVERTIME_RATE_MISSING", "加班费倍率尚未核定");
        if (flag(type.getCompensatoryFlag())) {
            leaveType(type.getCompensatoryLeaveTypeId());
            if (type.getCompensatoryRatio() == null || type.getCompensatoryRatio().signum() <= 0) throw conflict("COMPENSATORY_RATIO_MISSING", "调休比例尚未核定");
        }
        for (HrOvertimeType other : all()) {
            if (flag(other.getStatus()) && !Objects.equals(other.getTypeId(), type.getTypeId())
                    && (other.getMaxHoursPerDay() == null || other.getMaxHoursPerMonth() == null
                    || type.getMaxHoursPerDay().compareTo(other.getMaxHoursPerDay()) != 0 || type.getMaxHoursPerMonth().compareTo(other.getMaxHoursPerMonth()) != 0)) {
                throw conflict("OVERTIME_LIMIT_CONFLICT", "所有启用类型须使用相同的员工日月总上限");
            }
        }
    }

    public HrCompComponent component(Long id) {
        HrCompComponent component = id == null ? null : components.selectById(id);
        if (component == null || !Objects.equals(component.getTenantId(), tenantId()) || !flag(component.getStatus())
                || !"OVERTIME".equals(component.getComponentCode()) || !"VARIABLE".equals(component.getComponentType()) || !flag(component.getTaxable())) throw conflict("OVERTIME_COMPONENT_INVALID", "须配置启用且计税的OVERTIME变动薪资项目");
        return component;
    }

    public HrLeaveType leaveType(Long id) {
        HrLeaveType type = id == null ? null : leaveTypes.selectById(id);
        if (type == null || !Objects.equals(type.getTenantId(), tenantId()) || !flag(type.getStatus()) || !flag(type.getCompensatoryFlag())
                || !flag(type.getNeedQuota()) || !"HOUR".equals(type.getUnit())) throw conflict("COMPENSATORY_TYPE_INVALID", "调休假种须启用、按小时管理额度并允许调休转入");
        if (type.getQuotaRule() != null && type.getQuotaRule().hasNonNull("expiryDays")) throw conflict("COMPENSATORY_EXPIRY_UNSUPPORTED", "逐笔到期规则尚未实现，须明确采用已实现的周期结转规则");
        return type;
    }

    public List<String> modes(HrOvertimeType type) { return flag(type.getCompensatoryFlag()) ? List.of("PAY", "COMPENSATORY") : List.of("PAY"); }
    private OvertimeTypeVO view(HrOvertimeType type) { return helper.view(type, new OvertimeTypeVO()); }
}
