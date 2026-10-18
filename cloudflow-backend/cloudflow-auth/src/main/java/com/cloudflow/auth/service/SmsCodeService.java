package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysSmsCode;
import com.cloudflow.auth.domain.dto.SmsCodeSendDTO;
import com.cloudflow.auth.domain.dto.SmsCodeVerifyDTO;
import com.cloudflow.auth.mapper.SysSmsCodeMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.channel.ChannelSendResult;
import cn.hutool.crypto.SecureUtil;
import cn.hutool.crypto.digest.BCrypt;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.security.SecureRandom;
import java.util.concurrent.TimeUnit;

/**
 * 短信验证码服务。短信渠道未实现时返回明确错误，不写明文验证码。
 */
@Service
@RequiredArgsConstructor
public class SmsCodeService {
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private final SysSmsCodeMapper codeMapper;
    private final MessageChannelSenderFactory senderFactory;
    private final MessageChannelService channelService;
    private final CaptchaService captchaService;
    private final StringRedisTemplate redisTemplate;

    @Value("${cloudflow.message.sms.daily-limit:10}")
    private int dailyLimit;

    @Value("${cloudflow.message.sms.expire-minutes:5}")
    private int expireMinutes;

    @Transactional(rollbackFor = Exception.class)
    public void send(SmsCodeSendDTO dto, HttpServletRequest request) {
        String ip = request == null ? null : IpUtils.getIpAddr(request);
        if (dto == null || !captchaService.validatePassToken(dto.getCaptchaToken(), ip)) {
            throw new ServiceException("请先完成图形验证码校验");
        }
        String phone = dto.getPhone() == null ? "" : dto.getPhone().trim();
        String bizScene = dto.getBizScene() == null ? "" : dto.getBizScene().trim();
        if (!phone.matches("^1[3-9]\\d{9}$") || bizScene.isBlank() || bizScene.length() > 50) {
            throw new ServiceException("手机号或业务场景格式不正确");
        }
        LocalDateTime now = LocalDateTime.now();
        Long recent = codeMapper.selectCount(new LambdaQueryWrapper<SysSmsCode>()
                .eq(SysSmsCode::getTenantId, tenantId())
                .eq(SysSmsCode::getPhone, phone)
                .eq(SysSmsCode::getBizScene, bizScene)
                .ge(SysSmsCode::getCreateTime, now.minusSeconds(60)));
        if (recent != null && recent > 0) {
            throw new ServiceException("验证码发送过于频繁，请60秒后再试");
        }
        if (dailyLimit > 0) {
            long todayCount = codeMapper.selectCount(new LambdaQueryWrapper<SysSmsCode>()
                    .eq(SysSmsCode::getTenantId, tenantId())
                    .eq(SysSmsCode::getPhone, phone)
                    .eq(SysSmsCode::getBizScene, bizScene)
                    .ge(SysSmsCode::getCreateTime, java.time.LocalDate.now().atStartOfDay()));
            if (todayCount >= dailyLimit) {
                throw new ServiceException("验证码发送已达到每日上限");
            }
        }
        SysMessageChannel channel = channelService.findEnabled(MessageChannelType.SMS.name());
        MessageChannelSender sender = senderFactory.get(MessageChannelType.SMS);
        if (channel == null || sender == null || !sender.implemented()) {
            throw new ServiceException("短信渠道未配置");
        }
        String resendKey = "cloudflow:sms:resend:" + SecureUtil.sha256(tenantId() + ":" + phone + ":" + bizScene);
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(resendKey, "1", 60, TimeUnit.SECONDS);
        if (!Boolean.TRUE.equals(acquired)) {
            throw new ServiceException("验证码发送过于频繁，请60秒后再试");
        }
        boolean sent = false;
        try {
            int ttlMinutes = Math.max(1, expireMinutes);
            String code = String.format(Locale.ROOT, "%06d", SECURE_RANDOM.nextInt(1_000_000));
            SysSmsCode record = new SysSmsCode();
            record.setTenantId(tenantId());
            record.setPhone(phone);
            record.setCodeHash(BCrypt.hashpw(code, BCrypt.gensalt(10)));
            record.setBizScene(bizScene);
            record.setExpireTime(now.plusMinutes(ttlMinutes));
            record.setUsedFlag(0);
            record.setVerifyFailCount(0);
            record.setSendIp(ip);
            record.setCreateTime(now);
            codeMapper.insert(record);
            ChannelSendResult result = sender.send(ChannelSendContext.builder()
                    .channelId(channel.getChannelId()).tenantId(tenantId())
                    .title("短信验证码").content("您的验证码是" + code + "，" + ttlMinutes + "分钟内有效")
                    .receiver(MessageReceiver.ofAddress("PHONE", phone)).build());
            if (!result.isSuccess()) {
                throw new ServiceException(result.getSkipReason() != null
                        ? "短信渠道未配置" : "短信发送失败");
            }
            sent = true;
        } finally {
            if (!sent) redisTemplate.delete(resendKey);
        }
    }

    public void verify(SmsCodeVerifyDTO dto) {
        if (dto == null) throw new ServiceException("验证码请求不能为空");
        String phone = dto.getPhone() == null ? "" : dto.getPhone().trim();
        String bizScene = dto.getBizScene() == null ? "" : dto.getBizScene().trim();
        if (!phone.matches("^1[3-9]\\d{9}$") || bizScene.isBlank() || bizScene.length() > 50 || dto.getCode() == null
                || !dto.getCode().trim().matches("\\d{6}")) {
            throw new ServiceException("手机号、业务场景或验证码格式不正确");
        }
        List<SysSmsCode> rows = codeMapper.selectList(new LambdaQueryWrapper<SysSmsCode>()
                .eq(SysSmsCode::getTenantId, tenantId()).eq(SysSmsCode::getPhone, phone)
                .eq(SysSmsCode::getBizScene, bizScene).eq(SysSmsCode::getUsedFlag, 0)
                .gt(SysSmsCode::getExpireTime, LocalDateTime.now())
                .orderByDesc(SysSmsCode::getCreateTime));
        if (rows.isEmpty()) throw new ServiceException("验证码不存在或已过期");
        SysSmsCode record = rows.get(0);
        if (record.getVerifyFailCount() != null && record.getVerifyFailCount() >= 5) {
            throw new ServiceException("验证码错误次数过多，请重新获取");
        }
        boolean matched;
        try {
            matched = BCrypt.checkpw(dto.getCode().trim(), record.getCodeHash());
        } catch (RuntimeException ignored) {
            matched = false;
        }
        if (!matched) {
            // Increment only the failure counter. A stale reader must never restore used_flag=0.
            int updated = codeMapper.update(null, activeCode(record)
                    .setSql("verify_fail_count = verify_fail_count + 1"));
            if (updated == 0) throw new ServiceException("验证码已失效或错误次数过多，请重新获取");
            throw new ServiceException("验证码错误");
        }
        int updated = codeMapper.update(null, activeCode(record)
                .set(SysSmsCode::getUsedFlag, 1)
                .set(SysSmsCode::getUsedTime, LocalDateTime.now()));
        if (updated == 0) throw new ServiceException("验证码已使用、已过期或错误次数过多");
    }

    private LambdaUpdateWrapper<SysSmsCode> activeCode(SysSmsCode record) {
        // Recheck all mutable acceptance conditions atomically at the database write.
        return new LambdaUpdateWrapper<SysSmsCode>()
                .eq(SysSmsCode::getCodeId, record.getCodeId())
                .eq(SysSmsCode::getTenantId, tenantId())
                .eq(SysSmsCode::getPhone, record.getPhone())
                .eq(SysSmsCode::getBizScene, record.getBizScene())
                .eq(SysSmsCode::getUsedFlag, 0)
                .gt(SysSmsCode::getExpireTime, LocalDateTime.now())
                .lt(SysSmsCode::getVerifyFailCount, 5);
    }

    private Long tenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) tenantId = com.cloudflow.common.tenant.TenantContext.getTenantId();
        return tenantId == null ? 100000L : tenantId;
    }
}
