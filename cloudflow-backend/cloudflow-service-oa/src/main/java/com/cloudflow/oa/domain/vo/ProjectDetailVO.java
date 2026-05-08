package com.cloudflow.oa.domain.vo;

import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectDependency;
import com.cloudflow.oa.domain.OaProjectMember;
import com.cloudflow.oa.domain.OaProjectMilestone;
import com.cloudflow.oa.domain.OaProjectRisk;
import com.cloudflow.oa.domain.WorkTask;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class ProjectDetailVO {

    private OaProject project;
    private List<OaProjectMember> members = new ArrayList<>();
    private List<OaProjectMilestone> milestones = new ArrayList<>();
    private List<WorkTask> wbsTasks = new ArrayList<>();
    private List<OaProjectDependency> dependencies = new ArrayList<>();
    private List<OaProjectRisk> risks = new ArrayList<>();
    private ProjectCostSummaryVO costSummary;
    private ProjectKpiVO kpi;
    private ProjectLinkSummaryVO linkSummary;
    private Integer baselineVersion;
}
