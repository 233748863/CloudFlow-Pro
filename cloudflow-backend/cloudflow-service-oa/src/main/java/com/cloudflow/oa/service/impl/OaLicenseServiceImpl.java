package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.utils.SysConfigHelper;
import com.cloudflow.oa.domain.OaLicenseExpiryReminderLog;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.mapper.OaLicenseExpiryReminderLogMapper;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.mapper.OaLicenseMapper;
import com.cloudflow.oa.service.IOaLicenseService;
import com.cloudflow.oa.service.ISysNoticeService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import com.cloudflow.oa.util.OaBorrowConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/**
 * 证照台账服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaLicenseServiceImpl extends ServiceImpl<OaLicenseMapper, OaLicense> implements IOaLicenseService {

    private final OaLicenseBorrowMapper licenseBorrowMapper;
    private final OaLicenseExpiryReminderLogMapper expiryReminderLogMapper;
    private final ISysNoticeService noticeService;
    private final SysConfigHelper sysConfigHelper;

    private static final String EXPIRY_REMINDER_DAYS_CONFIG = "sys.oa.license.expiryReminderDays";
    private static final String DEFAULT_EXPIRY_REMINDER_DAYS = "30,15,7,0";

    @Override
    public PageResult<OaLicense> queryPage(OaLicense query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaLicense> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(query.getLicenseName()), OaLicense::getLicenseName, query.getLicenseName())
                .like(StringUtils.hasText(query.getLicenseCode()), OaLicense::getLicenseCode, query.getLicenseCode())
                .like(StringUtils.hasText(query.getLicenseNo()), OaLicense::getLicenseNo, query.getLicenseNo())
                .eq(StringUtils.hasText(query.getLicenseType()), OaLicense::getLicenseType, query.getLicenseType())
                .eq(StringUtils.hasText(query.getStatus()), OaLicense::getStatus, query.getStatus())
                .eq(OaLicense::getDelFlag, "0")
                .orderByDesc(OaLicense::getCreateTime);
        Page<OaLicense> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<OaLicense> listAvailable() {
        return list(new LambdaQueryWrapper<OaLicense>()
                .eq(OaLicense::getStatus, OaBorrowConstants.RESOURCE_AVAILABLE)
                .eq(OaLicense::getDelFlag, "0")
                .orderByAsc(OaLicense::getLicenseName));
    }

    @Override
    public OaLicense getLicenseInfo(Long id) {
        OaLicense license = getById(id);
        if (license == null || !"0".equals(license.getDelFlag())) {
            throw new IllegalArgumentException("证照不存在");
        }
        return license;
    }

    @Override
    public PageResult<OaLicense> queryExpiringPage(Integer days, PageQuery pageQuery) {
        int window = days == null || days < 0 ? 30 : days;
        LocalDate today = LocalDate.now();
        LambdaQueryWrapper<OaLicense> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaLicense::getDelFlag, "0")
                .ne(OaLicense::getStatus, OaBorrowConstants.RESOURCE_DISABLED)
                .isNotNull(OaLicense::getExpireDate)
                .between(OaLicense::getExpireDate, today, today.plusDays(window))
                .orderByAsc(OaLicense::getExpireDate);
        Page<OaLicense> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<OaLicenseExpiryReminderLog> listExpiryReminderLogs(Long licenseId) {
        return expiryReminderLogMapper.selectList(new LambdaQueryWrapper<OaLicenseExpiryReminderLog>()
                .eq(OaLicenseExpiryReminderLog::getLicenseId, licenseId)
                .orderByDesc(OaLicenseExpiryReminderLog::getReminderTime));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean remindExpiry(Long licenseId, String remark) {
        OaLicense license = getLicenseInfo(licenseId);
        if (license.getExpireDate() == null) {
            throw new IllegalArgumentException("证照未维护到期日期");
        }
        sendExpiryReminder(license, OaBorrowConstants.REMINDER_MANUAL,
                StringUtils.hasText(remark) ? remark : buildExpiryReminderContent(license), null, true);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int scanAndRemindExpiring() {
        LocalDate today = LocalDate.now();
        int handled = 0;
        for (Integer daysBefore : parseReminderDays()) {
            LocalDate targetDate = today.plusDays(daysBefore);
            List<OaLicense> licenses = list(new LambdaQueryWrapper<OaLicense>()
                    .eq(OaLicense::getDelFlag, "0")
                    .ne(OaLicense::getStatus, OaBorrowConstants.RESOURCE_DISABLED)
                    .eq(OaLicense::getExpireDate, targetDate));
            for (OaLicense license : licenses) {
                if (sendExpiryReminder(license, OaBorrowConstants.REMINDER_AUTO,
                        buildExpiryReminderContent(license), daysBefore, true)) {
                    handled++;
                }
            }
        }
        return handled;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createLicense(OaLicense license) {
        validateLicense(license);
        LocalDateTime now = LocalDateTime.now();
        license.setTenantId(resolveTenantId());
        license.setStatus(StringUtils.hasText(license.getStatus()) ? license.getStatus() : OaBorrowConstants.RESOURCE_AVAILABLE);
        license.setDelFlag("0");
        license.setCreateBy(UserContext.getUserName());
        license.setCreateTime(now);
        license.setUpdateBy(UserContext.getUserName());
        license.setUpdateTime(now);
        return save(license);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateLicense(OaLicense license) {
        if (license == null || license.getLicenseId() == null) {
            throw new IllegalArgumentException("证照ID不能为空");
        }
        OaLicense persisted = getById(license.getLicenseId());
        if (persisted == null || !"0".equals(persisted.getDelFlag())) {
            throw new IllegalArgumentException("证照不存在");
        }
        if (OaBorrowConstants.RESOURCE_BORROWED.equals(persisted.getStatus())
                && OaBorrowConstants.RESOURCE_DISABLED.equals(license.getStatus())) {
            throw new IllegalArgumentException("借出中的证照不能停用");
        }
        validateLicense(license);
        license.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(license.getAttachmentUrl(), "证照附件"));
        license.setUpdateBy(UserContext.getUserName());
        license.setUpdateTime(LocalDateTime.now());
        return updateById(license);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeLicenses(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Long id : ids) {
            OaLicense license = getById(id);
            if (license == null || !"0".equals(license.getDelFlag())) {
                continue;
            }
            if (OaBorrowConstants.RESOURCE_BORROWED.equals(license.getStatus())) {
                throw new IllegalArgumentException("借出中的证照不能删除：" + license.getLicenseName());
            }
            Long usageCount = licenseBorrowMapper.selectCount(new LambdaQueryWrapper<OaLicenseBorrow>()
                    .eq(OaLicenseBorrow::getLicenseId, id)
                    .eq(OaLicenseBorrow::getDelFlag, "0"));
            OaLicense update = new OaLicense();
            update.setLicenseId(id);
            update.setUpdateBy(UserContext.getUserName());
            update.setUpdateTime(now);
            if (usageCount != null && usageCount > 0) {
                update.setDelFlag("1");
                updateById(update);
            } else {
                removeById(id);
            }
        }
        return true;
    }

    private void validateLicense(OaLicense license) {
        if (license == null) {
            throw new IllegalArgumentException("证照信息不能为空");
        }
        if (!StringUtils.hasText(license.getLicenseCode())) {
            throw new IllegalArgumentException("证照编码不能为空");
        }
        if (!StringUtils.hasText(license.getLicenseName())) {
            throw new IllegalArgumentException("证照名称不能为空");
        }
        if (!StringUtils.hasText(license.getLicenseType())) {
            throw new IllegalArgumentException("证照类型不能为空");
        }
        license.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(license.getAttachmentUrl(), "证照附件"));
    }

    private List<Integer> parseReminderDays() {
        String configured = sysConfigHelper.getConfigValue(EXPIRY_REMINDER_DAYS_CONFIG, DEFAULT_EXPIRY_REMINDER_DAYS);
        return Arrays.stream(configured.split(","))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .map(value -> {
                    try {
                        return Integer.parseInt(value);
                    } catch (NumberFormatException ignored) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .filter(value -> value >= 0)
                .distinct()
                .sorted()
                .toList();
    }

    private boolean sendExpiryReminder(OaLicense license, String reminderType, String content, Integer daysBefore, boolean avoidDuplicate) {
        Long recipientId = license.getKeeperId();
        if (recipientId == null) {
            return false;
        }
        int actualDaysBefore = daysBefore == null
                ? Math.max(0, (int) ChronoUnit.DAYS.between(LocalDate.now(), license.getExpireDate()))
                : daysBefore;
        if (avoidDuplicate) {
            Long existing = expiryReminderLogMapper.selectCount(new LambdaQueryWrapper<OaLicenseExpiryReminderLog>()
                    .eq(OaLicenseExpiryReminderLog::getLicenseId, license.getLicenseId())
                    .eq(OaLicenseExpiryReminderLog::getExpireDate, license.getExpireDate())
                    .eq(OaLicenseExpiryReminderLog::getDaysBefore, actualDaysBefore)
                    .eq(OaLicenseExpiryReminderLog::getRecipientId, recipientId));
            if (existing != null && existing > 0) {
                return false;
            }
        }
        LocalDateTime now = LocalDateTime.now();
        OaLicenseExpiryReminderLog log = new OaLicenseExpiryReminderLog();
        log.setTenantId(license.getTenantId());
        log.setLicenseId(license.getLicenseId());
        log.setLicenseName(license.getLicenseName());
        log.setExpireDate(license.getExpireDate());
        log.setDaysBefore(actualDaysBefore);
        log.setRecipientId(recipientId);
        log.setRecipientName(license.getKeeperName());
        log.setReminderType(reminderType);
        log.setOperatorId(UserContext.getUserId());
        log.setOperatorName(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system");
        log.setReminderContent(content);
        log.setReminderTime(now);
        log.setCreateBy(log.getOperatorName());
        log.setCreateTime(now);
        expiryReminderLogMapper.insert(log);
        noticeService.sendNotice(recipientId, "证照到期提醒", content, "2", log.getOperatorId(), log.getOperatorName());
        return true;
    }

    private String buildExpiryReminderContent(OaLicense license) {
        long days = ChronoUnit.DAYS.between(LocalDate.now(), license.getExpireDate());
        if (days <= 0) {
            return "证照已到期，请尽快办理续期：" + license.getLicenseName();
        }
        return "证照将在 " + days + " 天后到期，请及时办理续期：" + license.getLicenseName();
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }
}
