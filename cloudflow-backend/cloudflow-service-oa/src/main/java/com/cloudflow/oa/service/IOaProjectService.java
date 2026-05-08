package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaProject;
import com.cloudflow.oa.domain.OaProjectDependency;
import com.cloudflow.oa.domain.OaProjectMember;
import com.cloudflow.oa.domain.OaProjectMilestone;
import com.cloudflow.oa.domain.OaProjectRisk;
import com.cloudflow.oa.domain.WorkTask;
import com.cloudflow.oa.domain.dto.ProjectWbsTreeNodeDTO;
import com.cloudflow.oa.domain.vo.ProjectCostSummaryVO;
import com.cloudflow.oa.domain.vo.ProjectDetailVO;

import java.util.List;

public interface IOaProjectService extends IService<OaProject> {

    PageResult<OaProject> queryPage(OaProject query, PageQuery pageQuery);

    Long createProject(OaProject project);

    boolean updateProject(OaProject project);

    boolean submitProject(Long projectId);

    ProjectDetailVO getProjectDetail(Long projectId);

    List<OaProjectMember> listMembers(Long projectId);

    List<OaProjectMilestone> listMilestones(Long projectId);

    List<WorkTask> listWbsTasks(Long projectId);

    List<OaProjectDependency> listDependencies(Long projectId);

    List<OaProjectRisk> listRisks(Long projectId);

    ProjectCostSummaryVO getCostSummary(Long projectId);

    boolean addMember(OaProjectMember member);

    boolean updateMember(OaProjectMember member);

    boolean removeMembers(List<Long> ids);

    boolean addMilestone(OaProjectMilestone milestone);

    boolean updateMilestone(OaProjectMilestone milestone);

    boolean removeMilestones(List<Long> ids);

    boolean addRisk(OaProjectRisk risk);

    boolean updateRisk(OaProjectRisk risk);

    boolean removeRisks(List<Long> ids);

    boolean addWbsTask(WorkTask task);

    boolean updateWbsTask(WorkTask task);

    boolean updateWbsTree(Long projectId, List<ProjectWbsTreeNodeDTO> nodes);

    boolean removeWbsTasks(List<Long> ids);

    boolean addDependency(OaProjectDependency dependency);

    boolean updateDependency(OaProjectDependency dependency);

    boolean removeDependencies(List<Long> ids);

    boolean snapshotBaseline(Long projectId);

    boolean archiveProject(Long projectId);
}
