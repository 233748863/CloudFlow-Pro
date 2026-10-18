package com.cloudflow.crm.service.impl;

import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.domain.CrmSlaPriority;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.*;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrmSlaPriorityCatalog {
    public static final Set<String> CODES = Set.of("P1", "P2", "P3", "P4");
    private final SysDictHelper dictHelper;

    public List<CrmSlaPriority> defaults() {
        Map<String, CrmSlaPriority> tiers = new LinkedHashMap<>();
        tiers.put("P1", tier("P1", "严重", 60, 240, 1));
        tiers.put("P2", tier("P2", "高", 240, 480, 2));
        tiers.put("P3", tier("P3", "中", 480, 1440, 3));
        tiers.put("P4", tier("P4", "低", 1440, 4320, 4));
        try {
            List<SysDictHelper.DictItem> items = dictHelper.getDictData("crm_sla_priority_tier");
            if (items != null) for (SysDictHelper.DictItem item : items) {
                if (!CODES.contains(item.getValue())) continue;
                try {
                    int response = Integer.parseInt(item.getListClass());
                    int resolution = Integer.parseInt(item.getCssClass());
                    if (response > 0 && resolution > 0) tiers.put(item.getValue(), tier(item.getValue(), item.getLabel(),
                            response, resolution, Integer.parseInt(item.getValue().substring(1))));
                } catch (RuntimeException invalid) {
                    log.warn("SLA分档字典项无效，使用内置值：{}", item.getValue());
                }
            }
        } catch (RuntimeException unavailable) {
            log.warn("SLA分档字典不可用，使用内置P1-P4分档", unavailable);
        }
        return new ArrayList<>(tiers.values());
    }

    public CrmSlaPriority fallback(String code) {
        return defaults().stream().filter(tier -> tier.getPriorityCode().equals(code)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("工单优先级只能是P1/P2/P3/P4"));
    }

    private CrmSlaPriority tier(String code, String name, int response, int resolution, int sort) {
        CrmSlaPriority tier = new CrmSlaPriority();
        tier.setPriorityCode(code); tier.setPriorityName(name);
        tier.setFirstResponseMinutes(response); tier.setResolutionMinutes(resolution); tier.setSortNo(sort);
        return tier;
    }
}
