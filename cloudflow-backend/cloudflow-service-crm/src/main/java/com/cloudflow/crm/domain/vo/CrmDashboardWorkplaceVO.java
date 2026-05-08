package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class CrmDashboardWorkplaceVO {
    private List<CrmWorkspaceTodoItemVO> todos = new ArrayList<>();
    private List<CrmWorkspaceRiskItemVO> risks = new ArrayList<>();
    private List<CrmWorkspaceActivityItemVO> activities = new ArrayList<>();
}
