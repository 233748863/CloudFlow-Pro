package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.RfqSaveDTO;
import com.cloudflow.oa.domain.dto.RfqInviteDTO;
import com.cloudflow.oa.domain.vo.OaIdentityReference;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.IOaTraceEventService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class OaRfqService {
    private final OaPurchaseRfqMapper rfqs;
    private final OaPurchaseRfqItemMapper items;
    private final OaPurchaseRfqSupplierMapper invitations;
    private final SysSupplierMapper suppliers;
    private final SysConsumableMapper consumables;
    private final OaProjectMapper projects;
    private final OaIdentityReferenceMapper identities;
    private final BizPurchaseRequestMapper purchases;
    private final BizPurchaseItemMapper purchaseItems;
    private final OaSupplierGovernanceService governance;
    private final OaRfqAccessService access;
    private final OaBusinessRuleService rules;
    private final OaReminderService reminders;
    private final SysConfigHelper config;
    private final IOaTraceEventService trace;
    private final OaRfqPurchaseSourceService purchaseSource;
    private final OaRfqInvitationService invitationService;
    private final OaPrivateFileStorageService privateFiles;
    private final OaRfqAuditService audit;

    public PageResult<OaPurchaseRfq> page(String title, String status, PageQuery page) {
        return PageResult.build(rfqs.selectPage(page.build(), new LambdaQueryWrapper<OaPurchaseRfq>().eq(OaPurchaseRfq::getTenantId, OaRecordSupport.tenantId())
                .eq(OaPurchaseRfq::getDeleted, 0).like(title != null && !title.isBlank(), OaPurchaseRfq::getTitle, title)
                .eq(status != null && !status.isBlank(), OaPurchaseRfq::getStatus, status).orderByDesc(OaPurchaseRfq::getRfqId)));
    }

    public RfqSaveDTO detail(Long id) {
        RfqSaveDTO result = new RfqSaveDTO(); result.setRfq(OaRecordSupport.active(rfqs.selectById(id))); result.setItems(items(id)); return result;
    }

    public List<OaPurchaseRfqItem> items(Long id) {
        OaRecordSupport.active(rfqs.selectById(id));
        return items.selectList(new LambdaQueryWrapper<OaPurchaseRfqItem>().eq(OaPurchaseRfqItem::getTenantId, OaRecordSupport.tenantId()).eq(OaPurchaseRfqItem::getRfqId, id)
                .eq(OaPurchaseRfqItem::getDeleted, 0).orderByAsc(OaPurchaseRfqItem::getSortNo, OaPurchaseRfqItem::getItemId));
    }

    public List<OaPurchaseRfqSupplier> invitations(Long id) {
        OaRecordSupport.active(rfqs.selectById(id));
        return invitations.selectList(new LambdaQueryWrapper<OaPurchaseRfqSupplier>().eq(OaPurchaseRfqSupplier::getTenantId, OaRecordSupport.tenantId()).eq(OaPurchaseRfqSupplier::getRfqId, id).orderByAsc(OaPurchaseRfqSupplier::getRfqSupplierId));
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Long save(RfqSaveDTO request) {
        OaPurchaseRfq rfq = OaRecordSupport.require(request.getRfq(), "询价单不能为空");
        OaPurchaseRfq previous = rfq.getRfqId() == null ? null : OaRecordSupport.active(rfqs.selectForUpdate(rfq.getRfqId(), OaRecordSupport.tenantId()));
        OaRfqAuditService.Snapshot before = previous == null ? audit.absent()
                : audit.snapshot(previous, Map.of("rfq", previous, "items", items(previous.getRfqId())));
        if (previous != null) {
            access.assertOwner(previous); if (!"DRAFT".equals(previous.getStatus())) throw new IllegalArgumentException("发出后的询价内容不能修改，请新建询价轮次");
            invitationService.assertEditable(previous.getRfqId());
            OaRecordSupport.update(rfq, previous); rfq.setRfqNo(previous.getRfqNo()); rfq.setOwnerId(previous.getOwnerId()); rfq.setOwnerName(previous.getOwnerName());
            OaRecordSupport.same(previous.getPurchaseRequestId(), rfq.getPurchaseRequestId(), "询价来源不能更换");
        } else {
            OaRecordSupport.create(rfq, "rfqId"); rfq.setRfqNo("XJ" + UUID.randomUUID().toString().replace("-", ""));
            OaIdentityReference owner = OaRecordSupport.require(identities.user(UserContext.getUserId(), OaRecordSupport.tenantId()), "采购负责人账号无效"); rfq.setOwnerId(owner.getId()); rfq.setOwnerName(owner.getName());
        }
        rfq.setTitle(OaRecordSupport.text(rfq.getTitle(), 200, "询价标题"));
        if (rfq.getAttachmentUrl() != null && !rfq.getAttachmentUrl().isBlank()) {
            OaRfqEmailContent.fileId(rfq.getAttachmentUrl());
            if (previous == null || !Objects.equals(previous.getAttachmentUrl(), rfq.getAttachmentUrl())) {
                privateFiles.assertOwned(OaPrivateFileStorageService.Kind.RFQ_INVITATION, rfq.getAttachmentUrl(), UserContext.getUserId());
            }
        } else rfq.setAttachmentUrl(null);
        if (OaRecordSupport.require(rfq.getQuoteDeadline(), "报价截止日期不能为空").isBefore(LocalDate.now())) throw new IllegalArgumentException("报价截止日期不能早于今天");
        if (rfq.getExpectedDeliveryDate() != null && rfq.getExpectedDeliveryDate().isBefore(rfq.getQuoteDeadline())) throw new IllegalArgumentException("期望交付日期不能早于报价截止日期");
        if (rfq.getDeptId() == null) rfq.setDeptId(UserContext.getDeptId());
        if (rfq.getDeptId() != null) rfq.setDeptName(OaRecordSupport.require(identities.department(rfq.getDeptId(), OaRecordSupport.tenantId()), "需求部门不存在").getName());
        if (rfq.getProjectId() != null) rfq.setProjectName(OaRecordSupport.active(projects.selectById(rfq.getProjectId())).getProjectName()); else rfq.setProjectName(null);
        if (rfq.getPurchaseRequestId() != null) {
            BizPurchaseRequest purchase = OaRecordSupport.active(purchases.selectForUpdate(rfq.getPurchaseRequestId(), OaRecordSupport.tenantId()));
            DataScopeUtils.assertOwnership(purchase, BizPurchaseRequest::getUserId, "采购申请");
            if (!"DRAFT".equals(purchase.getStatus()) || purchase.getRfqId() != null) throw new IllegalArgumentException("仅未关联询价的草稿采购申请可发起询价");
            if (purchaseSource.activeSources(purchase.getId()).stream().anyMatch(source -> !Objects.equals(source.getRfqId(), rfq.getRfqId()))) throw new IllegalArgumentException("该采购申请已有有效询价，请继续原询价轮次");
        }
        rfq.setStatus("DRAFT"); rfq.setInvitedCount(0); rfq.setRespondedCount(0); rfq.setInstanceId(null);
        rfq.setAwardedSupplierId(null); rfq.setAwardedSupplierName(null); rfq.setAwardedQuotationId(null); rfq.setAwardedAmount(null); rfq.setAwardReason(null); rfq.setAwardBy(null); rfq.setAwardTime(null);
        if (rfq.getRfqId() == null) OaRecordSupport.saved(rfqs.insert(rfq)); else OaRecordSupport.saved(rfqs.updateById(rfq));
        List<OaPurchaseRfqItem> proposed = OaRecordSupport.require(request.getItems(), "询价明细不能为空");
        if (proposed.isEmpty() || proposed.size() > 500) throw new IllegalArgumentException("询价需要1至500项物料");
        List<OaPurchaseRfqItem> existing = items(rfq.getRfqId()); Set<Long> retained = new HashSet<>();
        for (OaPurchaseRfqItem item : proposed) {
            item.setItemName(OaRecordSupport.text(item.getItemName(), 100, "物料名称"));
            if (item.getQuantity() == null || item.getQuantity() <= 0) throw new IllegalArgumentException("询价数量必须为正整数");
            if (item.getExpectedPrice() != null) item.setExpectedPrice(OaRfqQuoteCalculator.money(item.getExpectedPrice()));
            if (item.getConsumableId() != null) validateConsumable(item.getConsumableId(), item.getUnit());
            item.setSortNo(item.getSortNo() == null ? 0 : item.getSortNo());
            if (item.getItemId() == null) { OaRecordSupport.create(item, "itemId"); item.setRfqId(rfq.getRfqId()); OaRecordSupport.saved(items.insert(item)); }
            else {
                OaPurchaseRfqItem old = existing.stream().filter(record -> record.getItemId().equals(item.getItemId())).findFirst().orElseThrow(() -> new IllegalArgumentException("询价明细不属于当前单据"));
                OaRecordSupport.update(item, old); item.setRfqId(rfq.getRfqId()); OaRecordSupport.saved(items.updateById(item));
            }
            if (!retained.add(item.getItemId())) throw new IllegalArgumentException("询价明细重复");
        }
        for (OaPurchaseRfqItem old : existing) if (!retained.contains(old.getItemId())) {
            OaRecordSupport.touch(old);
            OaRecordSupport.saved(items.update(null, new LambdaUpdateWrapper<OaPurchaseRfqItem>()
                    .eq(OaPurchaseRfqItem::getItemId, old.getItemId()).eq(OaPurchaseRfqItem::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaPurchaseRfqItem::getRfqId, rfq.getRfqId()).eq(OaPurchaseRfqItem::getDeleted, 0)
                    .set(OaPurchaseRfqItem::getDeleted, 1).set(OaPurchaseRfqItem::getUpdateBy, old.getUpdateBy())
                    .set(OaPurchaseRfqItem::getUpdateTime, old.getUpdateTime())));
        }
        audit.record(OaRfqAuditService.Action.RFQ_SAVED, before,
                audit.snapshot(rfq, Map.of("rfq", rfq, "items", items(rfq.getRfqId()))), Map.of(), null);
        return rfq.getRfqId();
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public Long createFromPurchase(Long purchaseId, LocalDate deadline) {
        BizPurchaseRequest purchase = OaRecordSupport.active(purchases.selectForUpdate(purchaseId, OaRecordSupport.tenantId()));
        RfqSaveDTO request = new RfqSaveDTO(); OaPurchaseRfq rfq = new OaPurchaseRfq(); rfq.setTitle("采购询价：" + purchase.getPurchaseNo()); rfq.setPurchaseRequestId(purchaseId);
        rfq.setQuoteDeadline(deadline); rfq.setDeptId(purchase.getDeptId()); rfq.setProjectId(purchase.getProjectId()); request.setRfq(rfq);
        List<OaPurchaseRfqItem> lines = new ArrayList<>();
        for (BizPurchaseItem item : purchaseItems.selectList(new LambdaQueryWrapper<BizPurchaseItem>().eq(BizPurchaseItem::getTenantId, OaRecordSupport.tenantId()).eq(BizPurchaseItem::getPurchaseId, purchaseId))) {
            OaPurchaseRfqItem line = new OaPurchaseRfqItem(); line.setConsumableId(item.getConsumableId()); line.setItemName(item.getConsumableName()); line.setSpec(item.getModel()); line.setUnit(item.getUnit()); line.setQuantity(item.getQuantity()); line.setExpectedPrice(item.getUnitPrice()); lines.add(line);
        }
        request.setItems(lines); return save(request);
    }

    public OaRfqInvitationService.InviteResult invite(Long id, RfqInviteDTO request) { return invitationService.invite(id, request); }

    public org.springframework.http.ResponseEntity<byte[]> attachment(Long id) {
        return privateFiles.download(OaPrivateFileStorageService.Kind.RFQ_INVITATION, readableAttachment(id).getAttachmentUrl());
    }

    public OaPurchaseRfq readableAttachment(Long id) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectById(id));
        access.assertOwner(rfq);
        return rfq;
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @Audit(name = "登记供应商拒绝报价", spel = "#id")
    public void decline(Long id, Long supplierId, String reason) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(id, OaRecordSupport.tenantId())); access.assertOwner(rfq);
        if (!Set.of("SENT", "QUOTING").contains(rfq.getStatus()) || rfq.getQuoteDeadline().isBefore(LocalDate.now())) throw new IllegalArgumentException("当前询价不能登记拒绝");
        OaPurchaseRfqSupplier invitation = invitations(id).stream().filter(item -> item.getSupplierId().equals(supplierId)).findFirst().orElseThrow(() -> new IllegalArgumentException("供应商未被邀请"));
        if (!OaRfqInvitationService.reached(invitation)) throw new IllegalArgumentException("邮件尚未被接纳，不能登记供应商拒绝");
        if (!"INVITED".equals(invitation.getQuoteStatus())) throw new IllegalArgumentException("供应商已经响应");
        invitation.setQuoteStatus("DECLINED"); invitation.setDeclineReason(OaRecordSupport.text(reason, 500, "拒绝原因")); invitation.setRespondTime(LocalDateTime.now()); OaRecordSupport.touch(invitation); OaRecordSupport.saved(invitations.updateById(invitation));
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @Audit(name = "关联询价采购耗材", spel = "#itemId")
    public void bindConsumable(Long id, Long itemId, Long consumableId) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(id, OaRecordSupport.tenantId())); access.assertOwner(rfq);
        if (rfq.getPurchaseRequestId() != null) {
            BizPurchaseRequest purchase = OaRecordSupport.active(purchases.selectForUpdate(rfq.getPurchaseRequestId(), OaRecordSupport.tenantId()));
            if (purchase.getRfqId() != null) throw new IllegalArgumentException("已生成采购申请，不能更换物料关联");
        }
        OaPurchaseRfqItem item = OaRecordSupport.active(items.selectById(itemId)); OaRecordSupport.same(id, item.getRfqId(), "物料不属于当前询价");
        validateConsumable(consumableId, item.getUnit()); item.setConsumableId(consumableId); OaRecordSupport.touch(item); OaRecordSupport.saved(items.updateById(item));
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @Audit(name = "取消或流标询价", highRisk = true, spel = "#id")
    public void terminate(Long id, boolean failed, String reason) {
        OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(id, OaRecordSupport.tenantId())); access.assertOwner(rfq);
        if (Set.of("AWARDED", "CANCELLED", "FAILED").contains(rfq.getStatus()) || rfq.getInstanceId() != null) throw new IllegalArgumentException("已结束或审批中的询价不能取消或流标");
        OaRfqAuditService.Snapshot before = audit.snapshot(rfq, rfq);
        reason = OaRecordSupport.text(reason, 500, "结束原因"); rfq.setStatus(failed ? "FAILED" : "CANCELLED"); OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq));
        trace.record(OaRecordSupport.tenantId(), "RFQ", id, null, null, failed ? "RFQ_FAILED" : "RFQ_CANCELLED", "询价结束", reason, UserContext.getUserId(), OaRecordSupport.userName(), null);
        audit.record(OaRfqAuditService.Action.RFQ_TERMINATED, before, audit.snapshot(rfq, rfq),
                Map.of("failed", failed, "reason", reason), null);
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @Audit(name = "重新发起询价", spel = "#id")
    public Long restart(Long id, LocalDate deadline) {
        RfqSaveDTO request = detail(id); access.assertOwner(request.getRfq());
        if (!Set.of("FAILED", "CANCELLED").contains(request.getRfq().getStatus())) throw new IllegalArgumentException("只有流标或取消询价可以重新发起");
        request.getRfq().setRfqId(null); request.getRfq().setQuoteDeadline(deadline); request.getRfq().setExpectedDeliveryDate(null); request.getRfq().setPurchaseRequestId(null);
        request.getItems().forEach(item -> item.setItemId(null)); return save(request);
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    @Audit(name = "扫描询价截止和线下联系提醒")
    public int scanDeadlines() {
        int count = 0; int leadDays = config.getConfigInt("sys.oa.rfq.reminderDays", 3);
        if (leadDays < 0) throw new IllegalStateException("询价提醒天数不能为负数");
        for (OaPurchaseRfq candidate : rfqs.selectList(new LambdaQueryWrapper<OaPurchaseRfq>().eq(OaPurchaseRfq::getTenantId, OaRecordSupport.tenantId()).eq(OaPurchaseRfq::getDeleted, 0)
                .in(OaPurchaseRfq::getStatus, "SENT", "QUOTING").le(OaPurchaseRfq::getQuoteDeadline, LocalDate.now().plusDays(leadDays)).orderByAsc(OaPurchaseRfq::getRfqId))) {
            OaPurchaseRfq rfq = OaRecordSupport.active(rfqs.selectForUpdate(candidate.getRfqId(), OaRecordSupport.tenantId()));
            if (!Set.of("SENT", "QUOTING").contains(rfq.getStatus())) continue;
            if (rfq.getQuoteDeadline().isBefore(LocalDate.now())) {
                for (OaPurchaseRfqSupplier invitation : invitations(rfq.getRfqId())) if ("INVITED".equals(invitation.getQuoteStatus()) && OaRfqInvitationService.reached(invitation)) { invitation.setQuoteStatus("NO_RESPONSE"); OaRecordSupport.touch(invitation); OaRecordSupport.saved(invitations.updateById(invitation)); }
                rfq.setStatus("COMPARING"); OaRecordSupport.touch(rfq); OaRecordSupport.saved(rfqs.updateById(rfq)); count++;
            } else if (invitations(rfq.getRfqId()).stream().anyMatch(item -> "INVITED".equals(item.getQuoteStatus()))) {
                OaRecordSupport.require(identities.user(rfq.getOwnerId(), OaRecordSupport.tenantId()), "询价负责人已失效");
                reminders.send(rfq.getOwnerId(), "RFQ_CONTACT", rfq.getRfqId().toString(), rfq.getQuoteDeadline().toString(), "询价即将截止，请核对供应商报价", rfq.getTitle() + "，报价截止日期：" + rfq.getQuoteDeadline());
                invitationService.remind(rfq);
            }
        }
        return count;
    }

    private void validateConsumable(Long id, String unit) {
        SysConsumable consumable = OaRecordSupport.active(consumables.selectById(OaRecordSupport.require(id, "耗材关联不能为空")));
        if (unit != null && !unit.isBlank() && !Objects.equals(unit, consumable.getUnit())) throw new IllegalArgumentException("询价数量单位与耗材单位不一致，不能直接生成采购");
    }
}
