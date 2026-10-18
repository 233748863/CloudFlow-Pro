package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmCampaignRequest;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.email.CrmEmailAccessService;
import com.cloudflow.crm.service.email.CrmEmailAudienceService;
import com.cloudflow.crm.service.email.CrmEmailStatisticsService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.BeanWrapperImpl;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class CrmCampaignService {
    private final CrmCampaignMapper mapper;
    private final CrmCampaignTargetListMapper relations;
    private final CrmLeadMapper leads;
    private final CrmOpportunityMapper opportunities;
    private final CrmTargetListService lists;
    private final CrmEmailAudienceService mailAudience;
    private final CrmEmailAccessService mailAccess;
    private final CrmReferenceService references;
    private final CrmCampaignRevenueService revenues;
    private final CrmEmailStatisticsService mailStatistics;
    private final CrmMassEmailMapper mailTasks;

    public PageResult<CrmCampaign> page(CrmCampaign query, PageQuery page) {
        return PageResult.build(mapper.selectPageByDataScope(page.build(), query, DataScopeUtils.listScope("scope_dept_id", "owner_id")));
    }
    public CrmCampaign accessible(Long id) {
        return CrmRecordSupport.require(mapper.selectAccessible(id, DataScopeUtils.listScope("scope_dept_id", "owner_id")), "营销活动不存在或无权访问");
    }
    public Map<String, Object> detail(Long id) { return Map.of("campaign", accessible(id), "targetLists", linked(id)); }
    private List<CrmCampaignTargetList> linked(Long id) {
        return relations.selectList(new LambdaQueryWrapper<CrmCampaignTargetList>().eq(CrmCampaignTargetList::getCampaignId, id)
                .eq(CrmCampaignTargetList::getDeleted, 0).orderByAsc(CrmCampaignTargetList::getListId));
    }

    @Audit(name = "维护CRM营销活动", diff = true)
    @Transactional(rollbackFor = Exception.class)
    public CrmCampaign save(CrmCampaignRequest request) {
        CrmCampaign campaign = CrmRecordSupport.require(request.getCampaign(), "营销活动不能为空");
        CrmCampaign previous = null;
        if (campaign.getCampaignId() == null) CrmRecordSupport.create(campaign, "campaignId");
        else { accessible(campaign.getCampaignId()); previous = mapper.lockById(campaign.getCampaignId()); assertWritable(previous); CrmRecordSupport.update(campaign, previous); }
        campaign.setCampaignCode(campaign.getCampaignCode() == null || campaign.getCampaignCode().isBlank() ? Localize.nextNo("YX") : CrmRecordSupport.text(campaign.getCampaignCode(), 50, "活动编码"));
        campaign.setCampaignName(CrmRecordSupport.text(campaign.getCampaignName(), 120, "活动名称"));
        campaign.setCampaignType(CrmRecordSupport.code(campaign.getCampaignType(), "EVENT", Set.of("EMAIL", "EVENT", "WEBINAR", "EXHIBITION", "OTHER"), "营销活动类型"));
        campaign.setStatus(CrmRecordSupport.code(campaign.getStatus(), "PLANNING", Set.of("PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"), "营销活动状态"));
        if (previous != null && Set.of("COMPLETED", "CANCELLED").contains(previous.getStatus()) && !previous.getStatus().equals(campaign.getStatus())) throw new CrmBusinessException("已结束活动不能重新打开");
        CrmRecordSupport.require(campaign.getStartDate(), "活动开始日期不能为空"); CrmRecordSupport.require(campaign.getEndDate(), "活动结束日期不能为空");
        if (campaign.getEndDate().isBefore(campaign.getStartDate())) throw new CrmBusinessException("活动结束日期不能早于开始日期");
        campaign.setBudget(CrmRecordSupport.money(campaign.getBudget(), "预算")); campaign.setActualCost(CrmRecordSupport.money(campaign.getActualCost(), "实际成本"));
        Long ownerId = campaign.getOwnerId() == null ? previous == null ? UserContext.getUserId() : previous.getOwnerId() : campaign.getOwnerId();
        if (!Objects.equals(ownerId, previous == null ? UserContext.getUserId() : previous.getOwnerId()) && !StpUtil.hasPermission("crm:campaign:assign")) throw new CrmBusinessException("无权调整营销负责人");
        campaign.setOwnerId(CrmRecordSupport.require(ownerId, "营销负责人不能为空"));
        campaign.setOwnerName(Objects.equals(ownerId, UserContext.getUserId()) ? CrmRecordSupport.userName() : references.user(ownerId).getEmployeeName());
        BeanWrapper target = new BeanWrapperImpl(campaign);
        BeanWrapper original = previous == null ? null : new BeanWrapperImpl(previous);
        for (String field : List.of("sentCount", "deliveredCount", "openedCount", "clickedCount", "bouncedCount", "unsubscribedCount", "leadCreatedCount", "opportunityCreatedCount", "wonOpportunityCount")) {
            target.setPropertyValue(field, original == null ? 0 : original.getPropertyValue(field));
        }
        for (String field : List.of("revenue", "openRate", "clickRate", "bounceRate", "unsubscribeRate")) target.setPropertyValue(field, original == null ? BigDecimal.ZERO : original.getPropertyValue(field));
        campaign.setRoi(CrmCampaignRevenueService.roi(campaign.getRevenue(), campaign.getActualCost()));
        if (previous == null) mapper.insert(campaign); else CrmRecordSupport.saved(mapper.updateById(campaign));
        if (request.getTargetLists() != null) {
            if (request.getTargetLists().size() > 100) throw new CrmBusinessException("每次最多关联100份名单");
            Set<Long> seen = new HashSet<>(); relations.deactivateChildren(campaign.getCampaignId());
            for (CrmCampaignTargetList relation : request.getTargetLists()) {
                if (!seen.add(relation.getListId())) throw new CrmBusinessException("同一名单不能重复关联");
                CrmTargetList list = lists.accessible(relation.getListId());
                if (!"ACTIVE".equals(list.getStatus())) throw new CrmBusinessException("不能关联已停用名单");
                relation.setIsExcludingFlag(CrmRecordSupport.flag(relation.getIsExcludingFlag()));
                CrmRecordSupport.create(relation, "relationId"); relation.setCampaignId(campaign.getCampaignId()); relations.upsert(relation);
            }
        }
        return campaign;
    }

    public Map<String, Object> recipients(Long id) {
        accessible(id);
        return mailAudience.collect(id, mailAccess.current()).view();
    }

    public static Map<String, Object> resolveRecipients(Map<String, CrmTargetListMember> included,
            Map<String, CrmTargetListMember> excluded, List<CrmTargetListMember> allVisible) {
        return CrmEmailAudienceService.select(included, excluded, allVisible, Set.of()).view();
    }

    public CrmCampaign recalculate(Long id) {
        CrmCampaign campaign = accessible(id); assertWritable(campaign); mailStatistics.refreshCampaign(id); return revenues.recalculate(id);
    }

    @Audit(name = "删除CRM营销活动", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long id) {
        accessible(id); assertWritable(mapper.lockById(id));
        if (mailTasks.selectCount(new LambdaQueryWrapper<CrmMassEmail>().eq(CrmMassEmail::getCampaignId, id).eq(CrmMassEmail::getDeleted, 0)) > 0) {
            throw new CrmBusinessException("活动已有邮件任务，请保留投递与退订记录并取消活动");
        }
        if (leads.selectCount(new LambdaQueryWrapper<CrmLead>().eq(CrmLead::getCampaignId, id).eq(CrmLead::getDeleted, 0)) > 0
                || opportunities.selectCount(new LambdaQueryWrapper<CrmOpportunity>().eq(CrmOpportunity::getCampaignId, id).eq(CrmOpportunity::getDeleted, 0)) > 0) throw new CrmBusinessException("活动已有来源记录，须保留归因链路，请取消活动");
        relations.deactivateChildren(id); CrmRecordSupport.saved(mapper.deleteById(id));
    }

    public void assertWritable(CrmCampaign campaign) {
        CrmRecordSupport.require(campaign, "营销活动不存在");
        if (!Objects.equals(campaign.getOwnerId(), UserContext.getUserId()) && !StpUtil.hasPermission("crm:campaign:assign")) throw new CrmBusinessException("只有营销负责人或管理员可修改");
    }
}
