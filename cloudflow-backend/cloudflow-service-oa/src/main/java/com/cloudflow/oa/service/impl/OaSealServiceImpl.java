package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.OaSealExpiryReminderLog;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.OaSealExpiryReminderLogMapper;
import com.cloudflow.oa.mapper.OaSealMapper;
import com.cloudflow.oa.service.IOaSealService;
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
 * 印章台账服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaSealServiceImpl extends ServiceImpl<OaSealMapper, OaSeal> implements IOaSealService {

    private final OaSealApplicationMapper sealApplicationMapper;
    private final OaSealExpiryReminderLogMapper expiryReminderLogMapper;
    private final ISysNoticeService noticeService;
    private final SysConfigHelper sysConfigHelper;

    private static final String EXPIRY_REMINDER_DAYS_CONFIG = "sys.oa.seal.expiryReminderDays";
    private static final String DEFAULT_EXPIRY_REMINDER_DAYS = "30,15,7,0";

    @Override
    public PageResult<OaSeal> queryPage(OaSeal query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaSeal> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(query.getSealName()), OaSeal::getSealName, query.getSealName())
                .like(StringUtils.hasText(query.getSealCode()), OaSeal::getSealCode, query.getSealCode())
                .like(StringUtils.hasText(query.getSealNo()), OaSeal::getSealNo, query.getSealNo())
                .eq(StringUtils.hasText(query.getSealType()), OaSeal::getSealType, query.getSealType())
                .eq(StringUtils.hasText(query.getStatus()), OaSeal::getStatus, query.getStatus())
                .eq(OaSeal::getDelFlag, "0")
                .orderByDesc(OaSeal::getCreateTime);
        Page<OaSeal> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<OaSeal> listAvailable() {
        return list(new LambdaQueryWrapper<OaSeal>()
                .eq(OaSeal::getStatus, OaBorrowConstants.RESOURCE_AVAILABLE)
                .eq(OaSeal::getDelFlag, "0")
                .orderByAsc(OaSeal::getSealName));
    }

    @Override
    public OaSeal getSealInfo(Long id) {
        OaSeal seal = getById(id);
        if (seal == null || !"0".equals(seal.getDelFlag())) {
            throw new IllegalArgumentException("印章不存在");
        }
        return seal;
    }

    @Override
    public PageResult<OaSeal> queryExpiringPage(Integer days, PageQuery pageQuery) {
        int window = days == null || days < 0 ? 30 : days;
        LocalDate today = LocalDate.now();
        LambdaQueryWrapper<OaSeal> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaSeal::getDelFlag, "0")
                .ne(OaSeal::getStatus, OaBorrowConstants.RESOURCE_DISABLED)
                .isNotNull(OaSeal::getExpireDate)
                .between(OaSeal::getExpireDate, today, today.plusDays(window))
                .orderByAsc(OaSeal::getExpireDate);
        Page<OaSeal> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<OaSealExpiryReminderLog> listExpiryReminderLogs(Long sealId) {
        return expiryReminderLogMapper.selectList(new LambdaQueryWrapper<OaSealExpiryReminderLog>()
                .eq(OaSealExpiryReminderLog::getSealId, sealId)
                .orderByDesc(OaSealExpiryReminderLog::getReminderTime));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean remindExpiry(Long sealId, String remark) {
        OaSeal seal = getSealInfo(sealId);
        if (OaBorrowConstants.RESOURCE_DISABLED.equals(seal.getStatus())) {
            throw new IllegalArgumentException("停用印章不能发送到期提醒");
        }
        if (seal.getExpireDate() == null) {
            throw new IllegalArgumentException("印章未维护到期日期");
        }
        long days = ChronoUnit.DAYS.between(LocalDate.now(), seal.getExpireDate());
        if (days > getExpiryReminderWindowDays()) {
            throw new IllegalArgumentException("印章未进入到期提醒窗口");
        }
        sendExpiryReminder(seal, OaBorrowConstants.REMINDER_MANUAL,
                StringUtils.hasText(remark) ? remark : buildExpiryReminderContent(seal), null, true);
        return true;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public int scanAndRemindExpiring() {
        LocalDate today = LocalDate.now();
        int handled = 0;
        for (Integer daysBefore : parseReminderDays()) {
            LocalDate targetDate = today.plusDays(daysBefore);
            List<OaSeal> seals = list(new LambdaQueryWrapper<OaSeal>()
                    .eq(OaSeal::getDelFlag, "0")
                    .ne(OaSeal::getStatus, OaBorrowConstants.RESOURCE_DISABLED)
                    .eq(OaSeal::getExpireDate, targetDate));
            for (OaSeal seal : seals) {
                if (sendExpiryReminder(seal, OaBorrowConstants.REMINDER_AUTO,
                        buildExpiryReminderContent(seal), daysBefore, true)) {
                    handled++;
                }
            }
        }
        return handled;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createSeal(OaSeal seal) {
        validateSeal(seal);
        seal.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(seal.getAttachmentUrl(), "印章附件"));
        LocalDateTime now = LocalDateTime.now();
        seal.setTenantId(resolveTenantId());
        seal.setStatus(StringUtils.hasText(seal.getStatus()) ? seal.getStatus() : OaBorrowConstants.RESOURCE_AVAILABLE);
        if (OaBorrowConstants.RESOURCE_BORROWED.equals(seal.getStatus())) {
            throw new IllegalArgumentException("不能通过台账手工设置印章为借出");
        }
        validateLedgerStatus(seal.getStatus());
        seal.setBorrowDueTime(null);
        seal.setDelFlag("0");
        seal.setCreateBy(UserContext.getUserName());
        seal.setCreateTime(now);
        seal.setUpdateBy(UserContext.getUserName());
        seal.setUpdateTime(now);
        return save(seal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateSeal(OaSeal seal) {
        if (seal == null || seal.getSealId() == null) {
            throw new IllegalArgumentException("印章ID不能为空");
        }
        OaSeal persisted = getById(seal.getSealId());
        if (persisted == null || !"0".equals(persisted.getDelFlag())) {
            throw new IllegalArgumentException("印章不存在");
        }
        if (isSealBorrowLocked(seal.getSealId(), persisted)) {
            throw new IllegalArgumentException("借出中的印章不能编辑");
        }
        seal.setStatus(StringUtils.hasText(seal.getStatus()) ? seal.getStatus() : persisted.getStatus());
        if (OaBorrowConstants.RESOURCE_BORROWED.equals(seal.getStatus())) {
            throw new IllegalArgumentException("不能通过台账手工设置印章为借出");
        }
        validateLedgerStatus(seal.getStatus());
        validateSeal(seal);
        seal.setAttachmentUrl(OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(seal.getAttachmentUrl(), "印章附件"));
        seal.setBorrowDueTime(null);
        seal.setUpdateBy(UserContext.getUserName());
        seal.setUpdateTime(LocalDateTime.now());
        boolean updated = updateById(seal);
        if (updated) {
            update(new LambdaUpdateWrapper<OaSeal>()
                    .eq(OaSeal::getSealId, seal.getSealId())
                    .set(OaSeal::getBorrowDueTime, null));
        }
        return updated;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeSeals(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Long id : ids) {
            OaSeal seal = getById(id);
            if (seal == null || !"0".equals(seal.getDelFlag())) {
                continue;
            }
            if (isSealBorrowLocked(id, seal)) {
                throw new IllegalArgumentException("借出中的印章不能删除");
            }
            Long usageCount = sealApplicationMapper.selectCount(new LambdaQueryWrapper<OaSealApplication>()
                    .eq(OaSealApplication::getSealId, id)
                    .eq(OaSealApplication::getDelFlag, "0"));
            OaSeal update = new OaSeal();
            update.setSealId(id);
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

    private boolean isSealBorrowLocked(Long sealId, OaSeal seal) {
        if (seal != null && OaBorrowConstants.RESOURCE_BORROWED.equals(seal.getStatus())) {
            return true;
        }
        Long activeCount = sealApplicationMapper.selectCount(new LambdaQueryWrapper<OaSealApplication>()
                .eq(OaSealApplication::getSealId, sealId)
                .eq(OaSealApplication::getDelFlag, "0")
                .in(OaSealApplication::getStatus,
                        OaBorrowConstants.STATUS_BORROWED,
                        OaBorrowConstants.STATUS_OVERDUE));
        return activeCount != null && activeCount > 0;
    }

    private void validateLedgerStatus(String status) {
        if (!OaBorrowConstants.RESOURCE_AVAILABLE.equals(status)
                && !OaBorrowConstants.RESOURCE_DISABLED.equals(status)) {
            throw new IllegalArgumentException("印章状态只能为可用或停用");
        }
    }

    private void validateSeal(OaSeal seal) {
        if (seal == null) {
            throw new IllegalArgumentException("印章信息不能为空");
        }
        if (!StringUtils.hasText(seal.getSealCode())) {
            throw new IllegalArgumentException("印章编码不能为空");
        }
        if (!StringUtils.hasText(seal.getSealName())) {
            throw new IllegalArgumentException("印章名称不能为空");
        }
        if (!StringUtils.hasText(seal.getSealType())) {
            throw new IllegalArgumentException("印章类型不能为空");
        }
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

    private int getExpiryReminderWindowDays() {
        return parseReminderDays().stream().max(Integer::compareTo).orElse(30);
    }

    private boolean sendExpiryReminder(OaSeal seal, String reminderType, String content, Integer daysBefore, boolean avoidDuplicate) {
        Long recipientId = seal.getKeeperId();
        if (recipientId == null) {
            return false;
        }
        int actualDaysBefore = daysBefore == null
                ? Math.max(0, (int) ChronoUnit.DAYS.between(LocalDate.now(), seal.getExpireDate()))
                : daysBefore;
        if (avoidDuplicate) {
            Long existing = expiryReminderLogMapper.selectCount(new LambdaQueryWrapper<OaSealExpiryReminderLog>()
                    .eq(OaSealExpiryReminderLog::getSealId, seal.getSealId())
                    .eq(OaSealExpiryReminderLog::getExpireDate, seal.getExpireDate())
                    .eq(OaSealExpiryReminderLog::getDaysBefore, actualDaysBefore)
                    .eq(OaSealExpiryReminderLog::getRecipientId, recipientId));
            if (existing != null && existing > 0) {
                return false;
            }
        }
        LocalDateTime now = LocalDateTime.now();
        OaSealExpiryReminderLog log = new OaSealExpiryReminderLog();
        log.setTenantId(seal.getTenantId());
        log.setSealId(seal.getSealId());
        log.setSealName(seal.getSealName());
        log.setExpireDate(seal.getExpireDate());
        log.setDaysBefore(actualDaysBefore);
        log.setRecipientId(recipientId);
        log.setRecipientName(seal.getKeeperName());
        log.setReminderType(reminderType);
        log.setOperatorId(UserContext.getUserId());
        log.setOperatorName(StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system");
        log.setReminderContent(content);
        log.setReminderTime(now);
        log.setCreateBy(log.getOperatorName());
        log.setCreateTime(now);
        expiryReminderLogMapper.insert(log);
        noticeService.sendNotice(recipientId, "印章到期提醒", content, "2", log.getOperatorId(), log.getOperatorName());
        return true;
    }

    private String buildExpiryReminderContent(OaSeal seal) {
        long days = ChronoUnit.DAYS.between(LocalDate.now(), seal.getExpireDate());
        if (days <= 0) {
            return "印章已到期，请尽快办理续期：" + seal.getSealName();
        }
        return "印章将在 " + days + " 天后到期，请及时办理续期：" + seal.getSealName();
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }
}
