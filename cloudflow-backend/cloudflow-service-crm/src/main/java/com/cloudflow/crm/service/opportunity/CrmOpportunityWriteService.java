package com.cloudflow.crm.service.opportunity;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCampaign;
import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.dto.CrmOpportunityLossDTO;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.service.impl.CrmLostAnalysisService;
import com.cloudflow.crm.service.impl.CrmCampaignWonService;
import com.cloudflow.crm.service.impl.CrmProfileService;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import com.cloudflow.crm.service.impl.CrmReferenceService;
import com.cloudflow.crm.service.deal.CrmOpportunityTeamService;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

@Service
@RequiredArgsConstructor
public class CrmOpportunityWriteService {
    private final CrmOpportunityMapper opportunities;
    private final CrmOpportunityAccessService access;
    private final CrmOpportunityStageService stages;
    private final CrmOpportunityItemService items;
    private final CrmReferenceService references;
    private final CrmLostAnalysisService losses;
    private final CrmProfileService profiles;
    private final CrmOpportunityTeamService teams;
    private final CrmCampaignWonService campaignWins;

    public record Owner(Long userId, String name, Long deptId, String deptName) { }

    private record Prepared(CrmOpportunity entity, CrmOpportunityStagePolicy.Transition transition) { }

    @Transactional(rollbackFor = Exception.class)
    public CrmOpportunity previewImport(CrmOpportunity request, Owner owner) {
        CrmRecordSupport.require(request, "商机不能为空");
        if (request.getOpportunityId() == null) {
            CrmOpportunity entity = prepareCreate(request, owner).entity();
            teams.validateDefaultOwner(entity.getOwnerId());
            return entity;
        }
        return prepareUpdate(request, owner).entity();
    }

    @Audit(name = "创建商机及初始阶段")
    @Transactional(rollbackFor = Exception.class)
    public CrmOpportunity create(CrmOpportunity request, Owner owner) {
        Prepared prepared = prepareCreate(request, owner);
        CrmOpportunity entity = prepared.entity();
        CrmRecordSupport.saved(opportunities.insert(entity));
        teams.synchronize(entity);
        CrmRecordSupport.saved(opportunities.initializeTeam(entity));
        stages.record(entity, prepared.transition(), operationKey(entity), null, UserContext.getUserId());
        return entity;
    }

    @Audit(name = "更新商机及阶段")
    @Transactional(rollbackFor = Exception.class)
    public CrmOpportunity update(CrmOpportunity request, Owner owner) {
        Prepared prepared = prepareUpdate(request, owner);
        CrmOpportunity entity = prepared.entity();
        persist(entity, entity.getVersion());
        stages.record(entity, prepared.transition(), operationKey(entity), null, UserContext.getUserId());
        return entity;
    }

    private Prepared prepareCreate(CrmOpportunity request, Owner owner) {
        CrmRecordSupport.require(request, "商机不能为空");
        CrmOpportunity entity = new CrmOpportunity();
        copyWritable(request, entity, owner);
        CrmRecordSupport.create(entity, "opportunityId");
        return new Prepared(entity, stages.prepare(null, entity, CrmOpportunityStagePolicy.Action.CREATE, null));
    }

    private Prepared prepareUpdate(CrmOpportunity request, Owner owner) {
        CrmRecordSupport.require(request, "商机不能为空");
        CrmOpportunity original = access.lock(request.getOpportunityId());
        CrmOpportunityStagePolicy.version(request.getVersion(), original);
        requireOpen(original);
        if (request.getStatus() != null && !Objects.equals(request.getStatus(), original.getStatus()))
            throw new CrmBusinessException("商机关闭须通过审批，赢单须使用赢单操作");
        CrmOpportunity entity = copy(original);
        copyWritable(request, entity, owner);
        items.applyAmount(entity);
        CrmOpportunityStagePolicy.Transition transition = stages.prepare(original, entity, CrmOpportunityStagePolicy.Action.EDIT, null);
        return new Prepared(entity, transition);
    }

    @Audit(name = "推进商机阶段")
    @Transactional(rollbackFor = Exception.class)
    public CrmOpportunity advance(Long id, String target, Integer version) {
        CrmOpportunity original = access.lock(id);
        CrmOpportunityStagePolicy.version(version, original);
        requireOpen(original);
        CrmOpportunity entity = copy(original);
        entity.setStage(CrmOpportunityStagePolicy.code(target));
        CrmOpportunityStagePolicy.Transition transition = stages.prepare(original, entity, CrmOpportunityStagePolicy.Action.ADVANCE, null);
        if (transition.changed()) {
            persist(entity, original.getVersion());
            stages.record(entity, transition, operationKey(entity), null, UserContext.getUserId());
        }
        return entity;
    }

    @Audit(name = "商机赢单及阶段历史")
    @Transactional(rollbackFor = Exception.class, isolation = Isolation.READ_COMMITTED)
    public CrmOpportunity win(Long id, Long competitorId, Integer version) {
        CrmCampaign campaign = campaignWins.lock(access.read(id));
        CrmOpportunity original = access.lock(id);
        CrmOpportunityStagePolicy.version(version, original);
        if (!Objects.equals(campaign == null ? null : campaign.getCampaignId(), original.getCampaignId()))
            throw new CrmBusinessException("商机关联活动已改变，请重新读取后提交");
        if ("WON".equals(original.getStage())) return original;
        requireOpen(original);
        CrmOpportunity entity = copy(original);
        entity.setStage("WON");
        if (competitorId != null) entity.setCompetitorId(competitorId);
        losses.validateCompetitor(entity.getCompetitorId());
        CrmOpportunityStagePolicy.Transition transition = stages.prepare(original, entity, CrmOpportunityStagePolicy.Action.WON, null);
        persist(entity, original.getVersion());
        stages.record(entity, transition, operationKey(entity), null, UserContext.getUserId());
        teams.recordWin(entity);
        campaignWins.refresh(campaign, entity);
        return entity;
    }

    @Audit(name = "审批执行商机降级关闭")
    @Transactional(rollbackFor = Exception.class)
    public CrmOpportunity applyApproved(CrmApproval approval, Integer version, String currentStage, String targetStage,
            String comment, List<CrmOpportunityLossDTO.Reason> reasons) {
        if (approval == null || !"APPROVED".equals(approval.getStatus())
                || !CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE.equals(approval.getBusinessType())
                || !Objects.equals(CrmRecordSupport.tenantId(), approval.getTenantId())) throw new CrmBusinessException("商机审批来源无效");
        CrmOpportunity original = CrmRecordSupport.require(opportunities.lockById(approval.getBusinessRefId()), "审批商机不存在");
        if (!Objects.equals(original.getTenantId(), approval.getTenantId()) || !Integer.valueOf(0).equals(original.getDeleted()))
            throw new CrmBusinessException("审批商机不存在");
        CrmOpportunityStagePolicy.version(version, original);
        if (!Objects.equals(currentStage, original.getStage())) throw new CrmBusinessException("商机阶段已改变，不能覆盖当前状态");
        requireOpen(original);
        CrmOpportunity entity = copy(original);
        entity.setStage(CrmOpportunityStagePolicy.code(targetStage));
        String reason = approvalReason(targetStage, comment, reasons);
        CrmOpportunityStagePolicy.Transition transition = stages.prepare(original, entity, CrmOpportunityStagePolicy.Action.APPROVED_DOWNGRADE, reason);
        if ("LOST".equals(targetStage)) {
            losses.applyApproved(entity, reasons);
            entity.setLostReason(optional(comment, 500, "丢单说明"));
        }
        persist(entity, original.getVersion());
        stages.record(entity, transition, "CRM_APPROVAL:" + approval.getApprovalId(), reason, approval.getApplicantId());
        return entity;
    }

    public static String approvalReason(String targetStage, String comment, List<CrmOpportunityLossDTO.Reason> reasons) {
        if ("LOST".equals(targetStage)) {
            CrmLostAnalysisService.validateShape(reasons);
            if (comment == null || comment.isBlank()) {
                Long primaryId = reasons.stream().filter(reason -> Boolean.TRUE.equals(reason.getIsPrimary())).findFirst().orElseThrow().getReasonId();
                return "丢单审批，主要原因ID：" + primaryId;
            }
        }
        return CrmRecordSupport.text(comment, 500, "阶段调整原因");
    }

    private void copyWritable(CrmOpportunity request, CrmOpportunity entity, Owner owner) {
        CrmRecordSupport.require(owner, "商机负责人缺失");
        if (request.getOwnerId() != null && !Objects.equals(owner.userId(), request.getOwnerId())) throw new CrmBusinessException("商机负责人校验失败");
        CrmCustomer customer = references.customer(request.getCustomerId());
        entity.setCustomerId(customer.getCustomerId()); entity.setCustomerName(customer.getCustomerName());
        entity.setOpportunityName(CrmRecordSupport.text(request.getOpportunityName(), 120, "商机名称"));
        entity.setSource(optional(request.getSource(), 30, "商机来源"));
        entity.setExpectedAmount(CrmSalesAmounts.expected(request.getExpectedAmount()));
        entity.setWinRate(CrmSalesAmounts.winRate(request.getWinRate()));
        entity.setExpectedSignDate(request.getExpectedSignDate()); entity.setRemark(optional(request.getRemark(), 500, "商机备注"));
        if (request.getStage() != null) entity.setStage(CrmOpportunityStagePolicy.code(request.getStage()));
        entity.setOwnerId(CrmRecordSupport.require(owner.userId(), "商机负责人缺失"));
        entity.setOwnerName(CrmRecordSupport.text(owner.name(), 64, "负责人姓名")); entity.setDeptId(owner.deptId());
        entity.setDeptName(optional(owner.deptName(), 64, "负责人部门名称"));
        entity.setContactId(request.getContactId()); entity.setContactName(null);
        if (request.getContactId() != null) {
            CrmContact contact = references.contact(request.getContactId());
            if (!Objects.equals(customer.getCustomerId(), contact.getCustomerId()) || !Objects.equals(CrmRecordSupport.tenantId(), contact.getTenantId())
                    || !Integer.valueOf(0).equals(contact.getDeleted()) || !"ACTIVE".equals(contact.getStatus())) throw new CrmBusinessException("联系人不属于该客户或已停用");
            entity.setContactName(contact.getContactName());
        }
        entity.setCampaignId(request.getCampaignId() == null && entity.getOpportunityId() == null ? customer.getCampaignId() : request.getCampaignId());
        entity.setCompetitorId(request.getCompetitorId());
        losses.validateCompetitor(entity.getCompetitorId()); profiles.validate(null, null, null, null, entity.getCampaignId());
    }

    private void persist(CrmOpportunity entity, Integer expectedVersion) {
        teams.synchronize(entity);
        CrmRecordSupport.touch(entity);
        CrmRecordSupport.saved(opportunities.writeOpportunity(entity, expectedVersion));
        entity.setVersion(Math.addExact(expectedVersion, 1));
    }

    private CrmOpportunity copy(CrmOpportunity original) {
        CrmOpportunity entity = new CrmOpportunity(); BeanUtils.copyProperties(original, entity); return entity;
    }

    private void requireOpen(CrmOpportunity opportunity) {
        if (!"OPEN".equals(opportunity.getStatus()) || "WON".equals(opportunity.getStage()) || "LOST".equals(opportunity.getStage()))
            throw new CrmBusinessException("已结案商机须先通过专用恢复操作，不能直接改写业务或金额");
    }

    private String operationKey(CrmOpportunity opportunity) { return "CRM_OPPORTUNITY:" + opportunity.getOpportunityId() + ":VERSION:" + opportunity.getVersion(); }

    private static String optional(String value, int maximum, String label) {
        if (value == null) return null;
        if (value.length() > maximum) throw new CrmBusinessException(label + "最多" + maximum + "字符");
        return value.trim();
    }
}
