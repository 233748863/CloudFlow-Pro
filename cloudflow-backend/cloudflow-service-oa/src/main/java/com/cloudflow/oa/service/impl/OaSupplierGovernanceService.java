package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.*;
import com.cloudflow.oa.domain.dto.SupplierScorecardDTO;
import com.cloudflow.oa.domain.vo.SupplierDeliveryRecord;
import com.cloudflow.oa.mapper.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class OaSupplierGovernanceService {
    public record SupplierAdmission(boolean allowed, String reason) { }

    private final SysSupplierMapper supplierMapper;
    private final OaSupplierCategoryMapper categoryMapper;
    private final OaSupplierQualificationMapper qualificationMapper;
    private final OaSupplierQualificationReminderLogMapper reminderMapper;
    private final OaSupplierScorecardMapper scorecardMapper;
    private final OaSupplierScoreCriteriaMapper criteriaMapper;
    private final OaSupplierDeliveryMapper deliveryMapper;
    private final OaBusinessRuleService businessRuleService;
    private final SysConfigHelper config;
    private final MessageSender messages;
    private final OaIdentityReferenceMapper identities;
    private final OaSupplierAuditService audit;

    public List<OaSupplierCategory> categories() {
        return categoryMapper.selectList(new LambdaQueryWrapper<OaSupplierCategory>().eq(OaSupplierCategory::getTenantId, OaRecordSupport.tenantId())
                .eq(OaSupplierCategory::getDeleted, 0).orderByAsc(OaSupplierCategory::getSortNo, OaSupplierCategory::getCategoryId));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存供应商分类", spel = "#category")
    public Long saveCategory(OaSupplierCategory category) {
        category.setCategoryCode(OaRecordSupport.text(category.getCategoryCode(), 50, "分类编码"));
        category.setCategoryName(OaRecordSupport.text(category.getCategoryName(), 100, "分类名称"));
        category.setParentId(category.getParentId() == null ? 0L : category.getParentId());
        category.setStatus(OaRecordSupport.code(category.getStatus(), "ACTIVE", Set.of("ACTIVE", "DISABLED")));
        category.setSortNo(category.getSortNo() == null ? 0 : category.getSortNo());
        String parentPath = "/";
        if (category.getParentId() != 0) {
            OaSupplierCategory parent = OaRecordSupport.active(categoryMapper.selectForUpdate(category.getParentId(), OaRecordSupport.tenantId()));
            if (Objects.equals(parent.getCategoryId(), category.getCategoryId()) || category.getCategoryId() != null && parent.getLevelPath().contains("/" + category.getCategoryId() + "/")) throw new IllegalArgumentException("分类不能循环引用");
            parentPath = parent.getLevelPath();
        }
        OaSupplierCategory previous = category.getCategoryId() == null ? null : OaRecordSupport.active(categoryMapper.selectForUpdate(category.getCategoryId(), OaRecordSupport.tenantId()));
        if (previous == null) { OaRecordSupport.create(category, "categoryId"); category.setLevelPath(parentPath); OaRecordSupport.saved(categoryMapper.insert(category)); }
        else OaRecordSupport.update(category, previous);
        String targetPath = parentPath + category.getCategoryId() + "/";
        if (targetPath.length() > 500) throw new IllegalArgumentException("分类层级路径过长");
        category.setLevelPath(targetPath);
        OaRecordSupport.saved(categoryMapper.updateById(category));
        if (previous != null && !Objects.equals(previous.getLevelPath(), targetPath)) {
            for (OaSupplierCategory descendant : categories()) {
                if (!Objects.equals(descendant.getCategoryId(), category.getCategoryId()) && descendant.getLevelPath().startsWith(previous.getLevelPath())) {
                    String replacement = targetPath + descendant.getLevelPath().substring(previous.getLevelPath().length());
                    if (replacement.length() > 500) throw new IllegalArgumentException("子分类层级路径过长");
                    descendant.setLevelPath(replacement); OaRecordSupport.touch(descendant); OaRecordSupport.saved(categoryMapper.updateById(descendant));
                }
            }
        }
        return category.getCategoryId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "删除供应商分类", highRisk = true, spel = "#id")
    public void removeCategory(Long id) {
        OaSupplierCategory category = OaRecordSupport.active(categoryMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (categoryMapper.selectCount(new LambdaQueryWrapper<OaSupplierCategory>().eq(OaSupplierCategory::getParentId, id).eq(OaSupplierCategory::getDeleted, 0)) > 0
                || supplierMapper.selectCount(new LambdaQueryWrapper<SysSupplier>().eq(SysSupplier::getCategoryId, id).eq(SysSupplier::getDeleted, 0)) > 0) throw new IllegalArgumentException("分类仍被引用");
        OaRecordSupport.touch(category);
        OaRecordSupport.saved(categoryMapper.update(null, new LambdaUpdateWrapper<OaSupplierCategory>()
                .eq(OaSupplierCategory::getCategoryId, id).eq(OaSupplierCategory::getTenantId, OaRecordSupport.tenantId())
                .eq(OaSupplierCategory::getDeleted, 0).eq(OaSupplierCategory::getVersion, category.getVersion())
                .set(OaSupplierCategory::getDeleted, 1).set(OaSupplierCategory::getVersion, category.getVersion() + 1)
                .set(OaSupplierCategory::getUpdateBy, category.getUpdateBy()).set(OaSupplierCategory::getUpdateTime, category.getUpdateTime())));
    }

    public List<OaSupplierQualification> qualifications(Long supplierId) {
        OaRecordSupport.active(supplierMapper.selectById(supplierId));
        return qualificationMapper.selectList(new LambdaQueryWrapper<OaSupplierQualification>().eq(OaSupplierQualification::getTenantId, OaRecordSupport.tenantId())
                .eq(OaSupplierQualification::getSupplierId, supplierId).eq(OaSupplierQualification::getDeleted, 0).orderByAsc(OaSupplierQualification::getExpireDate));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存供应商资质", spel = "#qualification")
    public Long saveQualification(OaSupplierQualification qualification) {
        OaRecordSupport.active(supplierMapper.selectForUpdate(qualification.getSupplierId(), OaRecordSupport.tenantId()));
        qualification.setQualificationType(OaRecordSupport.code(qualification.getQualificationType(), null, Set.of("BUSINESS_LICENSE", "TAX_REGISTRATION", "ISO", "INDUSTRY_PERMIT", "BANK_INFO", "CREDIT_REPORT", "OTHER")));
        qualification.setCertName(OaRecordSupport.text(qualification.getCertName(), 100, "证件名称"));
        qualification.setLongTermFlag(OaRecordSupport.flag(qualification.getLongTermFlag()));
        if (qualification.getLongTermFlag() == 0) OaRecordSupport.require(qualification.getExpireDate(), "到期日不能为空");
        else qualification.setExpireDate(null);
        if (qualification.getIssueDate() != null && qualification.getExpireDate() != null && qualification.getIssueDate().isAfter(qualification.getExpireDate())) throw new IllegalArgumentException("到期日不能早于签发日");
        qualification.setReminderDays(qualification.getReminderDays() == null ? 30 : qualification.getReminderDays());
        if (qualification.getReminderDays() < 0) throw new IllegalArgumentException("提前提醒天数不能为负数");
        qualification.setVerifyStatus("PENDING"); qualification.setVerifyBy(null); qualification.setVerifyTime(null); qualification.setRejectReason(null);
        if (qualification.getQualificationId() == null) { OaRecordSupport.create(qualification, "qualificationId"); OaRecordSupport.saved(qualificationMapper.insert(qualification)); }
        else {
            OaSupplierQualification previous = OaRecordSupport.active(qualificationMapper.selectForUpdate(qualification.getQualificationId(), OaRecordSupport.tenantId()));
            OaRecordSupport.same(previous.getSupplierId(), qualification.getSupplierId(), "资质不能更换供应商");
            OaRecordSupport.update(qualification, previous); OaRecordSupport.saved(qualificationMapper.updateById(qualification));
            qualificationMapper.update(null, new LambdaUpdateWrapper<OaSupplierQualification>().eq(OaSupplierQualification::getQualificationId, qualification.getQualificationId())
                    .set(OaSupplierQualification::getVerifyBy, null).set(OaSupplierQualification::getVerifyTime, null).set(OaSupplierQualification::getRejectReason, null));
        }
        refreshExpiry(qualification.getSupplierId());
        return qualification.getQualificationId();
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "核验供应商资质", spel = "#id")
    public void verifyQualification(Long id, boolean accepted, String reason) {
        OaSupplierQualification reference = OaRecordSupport.active(qualificationMapper.selectById(id));
        OaRecordSupport.active(supplierMapper.selectForUpdate(reference.getSupplierId(), OaRecordSupport.tenantId()));
        OaSupplierQualification qualification = OaRecordSupport.active(qualificationMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
        if (accepted && qualification.getLongTermFlag() == 0 && qualification.getExpireDate().isBefore(LocalDate.now())) throw new IllegalArgumentException("过期证件不能核验通过");
        qualification.setVerifyStatus(accepted ? "VERIFIED" : "REJECTED");
        qualification.setRejectReason(accepted ? null : OaRecordSupport.text(reason, 500, "不通过原因"));
        qualification.setVerifyBy(UserContext.getUserId()); qualification.setVerifyTime(LocalDateTime.now()); OaRecordSupport.touch(qualification);
        OaRecordSupport.saved(qualificationMapper.updateById(qualification)); refreshExpiry(qualification.getSupplierId());
    }

    private void refreshExpiry(Long supplierId) {
        LocalDate earliest = qualifications(supplierId).stream().filter(item -> "VERIFIED".equals(item.getVerifyStatus()) && item.getLongTermFlag() == 0)
                .map(OaSupplierQualification::getExpireDate).filter(Objects::nonNull).min(LocalDate::compareTo).orElse(null);
        supplierMapper.update(null, new LambdaUpdateWrapper<SysSupplier>().eq(SysSupplier::getSupplierId, supplierId).set(SysSupplier::getQualificationExpireDate, earliest));
    }

    @Transactional(rollbackFor = Exception.class)
    public void assertSupplierAllowed(Long supplierId, String scene) {
        checkSupplierAllowed(supplierId, scene);
    }

    @Transactional(rollbackFor = Exception.class)
    public SupplierAdmission evaluateSupplierAdmission(Long supplierId, String scene) {
        try {
            checkSupplierAllowed(supplierId, scene);
            return new SupplierAdmission(true, null);
        } catch (IllegalArgumentException exception) {
            return new SupplierAdmission(false, exception.getMessage());
        } catch (ServiceException exception) {
            if (!Integer.valueOf(400).equals(exception.getCode())) throw exception;
            return new SupplierAdmission(false, exception.getMessage());
        }
    }

    private void checkSupplierAllowed(Long supplierId, String scene) {
        SysSupplier supplier = OaRecordSupport.active(supplierMapper.selectForUpdate(supplierId, OaRecordSupport.tenantId()));
        try {
            if (!"ACTIVE".equals(supplier.getStatus())) throw new IllegalArgumentException("供应商已停用");
            boolean bypass = Integer.valueOf(1).equals(supplier.getBypassFlag()) && supplier.getBypassExpireDate() != null && !supplier.getBypassExpireDate().isBefore(LocalDate.now());
            if (Integer.valueOf(1).equals(supplier.getBlacklistFlag())) {
                String reason = supplier.getBlacklistReason();
                businessRuleService.evaluateBlock("oa.supplier.blacklist.block", scene, supplierId, bypass,
                        "供应商在黑名单" + (reason == null || reason.isBlank() ? "" : "：" + reason));
            }
            if ("ELIMINATED".equals(supplier.getStanding())) businessRuleService.evaluateBlock("oa.supplier.eliminated.block", scene, supplierId, bypass, "供应商评级为淘汰级");
            if ("WATCH".equals(supplier.getStanding())) businessRuleService.evaluateBlock("oa.supplier.standing.limit", scene, supplierId, bypass, "供应商评级为观察级，请谨慎选择");
            List<String> expiredCertificates = qualifications(supplierId).stream().filter(item -> "BUSINESS_LICENSE".equals(item.getQualificationType())
                    && item.getLongTermFlag() == 0 && item.getExpireDate() != null && item.getExpireDate().isBefore(LocalDate.now()))
                    .map(OaSupplierQualification::getCertName).distinct().toList();
            if (!expiredCertificates.isEmpty()) businessRuleService.evaluateBlock("oa.supplier.qualification.expired", scene, supplierId, bypass,
                    "供应商关键资质已过期：" + String.join("、", expiredCertificates));
            if (!bypass && (("RFQ".equals(scene) && Integer.valueOf(1).equals(supplier.getPreventRfqFlag()))
                    || ("PURCHASE".equals(scene) && Integer.valueOf(1).equals(supplier.getPreventPurchaseFlag())))) throw new IllegalArgumentException("供应商已禁止该业务");
        } catch (IllegalArgumentException exception) {
            audit.blocked(OaSupplierAuditService.snapshot(supplier), scene, exception.getMessage());
            throw new ServiceException(exception.getMessage(), 400);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "生成供应商待评分记录")
    public Long ensurePendingScorecard(Long supplierId, String periodType, LocalDate start, LocalDate end) {
        OaRecordSupport.active(supplierMapper.selectForUpdate(supplierId, OaRecordSupport.tenantId()));
        List<OaSupplierScorecard> existing = scorecardMapper.selectList(new LambdaQueryWrapper<OaSupplierScorecard>()
                .eq(OaSupplierScorecard::getTenantId, OaRecordSupport.tenantId()).eq(OaSupplierScorecard::getSupplierId, supplierId)
                .eq(OaSupplierScorecard::getPeriodType, periodType).eq(OaSupplierScorecard::getPeriodStart, start).eq(OaSupplierScorecard::getPeriodEnd, end));
        if (!existing.isEmpty()) return existing.get(0).getScorecardId();
        OaSupplierScorecard card = new OaSupplierScorecard(); OaRecordSupport.create(card, "scorecardId");
        card.setSupplierId(supplierId); card.setPeriodType(periodType); card.setPeriodStart(start); card.setPeriodEnd(end); card.setStatus("DRAFT");
        OaRecordSupport.saved(scorecardMapper.insert(card));
        List<String> codes = List.of("DELIVERY_ON_TIME", "QUALITY", "PRICE", "SERVICE");
        List<String> names = List.of("交付及时率", "质量合格率", "价格竞争力", "服务响应");
        for (int index = 0; index < codes.size(); index++) {
            OaSupplierScoreCriteria criterion = new OaSupplierScoreCriteria(); OaRecordSupport.create(criterion, "criteriaId");
            criterion.setScorecardId(card.getScorecardId()); criterion.setCriteriaCode(codes.get(index)); criterion.setCriteriaName(names.get(index));
            criterion.setWeight(new BigDecimal(index < 2 ? "0.30" : "0.20")); criterion.setMaxScore(new BigDecimal("100.00"));
            criterion.setDataSource(index == 0 ? "AUTO" : "MANUAL"); OaRecordSupport.saved(criteriaMapper.insert(criterion));
        }
        return card.getScorecardId();
    }

    public PageResult<OaSupplierScorecard> scorecards(Long supplierId, PageQuery page) {
        return PageResult.build(scorecardMapper.selectPage(page.build(), new LambdaQueryWrapper<OaSupplierScorecard>()
                .eq(OaSupplierScorecard::getTenantId, OaRecordSupport.tenantId()).eq(supplierId != null, OaSupplierScorecard::getSupplierId, supplierId)
                .eq(OaSupplierScorecard::getDeleted, 0).orderByDesc(OaSupplierScorecard::getPeriodEnd)));
    }

    public List<OaSupplierScoreCriteria> criteria(Long scorecardId) {
        OaRecordSupport.active(scorecardMapper.selectById(scorecardId));
        return criteriaMapper.selectList(new LambdaQueryWrapper<OaSupplierScoreCriteria>().eq(OaSupplierScoreCriteria::getTenantId, OaRecordSupport.tenantId())
                .eq(OaSupplierScoreCriteria::getScorecardId, scorecardId).eq(OaSupplierScoreCriteria::getDeleted, 0));
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "保存供应商评分", spel = "#request.scorecard")
    public Long saveScorecard(SupplierScorecardDTO request) {
        OaSupplierScorecard card = OaRecordSupport.require(request.getScorecard(), "评分卡不能为空");
        OaRecordSupport.active(supplierMapper.selectForUpdate(card.getSupplierId(), OaRecordSupport.tenantId()));
        if (OaRecordSupport.require(card.getPeriodStart(), "周期开始日不能为空").isAfter(OaRecordSupport.require(card.getPeriodEnd(), "周期结束日不能为空"))) throw new IllegalArgumentException("评分周期无效");
        card.setPeriodType(OaRecordSupport.code(card.getPeriodType(), "MONTHLY", Set.of("MONTHLY", "QUARTERLY", "YEARLY")));
        if (card.getScorecardId() != null) {
            OaSupplierScorecard previous = OaRecordSupport.active(scorecardMapper.selectForUpdate(card.getScorecardId(), OaRecordSupport.tenantId()));
            if (!"DRAFT".equals(previous.getStatus())) throw new IllegalArgumentException("已确认评分不能修改");
            OaRecordSupport.same(previous.getSupplierId(), card.getSupplierId(), "评分卡不能更换供应商"); OaRecordSupport.update(card, previous);
        } else OaRecordSupport.create(card, "scorecardId");
        List<OaSupplierScoreCriteria> items = OaRecordSupport.require(request.getCriteria(), "评分维度不能为空");
        for (OaSupplierScoreCriteria item : items) {
            item.setCriteriaName(OaRecordSupport.text(item.getCriteriaName(), 100, "维度名称"));
            item.setDataSource(OaRecordSupport.code(item.getDataSource(), "MANUAL", Set.of("AUTO", "MANUAL")));
            if (item.getMaxScore() == null) item.setMaxScore(BigDecimal.valueOf(100));
            if ("AUTO".equals(item.getDataSource())) {
                if (!"DELIVERY_ON_TIME".equals(item.getCriteriaCode())) throw new IllegalArgumentException("本期自动维度仅支持交付及时率");
                List<SupplierDeliveryRecord> records = deliveryMapper.selectBySupplierAndPeriod(OaRecordSupport.tenantId(), card.getSupplierId(), card.getPeriodStart(), card.getPeriodEnd());
                long onTime = records.stream().filter(record -> !record.getActualDate().isAfter(record.getExpectedDate())).count();
                BigDecimal rate = records.isEmpty() ? null : BigDecimal.valueOf(onTime).divide(BigDecimal.valueOf(records.size()), 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
                item.setAutoValue(rate); item.setScore(rate == null ? null : rate.multiply(item.getMaxScore()).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
                item.setRemark("周期=" + card.getPeriodStart() + "~" + card.getPeriodEnd() + "；基于" + records.size() + "笔收货，及时" + onTime + "笔；收货ID=" + records.stream().map(record -> String.valueOf(record.getReceiptId())).collect(java.util.stream.Collectors.joining(",")));
                if (item.getRemark().length() > 500) item.setRemark("周期=" + card.getPeriodStart() + "~" + card.getPeriodEnd() + "；供应商=" + card.getSupplierId() + "；基于" + records.size() + "笔收货，及时" + onTime + "笔；按供应商及周期可重查完整依据");
            } else item.setAutoValue(null);
        }
        card.setTotalScore(SupplierScoreCalculator.calculate(items)); card.setStanding(standing(card.getTotalScore()));
        card.setIndicatorColor(color(card.getStanding())); card.setWarnFlag("WATCH".equals(card.getStanding()) ? 1 : 0); card.setPreventFlag("ELIMINATED".equals(card.getStanding()) ? 1 : 0);
        card.setCalcTime(LocalDateTime.now()); card.setCalcBy(UserContext.getUserId()); card.setStatus("DRAFT");
        if (card.getScorecardId() == null) OaRecordSupport.saved(scorecardMapper.insert(card)); else OaRecordSupport.saved(scorecardMapper.updateById(card));
        Set<String> retained = new HashSet<>();
        List<OaSupplierScoreCriteria> previousItems = criteriaMapper.selectHistoryForUpdate(card.getScorecardId(), OaRecordSupport.tenantId());
        for (OaSupplierScoreCriteria item : items) {
            OaSupplierScoreCriteria previous = previousItems.stream().filter(existing -> existing.getCriteriaCode().equals(item.getCriteriaCode())).findFirst().orElse(null);
            item.setScorecardId(card.getScorecardId()); retained.add(item.getCriteriaCode());
            if (previous == null) { OaRecordSupport.create(item, "criteriaId"); OaRecordSupport.saved(criteriaMapper.insert(item)); }
            else {
                item.setCriteriaId(previous.getCriteriaId());
                if (Integer.valueOf(1).equals(previous.getDeleted())) {
                    item.setTenantId(previous.getTenantId()); item.setCreateBy(previous.getCreateBy()); item.setCreateTime(previous.getCreateTime());
                    item.setDeleted(0); OaRecordSupport.touch(item);
                    OaRecordSupport.saved(criteriaMapper.restoreDraftCriterion(item));
                } else {
                    OaRecordSupport.update(item, previous);
                    OaRecordSupport.saved(criteriaMapper.updateById(item));
                }
            }
        }
        for (OaSupplierScoreCriteria previous : previousItems) {
            if (!Integer.valueOf(0).equals(previous.getDeleted()) || retained.contains(previous.getCriteriaCode())) continue;
            OaRecordSupport.touch(previous);
            OaRecordSupport.saved(criteriaMapper.update(null, new LambdaUpdateWrapper<OaSupplierScoreCriteria>()
                    .eq(OaSupplierScoreCriteria::getCriteriaId, previous.getCriteriaId()).eq(OaSupplierScoreCriteria::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaSupplierScoreCriteria::getScorecardId, card.getScorecardId()).eq(OaSupplierScoreCriteria::getDeleted, 0)
                    .set(OaSupplierScoreCriteria::getDeleted, 1)
                    .set(OaSupplierScoreCriteria::getUpdateBy, previous.getUpdateBy()).set(OaSupplierScoreCriteria::getUpdateTime, previous.getUpdateTime())));
        }
        return card.getScorecardId();
    }

    @Transactional(rollbackFor = Exception.class, isolation = org.springframework.transaction.annotation.Isolation.READ_COMMITTED)
    public void confirmScorecard(Long id) {
        OaSupplierScorecard reference = OaRecordSupport.active(scorecardMapper.selectById(id));
        SysSupplier supplier = OaRecordSupport.active(supplierMapper.selectForUpdate(reference.getSupplierId(), OaRecordSupport.tenantId()));
        OaSupplierScorecard card = OaRecordSupport.active(scorecardMapper.selectForUpdate(id, OaRecordSupport.tenantId()));
        if ("CONFIRMED".equals(card.getStatus())) return;
        if (card.getTotalScore() == null) throw new IllegalArgumentException("没有可用评分，不能确认");
        OaSupplierAuditService.Snapshot before = OaSupplierAuditService.scorecard(supplier, card);
        String previous = supplier.getStanding(); card.setStatus("CONFIRMED"); OaRecordSupport.touch(card); OaRecordSupport.saved(scorecardMapper.updateById(card));
        boolean currentRatingUpdated = scorecardMapper.selectCount(new LambdaQueryWrapper<OaSupplierScorecard>().eq(OaSupplierScorecard::getTenantId, OaRecordSupport.tenantId()).eq(OaSupplierScorecard::getSupplierId, card.getSupplierId())
                .eq(OaSupplierScorecard::getDeleted, 0).eq(OaSupplierScorecard::getStatus, "CONFIRMED").gt(OaSupplierScorecard::getPeriodEnd, card.getPeriodEnd())) == 0;
        if (currentRatingUpdated) {
            supplier.setScore(card.getTotalScore()); supplier.setStanding(card.getStanding()); supplier.setIndicatorColor(card.getIndicatorColor());
            supplier.setLastScoreTime(LocalDateTime.now()); OaRecordSupport.touch(supplier); OaRecordSupport.saved(supplierMapper.updateById(supplier));
            List<String> levels = List.of("EXCELLENT", "QUALIFIED", "WATCH", "ELIMINATED");
            if (previous != null && levels.indexOf(card.getStanding()) > levels.indexOf(previous)) messages.send(UserContext.getUserId(), "供应商评级下降", supplier.getSupplierName() + "：" + previous + " → " + card.getStanding(), "2", UserContext.getUserId(), OaRecordSupport.userName());
        }
        audit.record(OaSupplierAuditService.Action.SCORE_CONFIRMED, before,
                OaSupplierAuditService.scorecard(OaRecordSupport.active(supplierMapper.selectById(supplier.getSupplierId())),
                        OaRecordSupport.active(scorecardMapper.selectById(id))), Map.of("currentRatingUpdated", currentRatingUpdated), null);
    }

    private String standing(BigDecimal score) {
        if (score == null) return null;
        BigDecimal excellent = new BigDecimal(config.getConfigValue("sys.oa.supplier.score.excellent", "90"));
        BigDecimal qualified = new BigDecimal(config.getConfigValue("sys.oa.supplier.score.qualified", "75"));
        BigDecimal watch = new BigDecimal(config.getConfigValue("sys.oa.supplier.score.watch", "60"));
        if (watch.signum() < 0 || qualified.compareTo(watch) <= 0 || excellent.compareTo(qualified) <= 0 || excellent.compareTo(BigDecimal.valueOf(100)) > 0) throw new IllegalStateException("供应商评级阈值无效");
        return score.compareTo(excellent) >= 0 ? "EXCELLENT" : score.compareTo(qualified) >= 0 ? "QUALIFIED" : score.compareTo(watch) >= 0 ? "WATCH" : "ELIMINATED";
    }

    private String color(String standing) { return standing == null ? null : "ELIMINATED".equals(standing) ? "RED" : "WATCH".equals(standing) ? "YELLOW" : "GREEN"; }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "扫描供应商资质到期")
    public int scanQualificationExpiry() {
        LocalDate today = LocalDate.now(); int count = 0;
        List<OaSupplierQualification> due = qualificationMapper.selectList(new LambdaQueryWrapper<OaSupplierQualification>()
                .eq(OaSupplierQualification::getTenantId, OaRecordSupport.tenantId()).eq(OaSupplierQualification::getDeleted, 0)
                .eq(OaSupplierQualification::getLongTermFlag, 0).isNotNull(OaSupplierQualification::getExpireDate)
                .orderByAsc(OaSupplierQualification::getSupplierId, OaSupplierQualification::getQualificationId));
        for (OaSupplierQualification candidate : due) {
            SysSupplier supplier = supplierMapper.selectForUpdate(candidate.getSupplierId(), OaRecordSupport.tenantId());
            if (supplier == null) continue;
            OaRecordSupport.active(supplier);
            OaSupplierQualification item = qualificationMapper.selectForUpdate(candidate.getQualificationId(), OaRecordSupport.tenantId());
            if (item == null) continue;
            OaRecordSupport.active(item);
            if (Integer.valueOf(1).equals(item.getLongTermFlag()) || item.getExpireDate() == null) continue;
            if (item.getExpireDate().isBefore(today) && !"EXPIRED".equals(item.getVerifyStatus())) { item.setVerifyStatus("EXPIRED"); OaRecordSupport.touch(item); OaRecordSupport.saved(qualificationMapper.updateById(item)); refreshExpiry(item.getSupplierId()); }
            long remaining = ChronoUnit.DAYS.between(today, item.getExpireDate());
            if (remaining > item.getReminderDays()) continue;
            Long recipient = config.getConfigLong("sys.oa.supplier.qualification.reminderUserId", 1L);
            OaRecordSupport.require(identities.user(recipient, OaRecordSupport.tenantId()), "供应商提醒接收人不属于当前租户，请配置管理人");
            int checkpoint = remaining <= 0 ? 0 : item.getReminderDays();
            if (reminderMapper.selectCount(new LambdaQueryWrapper<OaSupplierQualificationReminderLog>().eq(OaSupplierQualificationReminderLog::getTenantId, OaRecordSupport.tenantId())
                    .eq(OaSupplierQualificationReminderLog::getQualificationId, item.getQualificationId()).eq(OaSupplierQualificationReminderLog::getExpireDate, item.getExpireDate())
                    .eq(OaSupplierQualificationReminderLog::getDaysBefore, checkpoint).eq(OaSupplierQualificationReminderLog::getRecipientId, recipient)) > 0) continue;
            OaSupplierQualificationReminderLog reminder = new OaSupplierQualificationReminderLog(); OaRecordSupport.create(reminder, "id");
            reminder.setQualificationId(item.getQualificationId()); reminder.setSupplierId(item.getSupplierId()); reminder.setCertName(item.getCertName());
            reminder.setExpireDate(item.getExpireDate()); reminder.setDaysBefore(checkpoint); reminder.setRecipientId(recipient); reminder.setReminderType("AUTO");
            reminder.setReminderTime(LocalDateTime.now()); reminder.setReminderContent(supplier.getSupplierName() + "资质" + item.getCertName() + "于" + item.getExpireDate() + "到期");
            messages.send(recipient, "供应商资质到期提醒", reminder.getReminderContent(), "2", null, "system");
            OaRecordSupport.saved(reminderMapper.insert(reminder)); count++;
        }
        return count;
    }
}
