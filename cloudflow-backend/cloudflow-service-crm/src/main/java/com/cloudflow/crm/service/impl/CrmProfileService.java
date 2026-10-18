package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.CrmTerritory;
import com.cloudflow.crm.mapper.CrmCampaignMapper;
import com.cloudflow.crm.mapper.CrmTerritoryMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmProfileService {
    private final CrmTerritoryMapper territories;
    private final CrmCampaignMapper campaigns;
    private final SysDictHelper dictionaries;

    public void validate(Long territoryId, String marketSegment, String employeeScale, BigDecimal annualRevenue, Long campaignId) {
        if (territoryId != null) {
            CrmTerritory territory = CrmRecordSupport.require(territories.selectById(territoryId), "区域不存在");
            if (!"ACTIVE".equals(territory.getStatus())) throw new CrmBusinessException("区域已停用");
        }
        dictionary("crm_market_segment", marketSegment, Set.of("SMB", "MID_MARKET", "ENTERPRISE", "GOVERNMENT"));
        dictionary("crm_employee_scale", employeeScale, Set.of("1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"));
        if (annualRevenue != null) CrmRecordSupport.money(annualRevenue, "年营收");
        if (campaignId != null) CrmRecordSupport.require(campaigns.selectById(campaignId), "来源营销活动不存在");
    }

    private void dictionary(String type, String value, Set<String> defaults) {
        if (value == null || value.isBlank()) return;
        List<SysDictHelper.DictItem> entries = dictionaries.getDictData(type);
        if (entries.isEmpty() ? !defaults.contains(value) : entries.stream().noneMatch(item -> value.equals(item.getValue()))) {
            throw new CrmBusinessException("客户画像字典取值无效：" + type);
        }
    }

    public static void mapLeadToCustomer(CrmLead lead, CrmCustomer customer) {
        customer.setTerritoryId(lead.getTerritoryId()); customer.setMarketSegment(lead.getMarketSegment());
        customer.setIndustry(lead.getIndustry()); customer.setEmployeeScale(lead.getEmployeeScale());
        customer.setAnnualRevenue(lead.getAnnualRevenue()); customer.setSource(lead.getSource());
        customer.setCampaignId(lead.getCampaignId()); customer.setUnsubscribeFlag(lead.getUnsubscribeFlag());
    }
}
