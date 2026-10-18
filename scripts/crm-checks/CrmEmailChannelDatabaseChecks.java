package com.cloudflow.crm.service.email;

import com.cloudflow.auth.domain.dto.MessageChannelDTO;
import com.cloudflow.auth.domain.vo.SysMessageChannelVO;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.message.EmailChannelSender;
import com.cloudflow.auth.message.SmtpEndpointPolicy;
import com.cloudflow.auth.service.impl.MessageChannelServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.JsonNode;
import java.lang.reflect.Field;
import java.net.InetAddress;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import org.springframework.beans.BeanUtils;
import org.springframework.util.ReflectionUtils;

final class CrmEmailChannelDatabaseChecks {
    static void run(CrmEmailDatabaseChecks suite) throws Exception {
        suite.identity(1L);
        String addresses = Arrays.stream(InetAddress.getAllByName("localhost")).map(InetAddress::getHostAddress)
                .collect(java.util.stream.Collectors.joining(","));
        EmailChannelSender email = new EmailChannelSender(suite.mapper(SysMessageChannelMapper.class), suite.mapper(SysUserMapper.class),
                suite.cipher, new SmtpEndpointPolicy("localhost", addresses, String.valueOf(suite.smtp.port())));
        MessageChannelServiceImpl target = new MessageChannelServiceImpl(suite.cipher, new MessageChannelSenderFactory(List.of(email)),
                suite.mapper(com.cloudflow.common.audit.mapper.SysAuditLogMapper.class));
        Field mapperField = ReflectionUtils.findField(MessageChannelServiceImpl.class, "baseMapper");
        if (mapperField == null) throw new IllegalStateException("Production channel mapper field missing");
        ReflectionUtils.makeAccessible(mapperField);
        ReflectionUtils.setField(mapperField, target, suite.mapper(SysMessageChannelMapper.class));
        MessageChannelServiceImpl channels = suite.proxied(target);
        SysMessageChannelVO original = channels.get(100L);
        JsonNode publicView = suite.json.valueToTree(original);
        suite.check(!"sender@example.com".equals(publicView.path("fromAddress").asText()), "readonly channel view keeps sender masked");
        suite.check(!publicView.toString().contains("fixture-password"), "public channel view never contains full SMTP password");
        MessageChannelDTO request = new MessageChannelDTO();
        BeanUtils.copyProperties(original, request);
        request.setFromAddress(publicView.path("fromAddress").asText());
        request.setRateLimitMinute(1);
        String secret = suite.jdbc.queryForObject("SELECT smtp_pwd_cipher FROM sys_message_channel WHERE channel_id=100", String.class);
        channels.edit(request);
        suite.equal("sender@example.com", suite.jdbc.queryForObject("SELECT from_address FROM sys_message_channel WHERE channel_id=100", String.class),
                "legacy masked sender roundtrip retains actual address");
        suite.check(Objects.equals(secret, suite.jdbc.queryForObject("SELECT smtp_pwd_cipher FROM sys_message_channel WHERE channel_id=100", String.class)),
                "rate change retains exact encrypted credential");
        suite.equal(1L, suite.scalar("SELECT rate_limit_minute FROM sys_message_channel WHERE channel_id=100"), "rate limit actually changes in database");
        request.setFromAddress(null);
        request.setRateLimitMinute(2);
        channels.edit(request);
        suite.equal("sender@example.com", channels.get(100L).getFromAddress(), "omitted sender retains stored address");
        String beforeInvalid = suite.json.writeValueAsString(suite.jdbc.queryForMap("SELECT * FROM sys_message_channel WHERE channel_id=100"));
        for (String invalid : List.of("changed***", "malformed", "sender@example.com\r\nBcc: leaked@example.com",
                "first@example.com,second@example.com", "a".repeat(190) + "@example.com")) {
            request.setFromAddress(invalid);
            request.setRateLimitMinute(3);
            suite.rejects(() -> channels.edit(request), "invalid edited sender is rejected");
            suite.check(beforeInvalid.equals(suite.json.writeValueAsString(suite.jdbc.queryForMap("SELECT * FROM sys_message_channel WHERE channel_id=100"))),
                    "rejected sender leaves full stored channel unchanged");
        }
        request.setFromAddress("replacement@EXAMPLE.COM");
        request.setRateLimitMinute(null);
        channels.edit(request);
        suite.equal("replacement@example.com", channels.get(100L).getFromAddress(), "explicit sender replacement saves normalized address");
        suite.check(channels.test(100L, null).isSuccess(), "updated channel completes actual TLS authentication");
        request.setFromAddress("");
        channels.edit(request);
        suite.equal(null, channels.get(100L).getFromAddress(), "explicit empty sender clears configuration");
        request.setFromAddress("sender@example.com");
        channels.edit(request);
        suite.equal("sender@example.com", channels.get(100L).getFromAddress(), "sender can be configured again after explicit clear");
        TenantContext.setTenantId(CrmEmailDatabaseChecks.TENANT + 1);
        UserContext.setTenantId(CrmEmailDatabaseChecks.TENANT + 1);
        try {
            suite.rejects(() -> channels.get(100L), "foreign tenant cannot read retained channel");
            suite.rejects(() -> channels.edit(request), "foreign tenant cannot change retained sender");
        } finally {
            suite.identity(1L);
        }
        suite.equal("sender@example.com", channels.get(100L).getFromAddress(), "foreign edit rejection preserves sender");
        MessageChannelDTO invalidNew = new MessageChannelDTO();
        invalidNew.setChannelType("EMAIL");
        invalidNew.setChannelCode("e5-invalid-new-sender");
        invalidNew.setChannelName("Invalid new sender");
        invalidNew.setFromAddress("sender***");
        suite.rejects(() -> channels.add(invalidNew), "invalid new sender is rejected");
        suite.equal(0L, suite.scalar("SELECT COUNT(*) FROM sys_message_channel WHERE channel_code='e5-invalid-new-sender'"), "invalid new sender creates no channel");
        suite.identity(10L);
        System.out.println("E5_CHANNEL_DATABASE: retained_sender=true; actual_tls=true; invalid_senders_rejected=true; tenant_isolation=true");
    }
}
