package com.cloudflow.crm.domain.dto;

import com.cloudflow.crm.domain.CrmTargetList;
import com.cloudflow.crm.domain.CrmTargetListMember;
import lombok.Data;
import java.util.List;

@Data
public class CrmTargetListRequest {
    private CrmTargetList list;
    private CrmAudienceCondition condition;
    private List<CrmTargetListMember> members;
}
