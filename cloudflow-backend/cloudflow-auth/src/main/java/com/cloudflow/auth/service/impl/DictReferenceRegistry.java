package com.cloudflow.auth.service.impl;

import com.cloudflow.common.statemachine.annotation.DictBound;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.TreeMap;

@Component
public class DictReferenceRegistry implements SmartInitializingSingleton {

    private static final Map<String, String> MANUAL_PROTECTED_DICT_TYPES = new LinkedHashMap<>();
    private static final Map<String, List<DictReferenceBinding>> MANUAL_BINDINGS = new LinkedHashMap<>();

    private final Map<String, String> protectedDictTypes = new TreeMap<>();
    private final Map<String, List<DictReferenceBinding>> bindingsByDictType = new TreeMap<>();
    private final Set<String> annotatedDictTypes = new TreeSet<>();

    static {
        MANUAL_PROTECTED_DICT_TYPES.put("crm_lead_status", "CrmLeadStatus");
        MANUAL_PROTECTED_DICT_TYPES.put("expense_claim_status", "ExpenseClaimStatus");
        MANUAL_PROTECTED_DICT_TYPES.put("purchase_request_status", "PurchaseRequestStatus");
        MANUAL_PROTECTED_DICT_TYPES.put("business_trip_status", "BusinessTripStatus");
        MANUAL_PROTECTED_DICT_TYPES.put("benefit_request_status", "BenefitRequestStatus");
        MANUAL_PROTECTED_DICT_TYPES.put("sys_yes_no", "系统通用是否字典");
        MANUAL_PROTECTED_DICT_TYPES.put("sys_normal_disable", "系统启停状态字典");

        addBinding("crm_lead_status", "CrmLeadStatus", "crm_lead", "status", "线索状态");
        addBinding("expense_claim_status", "ExpenseClaimStatus", "biz_expense_claim", "status", "报销单状态");
        addBinding("purchase_request_status", "PurchaseRequestStatus", "biz_purchase_request", "status", "采购申请状态");
        addBinding("business_trip_status", "BusinessTripStatus", "biz_business_trip", "status", "出差申请状态");
        addBinding("benefit_request_status", "BenefitRequestStatus", "hr_benefit_request", "status", "福利申请状态");

        addBinding("sys_yes_no", "系统通用是否字典", "sys_config", "config_type", "系统参数内置标记");
        addBinding("sys_yes_no", "系统通用是否字典", "sys_dict_data", "is_default", "字典默认标记");

        addBinding("sys_normal_disable", "系统启停状态字典", "sys_user", "status", "用户状态");
        addBinding("sys_normal_disable", "系统启停状态字典", "sys_role", "status", "角色状态");
        addBinding("sys_normal_disable", "系统启停状态字典", "sys_dept", "status", "部门状态");
        addBinding("sys_normal_disable", "系统启停状态字典", "sys_post", "status", "岗位状态");
        addBinding("sys_normal_disable", "系统启停状态字典", "sys_tenant", "status", "租户状态");
        addBinding("sys_normal_disable", "系统启停状态字典", "sys_menu", "status", "菜单状态");
    }

    @Override
    public void afterSingletonsInstantiated() {
        protectedDictTypes.clear();
        bindingsByDictType.clear();
        annotatedDictTypes.clear();

        protectedDictTypes.putAll(MANUAL_PROTECTED_DICT_TYPES);
        MANUAL_BINDINGS.forEach((dictType, bindings) ->
                bindingsByDictType.put(dictType, new ArrayList<>(bindings)));

        registerAnnotatedType("com.cloudflow.crm.enums.CrmLeadStatus");
        registerAnnotatedType("com.cloudflow.hr.enums.BenefitRequestStatus");
        registerAnnotatedType("com.cloudflow.oa.enums.ExpenseClaimStatus");
        registerAnnotatedType("com.cloudflow.oa.enums.PurchaseRequestStatus");
        registerAnnotatedType("com.cloudflow.oa.enums.BusinessTripStatus");
    }

    public boolean isProtected(String dictType) {
        return protectedDictTypes.containsKey(dictType);
    }

    public Optional<String> protectedReason(String dictType) {
        return Optional.ofNullable(protectedDictTypes.get(dictType));
    }

    public Set<String> protectedTypes() {
        return protectedDictTypes.keySet();
    }

    public List<DictReferenceBinding> bindings(String dictType) {
        return bindingsByDictType.getOrDefault(dictType, Collections.emptyList());
    }

    public List<ImplicitDictReferenceAlert> implicitOnlyBindings() {
        List<ImplicitDictReferenceAlert> alerts = new ArrayList<>();
        for (Map.Entry<String, List<DictReferenceBinding>> entry : bindingsByDictType.entrySet()) {
            if (annotatedDictTypes.contains(entry.getKey())) {
                continue;
            }
            alerts.add(new ImplicitDictReferenceAlert(
                    entry.getKey(),
                    "implicit SQL reference without @DictBound",
                    new ArrayList<>(entry.getValue())));
        }
        return alerts;
    }

    private void registerAnnotatedType(String className) {
        try {
            Class<?> type = Class.forName(className);
            DictBound dictBound = type.getAnnotation(DictBound.class);
            if (dictBound != null) {
                protectedDictTypes.put(dictBound.value(), type.getSimpleName());
                annotatedDictTypes.add(dictBound.value());
            }
        } catch (ClassNotFoundException ignored) {
            // Optional business module not present on current classpath.
        }
    }

    private static void addBinding(String dictType, String source, String tableName, String columnName, String label) {
        MANUAL_BINDINGS.computeIfAbsent(dictType, ignored -> new ArrayList<>())
                .add(new DictReferenceBinding(dictType, source, tableName, columnName, label));
    }

    public record DictReferenceBinding(
            String dictType,
            String source,
            String tableName,
            String columnName,
            String label
    ) {
        public DictReferenceBinding {
            if (!StringUtils.hasText(dictType) || !StringUtils.hasText(tableName) || !StringUtils.hasText(columnName)) {
                throw new IllegalArgumentException("dict reference binding requires dictType/tableName/columnName");
            }
        }

        public String summary() {
            return label + "(" + tableName + "." + columnName + ")";
        }
    }

    public record ImplicitDictReferenceAlert(
            String dictType,
            String reason,
            List<DictReferenceBinding> bindings
    ) {
        public int bindingCount() {
            return bindings.size();
        }

        public String bindingSummary() {
            return bindings.stream()
                    .map(DictReferenceBinding::summary)
                    .toList()
                    .toString();
        }
    }
}
