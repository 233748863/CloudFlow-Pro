package com.cloudflow.crm.domain.dto;

import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmCampaignTargetList;
import lombok.Data;
import java.util.List;

@Data
public class CrmCampaignRequest {
    private CrmCampaign campaign;
    private List<CrmCampaignTargetList> targetLists;
}
