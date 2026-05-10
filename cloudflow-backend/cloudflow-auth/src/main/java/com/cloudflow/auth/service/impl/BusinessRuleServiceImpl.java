package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.BusinessRule;
import com.cloudflow.auth.domain.BusinessRuleHitRecord;
import com.cloudflow.auth.domain.BusinessRuleVersion;
import com.cloudflow.auth.mapper.BusinessRuleHitRecordMapper;
import com.cloudflow.auth.mapper.BusinessRuleMapper;
import com.cloudflow.auth.mapper.BusinessRuleVersionMapper;
import com.cloudflow.auth.service.IBusinessRuleService;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.common.tenant.TenantBroker;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * 业务规则服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BusinessRuleServiceImpl extends ServiceImpl<BusinessRuleMapper, BusinessRule>
        implements IBusinessRuleService {

    private static final Long DEFAULT_TENANT_ID = 100000L;
    private static final Set<String> ALLOWED_EFFECTS = Set.of("BLOCK", "ALERT", "WARN", "PASS");
    private static final Set<String> ALLOWED_VERSION_STATUS = Set.of("DRAFT", "PUBLISHED", "ARCHIVED");

    private final BusinessRuleVersionMapper versionMapper;
    private final BusinessRuleHitRecordMapper hitRecordMapper;
    private final ObjectMapper objectMapper;

    @Override
    public Page<BusinessRule> queryPage(String module, String ruleCode, Integer enabled, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<BusinessRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(module), BusinessRule::getModule, module)
                .like(StringUtils.hasText(ruleCode), BusinessRule::getRuleCode, ruleCode)
                .eq(enabled != null, BusinessRule::getEnabled, enabled)
                .orderByAsc(BusinessRule::getModule)
                .orderByAsc(BusinessRule::getPriority)
                .orderByAsc(BusinessRule::getId);
        return page(new Page<>(pageNum == null ? 1 : pageNum, pageSize == null ? 10 : pageSize), wrapper);
    }

    @Override
    public BusinessRule getEffectiveRule(String ruleCode) {
        if (!StringUtils.hasText(ruleCode)) {
            return null;
        }
        Long tenantId = resolveTenantId();
        List<BusinessRule> rules = TenantBroker.applyWithoutTenant(ignore -> list(new LambdaQueryWrapper<BusinessRule>()
                .eq(BusinessRule::getRuleCode, ruleCode)
                .eq(BusinessRule::getEnabled, 1)
                .in(BusinessRule::getTenantId, tenantId, DEFAULT_TENANT_ID, 0L)));
        return rules.stream()
                .sorted(Comparator
                        .comparingInt((BusinessRule rule) -> tenantRank(rule.getTenantId(), tenantId))
                        .thenComparing(rule -> rule.getPriority() == null ? Integer.MAX_VALUE : rule.getPriority())
                        .thenComparing(rule -> rule.getId() == null ? Long.MAX_VALUE : rule.getId()))
                .findFirst()
                .orElse(null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createRule(BusinessRule rule) {
        normalizeRule(rule, true);
        ensureRuleCodeUnique(rule);
        boolean saved = save(rule);
        if (saved) {
            BusinessRuleVersion version = buildVersion(rule, "PUBLISHED");
            version.setVersionNo(1);
            version.setPublisherName(resolveUserName());
            version.setPublishedTime(LocalDateTime.now());
            versionMapper.insert(version);
        }
        return saved;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateRule(BusinessRule rule) {
        createDraft(rule);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public BusinessRuleVersion createDraft(BusinessRule rule) {
        if (rule == null || rule.getId() == null) {
            throw new IllegalArgumentException("规则ID不能为空");
        }
        BusinessRule existing = getById(rule.getId());
        if (existing == null) {
            throw new IllegalArgumentException("业务规则不存在");
        }
        BusinessRule draftRule = copyEditableFields(existing, rule);
        normalizeRule(draftRule, false);
        ensureRuleCodeUnique(draftRule);
        BusinessRuleVersion version = buildVersion(draftRule, "DRAFT");
        version.setVersionNo(nextVersionNo(existing.getId()));
        versionMapper.insert(version);
        return version;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean publishVersion(Long versionId) {
        if (versionId == null) {
            throw new IllegalArgumentException("版本ID不能为空");
        }
        BusinessRuleVersion version = versionMapper.selectById(versionId);
        if (version == null) {
            throw new IllegalArgumentException("规则版本不存在");
        }
        if (!"DRAFT".equals(version.getStatus())) {
            throw new IllegalArgumentException("只有草稿版本可以发布");
        }
        BusinessRule rule = getById(version.getRuleId());
        if (rule == null) {
            throw new IllegalArgumentException("业务规则不存在");
        }
        applyVersion(rule, version);
        rule.setUpdateBy(resolveUserName());
        rule.setUpdateTime(LocalDateTime.now());
        updateById(rule);
        version.setStatus("PUBLISHED");
        version.setPublisherName(resolveUserName());
        version.setPublishedTime(LocalDateTime.now());
        version.setUpdateBy(resolveUserName());
        version.setUpdateTime(LocalDateTime.now());
        version.setSnapshotJson(toSnapshotJson(rule));
        versionMapper.updateById(version);
        archiveOtherPublishedVersions(rule.getId(), version.getId());
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean rollbackToVersion(Long ruleId, Long versionId) {
        if (ruleId == null || versionId == null) {
            throw new IllegalArgumentException("规则ID和版本ID不能为空");
        }
        BusinessRule rule = getById(ruleId);
        BusinessRuleVersion source = versionMapper.selectById(versionId);
        if (rule == null || source == null || !ruleId.equals(source.getRuleId())) {
            throw new IllegalArgumentException("规则版本不存在");
        }
        applyVersion(rule, source);
        rule.setUpdateBy(resolveUserName());
        rule.setUpdateTime(LocalDateTime.now());
        updateById(rule);
        BusinessRuleVersion rollback = buildVersion(rule, "PUBLISHED");
        rollback.setVersionNo(nextVersionNo(ruleId));
        rollback.setPublisherName(resolveUserName());
        rollback.setPublishedTime(LocalDateTime.now());
        rollback.setRemark(appendRollbackRemark(source));
        rollback.setSnapshotJson(toSnapshotJson(rule));
        versionMapper.insert(rollback);
        archiveOtherPublishedVersions(ruleId, rollback.getId());
        return true;
    }

    @Override
    public Page<BusinessRuleVersion> queryVersions(Long ruleId, String ruleCode, String status, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<BusinessRuleVersion> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ruleId != null, BusinessRuleVersion::getRuleId, ruleId)
                .like(StringUtils.hasText(ruleCode), BusinessRuleVersion::getRuleCode, ruleCode)
                .eq(StringUtils.hasText(status), BusinessRuleVersion::getStatus, normalizeStatus(status))
                .orderByDesc(BusinessRuleVersion::getVersionNo)
                .orderByDesc(BusinessRuleVersion::getId);
        return versionMapper.selectPage(new Page<>(pageNum == null ? 1 : pageNum, pageSize == null ? 10 : pageSize), wrapper);
    }

    @Override
    public Page<BusinessRuleHitRecord> queryHitRecords(String ruleCode, String businessType, String hitResult, Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<BusinessRuleHitRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(ruleCode), BusinessRuleHitRecord::getRuleCode, ruleCode)
                .eq(StringUtils.hasText(businessType), BusinessRuleHitRecord::getBusinessType, trimUpper(businessType))
                .eq(StringUtils.hasText(hitResult), BusinessRuleHitRecord::getHitResult, trimUpper(hitResult))
                .orderByDesc(BusinessRuleHitRecord::getCreatedTime)
                .orderByDesc(BusinessRuleHitRecord::getId);
        return hitRecordMapper.selectPage(new Page<>(pageNum == null ? 1 : pageNum, pageSize == null ? 10 : pageSize), wrapper);
    }

    @Override
    public boolean recordHit(BusinessRuleHitRecord record) {
        if (record == null || !StringUtils.hasText(record.getRuleCode())) {
            return false;
        }
        record.setRuleCode(record.getRuleCode().trim());
        record.setBusinessType(trimUpper(record.getBusinessType()));
        record.setEffect(StringUtils.hasText(record.getEffect()) ? record.getEffect().trim().toUpperCase() : "PASS");
        if (!ALLOWED_EFFECTS.contains(record.getEffect())) {
            record.setEffect("PASS");
        }
        record.setHitResult(StringUtils.hasText(record.getHitResult()) ? record.getHitResult().trim().toUpperCase() : record.getEffect());
        if (record.getTenantId() == null) {
            record.setTenantId(resolveTenantId());
        }
        if (record.getThresholdValue() == null) {
            record.setThresholdValue(BigDecimal.ZERO);
        }
        if (record.getActualValue() == null) {
            record.setActualValue(BigDecimal.ZERO);
        }
        record.setCreatedTime(LocalDateTime.now());
        return hitRecordMapper.insert(record) > 0;
    }

    @Override
    public boolean setEnabled(Long id, Integer enabled) {
        if (id == null) {
            throw new IllegalArgumentException("规则ID不能为空");
        }
        if (enabled == null || (enabled != 0 && enabled != 1)) {
            throw new IllegalArgumentException("启停状态只能为0或1");
        }
        BusinessRule existing = getById(id);
        if (existing == null) {
            throw new IllegalArgumentException("业务规则不存在");
        }
        BusinessRule rule = new BusinessRule();
        rule.setId(id);
        rule.setEnabled(enabled);
        rule.setUpdateBy(resolveUserName());
        rule.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(rule);
        if (updated) {
            existing.setEnabled(enabled);
            BusinessRuleVersion version = buildVersion(existing, "PUBLISHED");
            version.setVersionNo(nextVersionNo(id));
            version.setPublisherName(resolveUserName());
            version.setPublishedTime(LocalDateTime.now());
            version.setRemark("规则启停：" + (enabled == 1 ? "启用" : "停用"));
            versionMapper.insert(version);
            archiveOtherPublishedVersions(id, version.getId());
        }
        return updated;
    }

    private BusinessRule copyEditableFields(BusinessRule existing, BusinessRule patch) {
        BusinessRule rule = new BusinessRule();
        rule.setId(existing.getId());
        rule.setTenantId(patch.getTenantId() == null ? existing.getTenantId() : patch.getTenantId());
        rule.setRuleCode(StringUtils.hasText(patch.getRuleCode()) ? patch.getRuleCode() : existing.getRuleCode());
        rule.setRuleName(StringUtils.hasText(patch.getRuleName()) ? patch.getRuleName() : existing.getRuleName());
        rule.setModule(StringUtils.hasText(patch.getModule()) ? patch.getModule() : existing.getModule());
        rule.setThresholdValue(patch.getThresholdValue() == null ? existing.getThresholdValue() : patch.getThresholdValue());
        rule.setEffect(StringUtils.hasText(patch.getEffect()) ? patch.getEffect() : existing.getEffect());
        rule.setEnabled(patch.getEnabled() == null ? existing.getEnabled() : patch.getEnabled());
        rule.setPriority(patch.getPriority() == null ? existing.getPriority() : patch.getPriority());
        rule.setRemark(patch.getRemark() == null ? existing.getRemark() : patch.getRemark());
        rule.setCreateBy(existing.getCreateBy());
        rule.setCreateTime(existing.getCreateTime());
        return rule;
    }

    private BusinessRuleVersion buildVersion(BusinessRule rule, String status) {
        BusinessRuleVersion version = new BusinessRuleVersion();
        version.setTenantId(rule.getTenantId());
        version.setRuleId(rule.getId());
        version.setRuleCode(rule.getRuleCode());
        version.setThresholdValue(rule.getThresholdValue());
        version.setEffect(rule.getEffect());
        version.setEnabled(rule.getEnabled());
        version.setPriority(rule.getPriority());
        version.setRemark(rule.getRemark());
        version.setStatus(normalizeStatus(status));
        version.setSnapshotJson(toSnapshotJson(rule));
        version.setCreateBy(resolveUserName());
        version.setCreateTime(LocalDateTime.now());
        version.setUpdateBy(resolveUserName());
        version.setUpdateTime(LocalDateTime.now());
        return version;
    }

    private void applyVersion(BusinessRule rule, BusinessRuleVersion version) {
        rule.setThresholdValue(version.getThresholdValue());
        rule.setEffect(version.getEffect());
        rule.setEnabled(version.getEnabled());
        rule.setPriority(version.getPriority());
        rule.setRemark(version.getRemark());
    }

    private Integer nextVersionNo(Long ruleId) {
        BusinessRuleVersion latest = versionMapper.selectOne(new LambdaQueryWrapper<BusinessRuleVersion>()
                .eq(BusinessRuleVersion::getRuleId, ruleId)
                .orderByDesc(BusinessRuleVersion::getVersionNo)
                .last("LIMIT 1"));
        return latest == null || latest.getVersionNo() == null ? 1 : latest.getVersionNo() + 1;
    }

    private void archiveOtherPublishedVersions(Long ruleId, Long keepVersionId) {
        List<BusinessRuleVersion> published = versionMapper.selectList(new LambdaQueryWrapper<BusinessRuleVersion>()
                .eq(BusinessRuleVersion::getRuleId, ruleId)
                .eq(BusinessRuleVersion::getStatus, "PUBLISHED")
                .ne(BusinessRuleVersion::getId, keepVersionId));
        for (BusinessRuleVersion version : published) {
            version.setStatus("ARCHIVED");
            version.setUpdateBy(resolveUserName());
            version.setUpdateTime(LocalDateTime.now());
            versionMapper.updateById(version);
        }
    }

    private String appendRollbackRemark(BusinessRuleVersion source) {
        String base = StringUtils.hasText(source.getRemark()) ? source.getRemark() : "";
        String suffix = "回滚自版本 v" + source.getVersionNo();
        return base.isBlank() ? suffix : base + "；" + suffix;
    }

    private String toSnapshotJson(BusinessRule rule) {
        try {
            return objectMapper.writeValueAsString(rule);
        } catch (JsonProcessingException e) {
            log.warn("序列化规则快照失败，ruleCode={}", rule.getRuleCode(), e);
            return "{}";
        }
    }

    private String normalizeStatus(String status) {
        String value = StringUtils.hasText(status) ? status.trim().toUpperCase() : "DRAFT";
        if (!ALLOWED_VERSION_STATUS.contains(value)) {
            throw new IllegalArgumentException("版本状态仅支持DRAFT/PUBLISHED/ARCHIVED");
        }
        return value;
    }

    private String trimUpper(String value) {
        return StringUtils.hasText(value) ? value.trim().toUpperCase() : value;
    }

    private void normalizeRule(BusinessRule rule, boolean created) {
        if (rule == null) {
            throw new IllegalArgumentException("业务规则不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleCode())) {
            throw new IllegalArgumentException("规则编码不能为空");
        }
        if (!StringUtils.hasText(rule.getRuleName())) {
            throw new IllegalArgumentException("规则名称不能为空");
        }
        if (!StringUtils.hasText(rule.getModule())) {
            throw new IllegalArgumentException("所属模块不能为空");
        }
        rule.setRuleCode(rule.getRuleCode().trim());
        rule.setModule(rule.getModule().trim().toUpperCase());
        rule.setEffect(StringUtils.hasText(rule.getEffect()) ? rule.getEffect().trim().toUpperCase() : "WARN");
        if (!ALLOWED_EFFECTS.contains(rule.getEffect())) {
            throw new IllegalArgumentException("规则效果仅支持BLOCK/ALERT/WARN/PASS");
        }
        if (rule.getEnabled() == null) {
            rule.setEnabled(1);
        }
        if (rule.getEnabled() != 0 && rule.getEnabled() != 1) {
            throw new IllegalArgumentException("启停状态只能为0或1");
        }
        if (rule.getPriority() == null) {
            rule.setPriority(100);
        }
        if (rule.getTenantId() == null) {
            rule.setTenantId(resolveTenantId());
        }
        LocalDateTime now = LocalDateTime.now();
        if (created) {
            rule.setCreateBy(resolveUserName());
            rule.setCreateTime(now);
        }
        rule.setUpdateBy(resolveUserName());
        rule.setUpdateTime(now);
    }

    private void ensureRuleCodeUnique(BusinessRule rule) {
        LambdaQueryWrapper<BusinessRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(BusinessRule::getTenantId, rule.getTenantId())
                .eq(BusinessRule::getRuleCode, rule.getRuleCode());
        if (rule.getId() != null) {
            wrapper.ne(BusinessRule::getId, rule.getId());
        }
        Long count = count(wrapper);
        if (count != null && count > 0) {
            throw new IllegalArgumentException("当前租户已存在规则编码：" + rule.getRuleCode());
        }
    }

    private int tenantRank(Long ruleTenantId, Long tenantId) {
        if (ruleTenantId == null) {
            return 3;
        }
        if (ruleTenantId.equals(tenantId)) {
            return 0;
        }
        if (ruleTenantId.equals(DEFAULT_TENANT_ID)) {
            return 1;
        }
        if (ruleTenantId == 0L) {
            return 2;
        }
        return 3;
    }

    private Long resolveTenantId() {
        return SecurityUtils.getTenantId() == null ? DEFAULT_TENANT_ID : SecurityUtils.getTenantId();
    }

    private String resolveUserName() {
        return StringUtils.hasText(SecurityUtils.getUsername()) ? SecurityUtils.getUsername() : "system";
    }
}
