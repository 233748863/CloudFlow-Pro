package com.cloudflow.auth.service;

import cn.hutool.core.codec.Base32;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.auth.config.properties.TotpProperties;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserTotp;
import com.cloudflow.auth.domain.vo.TotpSetupVO;
import com.cloudflow.auth.domain.vo.TotpStatusVO;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.exception.ErrorCodeConstants;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantBroker;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

@Service
public class TotpService {

    private static final String CHALLENGE_KEY_PREFIX = "auth:totp:challenge:";
    private static final int SECRET_BYTES = 20;
    private static final int CODE_DIGITS = 6;
    private static final long TIME_STEP_SECONDS = 30L;
    private static final int ALLOWED_TIME_DRIFT_STEPS = 1;
    private static final DefaultRedisScript<Long> CONSUME_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            Long.class
    );

    private final SysUserTotpMapper totpMapper;
    private final TotpSecretCipher secretCipher;
    private final TotpProperties properties;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final SecurityChangeNoticeService securityChangeNoticeService;
    private final SecureRandom secureRandom = new SecureRandom();

    public TotpService(
            SysUserTotpMapper totpMapper,
            TotpSecretCipher secretCipher,
            TotpProperties properties,
            StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            SecurityChangeNoticeService securityChangeNoticeService
    ) {
        this.totpMapper = totpMapper;
        this.secretCipher = secretCipher;
        this.properties = properties;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.securityChangeNoticeService = securityChangeNoticeService;
    }

    public TotpStatusVO getStatus(Long userId, Long tenantId) {
        boolean featureEnabled = properties.isEnabled() && secretCipher.isAvailable();
        SysUserTotp record = findRecord(userId, tenantId);
        return new TotpStatusVO(
                featureEnabled,
                featureEnabled && record != null && Integer.valueOf(1).equals(record.getEnabled()),
                record != null ? record.getEnabledAt() : null
        );
    }

    public TotpSetupVO beginSetup(SysUser user) {
        assertFeatureEnabled();
        secretCipher.assertAvailable();
        SysUserTotp existing = findRecord(user.getUserId(), user.getTenantId());
        if (existing != null && Integer.valueOf(1).equals(existing.getEnabled())) {
            throw new ServiceException("双因素认证已启用", ErrorCodeConstants.CONFLICT);
        }

        byte[] secretBytes = new byte[SECRET_BYTES];
        secureRandom.nextBytes(secretBytes);
        String secret = Base32.encode(secretBytes).replace("=", "").toUpperCase(Locale.ROOT);
        LocalDateTime now = LocalDateTime.now();

        if (existing == null) {
            SysUserTotp created = new SysUserTotp();
            created.setTenantId(user.getTenantId());
            created.setUserId(user.getUserId());
            created.setSecretCiphertext(secretCipher.encrypt(secret));
            created.setEnabled(0);
            created.setCreateTime(now);
            created.setUpdateTime(now);
            TenantBroker.applyWithoutTenant(ignored -> totpMapper.insert(created));
        } else {
            // 覆盖上一次未完成的设置：旧二维码/密钥就此作废。
            // 前端据此提示用户「已重新生成，请以本次二维码为准」，避免多端并发设置时
            // 先扫的那台设备拿着失效密钥反复报「验证码错误」却不知原因。
            SysUserTotp update = new SysUserTotp();
            update.setId(existing.getId());
            update.setSecretCiphertext(secretCipher.encrypt(secret));
            update.setEnabled(0);
            update.setEnabledAt(null);
            update.setLastUsedStep(null);
            update.setUpdateTime(now);
            TenantBroker.applyWithoutTenant(ignored -> totpMapper.update(
                    update,
                    new LambdaUpdateWrapper<SysUserTotp>()
                            .eq(SysUserTotp::getId, existing.getId())
                            .set(SysUserTotp::getEnabledAt, null)
                            .set(SysUserTotp::getLastUsedStep, null)
            ));
        }

        return new TotpSetupVO(secret, buildOtpAuthUri(user, secret), existing != null);
    }

    public LocalDateTime enable(SysUser user, String code) {
        assertFeatureEnabled();
        SysUserTotp record = requireRecord(user.getUserId(), user.getTenantId());
        if (Integer.valueOf(1).equals(record.getEnabled())) {
            throw new ServiceException("双因素认证已启用", ErrorCodeConstants.CONFLICT);
        }
        Long step = matchStep(secretCipher.decrypt(record.getSecretCiphertext()), code, Instant.now());
        if (step == null || !consumeStep(record.getId(), step)) {
            throw new ServiceException("验证码错误，请重试", ErrorCodeConstants.BAD_REQUEST);
        }

        LocalDateTime enabledAt = LocalDateTime.now();
        SysUserTotp update = new SysUserTotp();
        update.setId(record.getId());
        update.setEnabled(1);
        update.setEnabledAt(enabledAt);
        update.setUpdateTime(enabledAt);
        TenantBroker.applyWithoutTenant(ignored -> totpMapper.updateById(update));
        securityChangeNoticeService.notifyTotpEnabled(user);
        return enabledAt;
    }

    @Audit(name = "禁用双因素认证", highRisk = true)
    public void disable(SysUser user) {
        SysUserTotp record = requireRecord(user.getUserId(), user.getTenantId());
        TenantBroker.applyWithoutTenant(ignored -> totpMapper.deleteById(record.getId()));
        securityChangeNoticeService.notifyTotpDisabled(user);
    }

    public boolean isEnabled(Long userId, Long tenantId) {
        if (!properties.isEnabled()) {
            return false;
        }
        SysUserTotp record = findRecord(userId, tenantId);
        return record != null && Integer.valueOf(1).equals(record.getEnabled());
    }

    public boolean verifyLoginCode(Long userId, Long tenantId, String code) {
        assertFeatureEnabled();
        SysUserTotp record = requireRecord(userId, tenantId);
        if (!Integer.valueOf(1).equals(record.getEnabled())) {
            return false;
        }
        Long step = matchStep(secretCipher.decrypt(record.getSecretCiphertext()), code, Instant.now());
        // 步长必须原子消费成功才算通过，否则同一个码在 ±1 步容忍窗口内可被重复使用
        return step != null && consumeStep(record.getId(), step);
    }

    public String issueLoginChallenge(SysUser user, String legalReleaseCode, long startedAt) {
        assertFeatureEnabled();
        byte[] randomBytes = new byte[32];
        secureRandom.nextBytes(randomBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        LoginChallengePayload payload = new LoginChallengePayload(
                user.getUserId(),
                user.getTenantId(),
                legalReleaseCode,
                startedAt
        );
        try {
            String rawValue = objectMapper.writeValueAsString(payload);
            redisTemplate.opsForValue().set(
                    CHALLENGE_KEY_PREFIX + token,
                    rawValue,
                    normalizedChallengeTtl(),
                    TimeUnit.SECONDS
            );
            return token;
        } catch (Exception ex) {
            throw new ServiceException("登录验证凭证生成失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, ex);
        }
    }

    public PendingLoginChallenge requireLoginChallenge(String token) {
        assertFeatureEnabled();
        if (!StringUtils.hasText(token) || !token.matches("[A-Za-z0-9_-]{40,64}")) {
            throw new ServiceException("登录验证已过期，请重新登录", ErrorCodeConstants.BAD_REQUEST);
        }
        String rawValue = redisTemplate.opsForValue().get(CHALLENGE_KEY_PREFIX + token);
        if (!StringUtils.hasText(rawValue)) {
            throw new ServiceException("登录验证已过期，请重新登录", ErrorCodeConstants.BAD_REQUEST);
        }
        try {
            LoginChallengePayload payload = objectMapper.readValue(rawValue, LoginChallengePayload.class);
            return new PendingLoginChallenge(token, rawValue, payload);
        } catch (Exception ex) {
            redisTemplate.delete(CHALLENGE_KEY_PREFIX + token);
            throw new ServiceException("登录验证凭证无效，请重新登录", ErrorCodeConstants.BAD_REQUEST);
        }
    }

    public void consumeLoginChallenge(PendingLoginChallenge challenge) {
        Long consumed = redisTemplate.execute(
                CONSUME_SCRIPT,
                List.of(CHALLENGE_KEY_PREFIX + challenge.token()),
                challenge.rawValue()
        );
        if (!Long.valueOf(1L).equals(consumed)) {
            throw new ServiceException("登录验证已过期，请重新登录", ErrorCodeConstants.BAD_REQUEST);
        }
    }

    /**
     * 验证失败时丢弃凭证，强制重新登录。
     * 与 {@link #consumeLoginChallenge} 的差别：这里不关心删除结果，
     * 不能因为凭证已过期就把「验证码错误」盖成别的错误。
     */
    public void discardLoginChallenge(PendingLoginChallenge challenge) {
        redisTemplate.execute(
                CONSUME_SCRIPT,
                List.of(CHALLENGE_KEY_PREFIX + challenge.token()),
                challenge.rawValue()
        );
    }

    /**
     * 返回验证码匹配到的时间步，不匹配则返回 null。
     * 调用方拿到步长后必须走 {@link #consumeStep} 原子写回，否则同一个码在容忍窗口内可重放。
     */
    private Long matchStep(String secret, String code, Instant instant) {
        if (!StringUtils.hasText(secret) || !StringUtils.hasText(code) || !code.matches("\\d{6}")) {
            return null;
        }
        try {
            byte[] secretBytes = Base32.decode(secret);
            long currentStep = instant.getEpochSecond() / TIME_STEP_SECONDS;
            for (long drift = -ALLOWED_TIME_DRIFT_STEPS; drift <= ALLOWED_TIME_DRIFT_STEPS; drift++) {
                long step = currentStep + drift;
                String expected = generateCode(secretBytes, step);
                if (MessageDigest.isEqual(
                        expected.getBytes(StandardCharsets.US_ASCII),
                        code.getBytes(StandardCharsets.US_ASCII)
                )) {
                    return step;
                }
            }
            return null;
        } catch (Exception ex) {
            throw new ServiceException("动态验证码校验失败", ErrorCodeConstants.INTERNAL_SERVER_ERROR, ex);
        }
    }

    /**
     * 把本次用掉的时间步写回，条件更新保证同一步长只能消费一次。
     * 并发下两个请求带同一个码时，只有一个能更新成功。
     */
    private boolean consumeStep(Long recordId, long step) {
        Integer affected = TenantBroker.applyWithoutTenant(ignored -> totpMapper.update(
                null,
                new LambdaUpdateWrapper<SysUserTotp>()
                        .eq(SysUserTotp::getId, recordId)
                        .and(wrapper -> wrapper
                                .isNull(SysUserTotp::getLastUsedStep)
                                .or()
                                .lt(SysUserTotp::getLastUsedStep, step))
                        .set(SysUserTotp::getLastUsedStep, step)
                        .set(SysUserTotp::getUpdateTime, LocalDateTime.now())
        ));
        return affected != null && affected > 0;
    }

    private String generateCode(byte[] secret, long counter) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(secret, "HmacSHA1"));
        byte[] digest = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(counter).array());
        int offset = digest[digest.length - 1] & 0x0f;
        int binary = ((digest[offset] & 0x7f) << 24)
                | ((digest[offset + 1] & 0xff) << 16)
                | ((digest[offset + 2] & 0xff) << 8)
                | (digest[offset + 3] & 0xff);
        int otp = binary % (int) Math.pow(10, CODE_DIGITS);
        return String.format(Locale.ROOT, "%06d", otp);
    }

    private SysUserTotp findRecord(Long userId, Long tenantId) {
        return TenantBroker.applyWithoutTenant(ignored -> totpMapper.selectOne(
                new LambdaQueryWrapper<SysUserTotp>()
                        .eq(SysUserTotp::getUserId, userId)
                        .eq(SysUserTotp::getTenantId, tenantId)
        ));
    }

    private SysUserTotp requireRecord(Long userId, Long tenantId) {
        secretCipher.assertAvailable();
        SysUserTotp record = findRecord(userId, tenantId);
        if (record == null) {
            throw new ServiceException("请先设置双因素认证", ErrorCodeConstants.CONFLICT);
        }
        return record;
    }

    private void assertFeatureEnabled() {
        if (!properties.isEnabled()) {
            throw new ServiceException("双因素认证功能未开启", ErrorCodeConstants.CONFLICT);
        }
    }

    private String buildOtpAuthUri(SysUser user, String secret) {
        String issuer = StringUtils.hasText(properties.getIssuer()) ? properties.getIssuer().trim() : "CloudFlow Pro";
        String account = StringUtils.hasText(user.getEmail()) ? user.getEmail().trim() : user.getUserName();
        return "otpauth://totp/" + encodeUriComponent(issuer + ":" + account)
                + "?secret=" + secret
                + "&issuer=" + encodeUriComponent(issuer)
                + "&algorithm=SHA1&digits=6&period=30";
    }

    private String encodeUriComponent(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private long normalizedChallengeTtl() {
        return Math.max(60L, Math.min(properties.getChallengeTtlSeconds(), 600L));
    }

    public record LoginChallengePayload(Long userId, Long tenantId, String legalReleaseCode, long startedAt) {
    }

    public record PendingLoginChallenge(String token, String rawValue, LoginChallengePayload payload) {
    }
}
