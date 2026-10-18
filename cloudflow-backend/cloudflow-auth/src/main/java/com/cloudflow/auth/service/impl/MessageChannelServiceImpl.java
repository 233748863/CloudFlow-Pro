package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.dto.ChannelTestDTO;
import com.cloudflow.auth.domain.dto.MessageChannelDTO;
import com.cloudflow.auth.domain.vo.ChannelTestResultVO;
import com.cloudflow.auth.domain.vo.SysMessageChannelVO;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.message.MessageEmailAddress;
import com.cloudflow.auth.service.MessageChannelService;
import com.cloudflow.common.message.channel.ChannelTestResult;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.channel.ChannelTestContext;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

/**
 * 消息渠道配置服务。
 */
@Service
@RequiredArgsConstructor
public class MessageChannelServiceImpl extends ServiceImpl<SysMessageChannelMapper, SysMessageChannel>
        implements MessageChannelService {

    private final MessageSecretCipher secretCipher;
    private final MessageChannelSenderFactory senderFactory;
    private final SysAuditLogMapper auditLogs;

    @Override
    public PageResult<SysMessageChannelVO> list(String channelType, String status, int pageNum, int pageSize) {
        String normalizedType = StringUtils.hasText(channelType) ? channelType.toUpperCase(Locale.ROOT) : null;
        String normalizedStatus = StringUtils.hasText(status) ? status.toUpperCase(Locale.ROOT) : null;
        LambdaQueryWrapper<SysMessageChannel> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysMessageChannel::getTenantId, tenantId())
                .eq(SysMessageChannel::getDeleted, 0)
                .eq(StringUtils.hasText(normalizedType), SysMessageChannel::getChannelType, normalizedType)
                .eq(StringUtils.hasText(normalizedStatus), SysMessageChannel::getStatus, normalizedStatus)
                .orderByAsc(SysMessageChannel::getPriority, SysMessageChannel::getChannelId);
        int safePage = Math.max(1, pageNum);
        int safeSize = Math.max(1, Math.min(200, pageSize));
        Page<SysMessageChannel> page = baseMapper.selectPage(new Page<>(safePage, safeSize), wrapper);
        List<SysMessageChannelVO> result = page.getRecords().stream().map(this::toVO).toList();
        return new PageResult<>(result, page.getTotal(), page.getCurrent(), page.getSize());
    }

    @Override
    public SysMessageChannelVO get(Long channelId) {
        return toVO(getOwned(channelId));
    }

    @Override
    @Audit(name = "新增消息渠道", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void add(MessageChannelDTO dto) {
        validate(dto);
        SysMessageChannel channel = new SysMessageChannel();
        BeanUtils.copyProperties(dto, channel);
        channel.setTenantId(tenantId());
        channel.setChannelType(dto.getChannelType().trim().toUpperCase(Locale.ROOT));
        channel.setChannelCode(dto.getChannelCode().trim());
        channel.setChannelName(dto.getChannelName().trim());
        channel.setFromAddress(fromAddress(dto.getFromAddress(), null));
        channel.setApiSecretCipher(encryptIfPresent(dto.getApiSecret()));
        channel.setSmtpPwdCipher(encryptIfPresent(dto.getSmtpPwd()));
        channel.setImplementedFlag(resolveImplemented(channel.getChannelType()));
        channel.setStatus(StringUtils.hasText(dto.getStatus())
                ? dto.getStatus().trim().toUpperCase(Locale.ROOT)
                : (StringUtils.hasText(channel.getStatus()) ? channel.getStatus().trim().toUpperCase(Locale.ROOT) : "ENABLED"));
        channel.setPriority(channel.getPriority() == null ? 100 : channel.getPriority());
        channel.setRetryCount(channel.getRetryCount() == null ? 3 : channel.getRetryCount());
        channel.setRetryIntervalSec(channel.getRetryIntervalSec() == null ? 60 : channel.getRetryIntervalSec());
        channel.setDeleted(0);
        channel.setVersion(0);
        channel.setCreateBy(userName());
        channel.setCreateTime(LocalDateTime.now());
        if (!save(channel)) throw new ServiceException("消息渠道未保存成功", 409);
        auditChange("新增消息渠道", channel, null, channel.getStatus());
    }

    @Override
    @Audit(name = "修改消息渠道", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void edit(MessageChannelDTO dto) {
        if (dto == null || dto.getChannelId() == null) {
            throw new ServiceException("渠道ID不能为空");
        }
        validate(dto);
        SysMessageChannel channel = getOwned(dto.getChannelId());
        String oldSecret = channel.getApiSecretCipher();
        String oldPwd = channel.getSmtpPwdCipher();
        String oldStatus = channel.getStatus();
        String senderAddress = fromAddress(dto.getFromAddress(), channel.getFromAddress());
        BeanUtils.copyProperties(dto, channel);
        channel.setFromAddress(senderAddress);
        channel.setTenantId(tenantId());
        channel.setChannelType(dto.getChannelType().trim().toUpperCase(Locale.ROOT));
        channel.setChannelCode(dto.getChannelCode().trim());
        channel.setChannelName(dto.getChannelName().trim());
        channel.setApiSecretCipher(StringUtils.hasText(dto.getApiSecret()) && !isMasked(dto.getApiSecret())
                ? encryptIfPresent(dto.getApiSecret()) : oldSecret);
        channel.setSmtpPwdCipher(StringUtils.hasText(dto.getSmtpPwd()) && !isMasked(dto.getSmtpPwd())
                ? encryptIfPresent(dto.getSmtpPwd()) : oldPwd);
        channel.setImplementedFlag(resolveImplemented(channel.getChannelType()));
        channel.setStatus(StringUtils.hasText(dto.getStatus())
                ? dto.getStatus().trim().toUpperCase(Locale.ROOT)
                : (StringUtils.hasText(oldStatus) ? oldStatus.trim().toUpperCase(Locale.ROOT) : "ENABLED"));
        channel.setUpdateBy(userName());
        channel.setUpdateTime(LocalDateTime.now());
        boolean updated = update(channel, new LambdaUpdateWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getChannelId, channel.getChannelId())
                .eq(SysMessageChannel::getTenantId, tenantId())
                .eq(SysMessageChannel::getDeleted, 0)
                .set(channel.getFromAddress() == null, SysMessageChannel::getFromAddress, null)
                .set(channel.getRateLimitMinute() == null, SysMessageChannel::getRateLimitMinute, null)
                .set(channel.getDailyLimit() == null, SysMessageChannel::getDailyLimit, null));
        if (!updated) throw new ServiceException("消息渠道已被其他操作修改，请刷新后重试", 409);
        auditChange("修改消息渠道", channel, oldStatus, channel.getStatus());
    }

    @Override
    public ChannelTestResultVO test(Long channelId, ChannelTestDTO dto) {
        SysMessageChannel channel = getOwned(channelId);
        MessageChannelSender sender;
        try {
            sender = senderFactory.get(MessageChannelType.valueOf(channel.getChannelType().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            sender = null;
        }
        if (sender == null || !sender.implemented()) {
            return new ChannelTestResultVO(false, "渠道未实现");
        }
        ChannelTestResult result = sender.test(ChannelTestContext.builder()
                .channelId(channel.getChannelId())
                .tenantId(channel.getTenantId())
                .target(dto == null ? null : dto.getTarget())
                .content(dto == null ? null : dto.getContent()).build());
        if (result == null) return new ChannelTestResultVO(false, "渠道未返回测试结果");
        return new ChannelTestResultVO(result.isSuccess(), result.getMessage());
    }

    @Override
    @Audit(name = "删除消息渠道", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void remove(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return;
        for (Long id : ids) {
            SysMessageChannel channel = getOwned(id);
            int removed = baseMapper.delete(new LambdaQueryWrapper<SysMessageChannel>()
                    .eq(SysMessageChannel::getChannelId, id)
                    .eq(SysMessageChannel::getTenantId, tenantId())
                    .eq(SysMessageChannel::getVersion, channel.getVersion()));
            if (removed != 1) throw new ServiceException("消息渠道已被其他操作修改，请刷新后重试", 409);
            auditChange("删除消息渠道", channel, channel.getStatus(), "DELETED");
        }
    }

    @Override
    public SysMessageChannel findEnabled(String channelType) {
        List<SysMessageChannel> channels = list(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, tenantId())
                .eq(SysMessageChannel::getChannelType, channelType == null ? null : channelType.trim().toUpperCase(Locale.ROOT))
                .eq(SysMessageChannel::getStatus, "ENABLED")
                .eq(SysMessageChannel::getDeleted, 0)
                .orderByAsc(SysMessageChannel::getPriority)
                .orderByAsc(SysMessageChannel::getChannelId));
        return channels.isEmpty() ? null : channels.get(0);
    }

    // 只记录渠道标识和状态，凭据与密文不进入审计；与业务变更同事务提交。
    private void auditChange(String action, SysMessageChannel channel, String before, String after) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(channel.getTenantId());
        entry.setBizModule("SYSTEM");
        entry.setAuditName(action);
        entry.setAuditField("channel:" + channel.getChannelId() + ":status");
        entry.setBeforeVal(before);
        entry.setAfterVal(after);
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(userName());
        entry.setCreateTime(LocalDateTime.now());
        if (auditLogs.insert(entry) != 1) throw new ServiceException("消息渠道审计未保存成功", 409);
    }

    private SysMessageChannel getOwned(Long id) {
        SysMessageChannel channel = getOne(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getChannelId, id)
                .eq(SysMessageChannel::getTenantId, tenantId())
                .eq(SysMessageChannel::getDeleted, 0));
        if (channel == null) throw new ServiceException("消息渠道不存在", 404);
        return channel;
    }

    private SysMessageChannelVO toVO(SysMessageChannel source) {
        SysMessageChannelVO target = new SysMessageChannelVO();
        BeanUtils.copyProperties(source, target);
        target.setApiSecret(secretCipher.mask(decryptSafely(source.getApiSecretCipher())));
        target.setSmtpPwd(secretCipher.mask(decryptSafely(source.getSmtpPwdCipher())));
        return target;
    }

    private String decryptSafely(String value) {
        if (!StringUtils.hasText(value)) return null;
        try { return secretCipher.decrypt(value); } catch (RuntimeException e) { return null; }
    }

    private String encryptIfPresent(String value) {
        if (!StringUtils.hasText(value)) return null;
        String cipher = secretCipher.encrypt(value);
        if (cipher.length() > 500) throw new ServiceException("渠道密钥长度超过存储上限");
        return cipher;
    }

    private boolean isMasked(String value) { return value != null && value.startsWith("****"); }

    private String fromAddress(String submitted, String original) {
        if (submitted == null || Objects.equals(submitted, SensitiveUtils.maskByFieldName("fromAddress", original))) return original;
        if (!StringUtils.hasText(submitted)) return null;
        try {
            String normalized = MessageEmailAddress.normalize(submitted);
            if (normalized.length() > 200) throw new IllegalArgumentException();
            return normalized;
        } catch (IllegalArgumentException invalid) {
            throw new ServiceException("发件地址格式无效或超过200字符");
        }
    }

    private int resolveImplemented(String type) {
        try {
            MessageChannelSender sender = senderFactory.get(MessageChannelType.valueOf(type));
            return sender != null && sender.implemented() ? 1 : 0;
        } catch (IllegalArgumentException e) { return 0; }
    }

    private void validate(MessageChannelDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getChannelType()) || !StringUtils.hasText(dto.getChannelCode())
                || !StringUtils.hasText(dto.getChannelName())) throw new ServiceException("渠道类型、编码和名称不能为空");
        try { MessageChannelType.valueOf(dto.getChannelType().trim().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) { throw new ServiceException("渠道类型不受支持"); }
        if (StringUtils.hasText(dto.getStatus())
                && !List.of("ENABLED", "DISABLED").contains(dto.getStatus().trim().toUpperCase(Locale.ROOT))) {
            throw new ServiceException("渠道状态不受支持");
        }
        if (dto.getSmtpSslFlag() != null && dto.getSmtpSslFlag() != 0 && dto.getSmtpSslFlag() != 1) {
            throw new ServiceException("SMTP SSL 开关值不合法");
        }
        if ((dto.getRateLimitMinute() != null && dto.getRateLimitMinute() <= 0)
                || (dto.getDailyLimit() != null && dto.getDailyLimit() <= 0)) {
            throw new ServiceException("渠道限流值必须大于0");
        }
        if ((dto.getRetryCount() != null && (dto.getRetryCount() < 0 || dto.getRetryCount() > 100))
                || (dto.getRetryIntervalSec() != null && dto.getRetryIntervalSec() <= 0)) {
            throw new ServiceException("渠道重试次数必须在0至100之间，重试间隔必须大于0");
        }
    }

    private Long tenantId() { return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId(); }
    private String userName() { return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system"; }
}
