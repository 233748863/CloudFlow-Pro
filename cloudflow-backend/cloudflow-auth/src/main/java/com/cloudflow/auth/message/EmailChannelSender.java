package com.cloudflow.auth.message;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.ChannelTestContext;
import com.cloudflow.common.message.channel.ChannelTestResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessageSecretCipher;
import jakarta.mail.AuthenticationFailedException;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.Transport;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Properties;
import lombok.RequiredArgsConstructor;
import org.eclipse.angus.mail.smtp.SMTPAddressFailedException;
import org.eclipse.angus.mail.smtp.SMTPSendFailedException;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class EmailChannelSender implements MessageChannelSender {
    private final SysMessageChannelMapper channels;
    private final SysUserMapper users;
    private final MessageSecretCipher cipher;
    private final SmtpEndpointPolicy endpoints;

    @Override
    public MessageChannelType channelType() { return MessageChannelType.EMAIL; }

    @Override
    public boolean implemented() { return true; }

    @Override
    public ChannelSendResult send(ChannelSendContext context) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("SMTP事务边界无效");
        JavaMailSenderImpl sender;
        MimeMessage message;
        String messageId;
        try {
            if (context == null || context.getDeliveryId() == null || context.getRecordId() == null) {
                return ChannelSendResult.failed("DELIVERY_REQUIRED");
            }
            SysMessageChannel channel = channel(context.getTenantId(), context.getChannelId());
            sender = sender(channel);
            if (context.getParams() != null && List.of("attachments", "fileIds").stream()
                    .anyMatch(context.getParams()::containsKey)) return ChannelSendResult.failed("ATTACHMENT_SOURCE_REQUIRED");
            Object fileIds = context.getParams() == null ? null : context.getParams().get("attachmentIds");
            List<MessageAttachment> attachments = context.getAttachments() == null ? List.<com.cloudflow.common.message.api.MessageAttachment>of() : context.getAttachments();
            List<String> expectedIds = fileIds instanceof List<?> values ? values.stream().map(String::valueOf).toList() : List.of();
            if (fileIds != null && !(fileIds instanceof List<?>) || expectedIds.size() != attachments.size()
                    || attachments.size() > 10 || attachments.stream().anyMatch(file -> file == null || file.fileId() == null || file.content() == null)
                    || !expectedIds.equals(attachments.stream().map(file -> String.valueOf(file.fileId())).toList())
                    || attachments.stream().mapToLong(file -> file.content().length).sum() > 10 * 1024 * 1024) {
                return ChannelSendResult.failed("ATTACHMENT_SOURCE_REQUIRED");
            }
            String recipient = recipient(context);
            String from = MessageEmailAddress.normalize(channel.getFromAddress());
            Object requiredFrom = context.getParams() == null ? null : context.getParams().get("mailFromAddress");
            if (requiredFrom != null && !from.equals(MessageEmailAddress.normalize(requiredFrom.toString()))) {
                return ChannelSendResult.failed("MAIL_SENDER_CHANGED");
            }
            Object requestedName = context.getParams() == null ? null : context.getParams().get("mailFromName");
            String fromName = requestedName == null ? channel.getFromName() : requestedName.toString();
            checkHeader(context.getTitle());
            checkHeader(fromName);
            if (fromName != null && fromName.length() > 120) return ChannelSendResult.failed("MAIL_HEADER_INVALID");
            String domain = from.substring(from.lastIndexOf('@') + 1);
            messageId = "<cloudflow-" + context.getTenantId() + "-" + context.getDeliveryId() + "@" + domain + ">";
            message = new StableMimeMessage(sender.getSession(), messageId);
            message.setFrom(new InternetAddress(from, fromName, StandardCharsets.UTF_8.name()));
            message.setRecipient(jakarta.mail.Message.RecipientType.TO, new InternetAddress(recipient));
            Object replyTo = context.getParams() == null ? null : context.getParams().get("mailReplyTo");
            if (replyTo != null) message.setReplyTo(new InternetAddress[]{new InternetAddress(MessageEmailAddress.normalize(replyTo.toString()))});
            message.setSubject(context.getTitle() == null ? "消息通知" : context.getTitle(), StandardCharsets.UTF_8.name());
            String html = MessageHtmlSanitizer.clean(context.getContent());
            MimeMessageHelper helper = new org.springframework.mail.javamail.MimeMessageHelper(message,
                    attachments.isEmpty() ? org.springframework.mail.javamail.MimeMessageHelper.MULTIPART_MODE_NO
                            : org.springframework.mail.javamail.MimeMessageHelper.MULTIPART_MODE_MIXED, StandardCharsets.UTF_8.name());
            helper.setText(html, true);
            for (MessageAttachment attachment : attachments) {
                checkHeader(attachment.fileName());
                if (attachment.fileName() == null || attachment.fileName().length() > 255
                        || attachment.fileName().contains("/") || attachment.fileName().contains("\\")
                        || !List.of("application/pdf", "image/png", "image/jpeg").contains(attachment.contentType())) {
                    return ChannelSendResult.failed("ATTACHMENT_TYPE_INVALID");
                }
                helper.addAttachment(attachment.fileName(), new org.springframework.core.io.ByteArrayResource(attachment.content()), attachment.contentType());
            }
            message.setSentDate(new java.util.Date());
            message.saveChanges();
        } catch (RuntimeException | MessagingException | java.io.UnsupportedEncodingException failure) {
            return ChannelSendResult.failed("SMTP_CONFIGURATION_INVALID");
        }
        Transport transport = null;
        boolean sending = false;
        try {
            transport = sender.getSession().getTransport("smtp");
            transport.connect(sender.getHost(), sender.getPort(), sender.getUsername(), sender.getPassword());
            sending = true;
            transport.sendMessage(message, message.getAllRecipients());
            return ChannelSendResult.accepted(messageId);
        } catch (AuthenticationFailedException failure) {
            return ChannelSendResult.failed("SMTP_AUTHENTICATION_FAILED");
        } catch (MessagingException failure) {
            ChannelSendResult refusal = explicitRefusal(failure);
            if (refusal != null) return refusal;
            return sending ? ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN")
                    : ChannelSendResult.retryable("SMTP_CONNECT_FAILED");
        } catch (RuntimeException failure) {
            return sending ? ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN")
                    : ChannelSendResult.retryable("SMTP_CONNECT_FAILED");
        } finally {
            if (transport != null) {
                try { transport.close(); } catch (MessagingException ignored) { }
            }
        }
    }

    @Override
    public ChannelTestResult test(ChannelTestContext context) {
        try {
            if (TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("SMTP事务边界无效");
            sender(channel(context.getTenantId(), context.getChannelId())).testConnection();
            return ChannelTestResult.builder().success(true).message("SMTP认证连接成功；未发送业务邮件").build();
        } catch (Exception failure) {
            return ChannelTestResult.builder().success(false).message("SMTP连接失败，请核对启用状态、TLS、部署白名单及凭据").build();
        }
    }

    public boolean configured(SysMessageChannel channel) {
        try {
            sender(channel);
            MessageEmailAddress.normalize(channel.getFromAddress());
            checkHeader(channel.getFromName());
            return true;
        } catch (RuntimeException failure) { return false; }
    }

    private SysMessageChannel channel(Long tenantId, Long channelId) {
        SysMessageChannel channel = channels.selectOne(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, tenantId).eq(SysMessageChannel::getChannelId, channelId)
                .eq(SysMessageChannel::getChannelType, "EMAIL").eq(SysMessageChannel::getDeleted, 0)
                .eq(SysMessageChannel::getStatus, "ENABLED"));
        if (channel == null) throw new IllegalArgumentException("SMTP_CHANNEL_DISABLED");
        return channel;
    }

    private String recipient(ChannelSendContext context) {
        if (context.getReceiver() == null) throw new IllegalArgumentException("MAIL_RECEIVER_MISSING");
        if (context.getReceiver().getReceiverId() == null) return MessageEmailAddress.normalize(context.getReceiver().getReceiverAddress());
        SysUser user = users.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getTenantId, context.getTenantId())
                .eq(SysUser::getUserId, context.getReceiver().getReceiverId()).eq(SysUser::getStatus, "0").eq(SysUser::getDeleted, 0));
        if (user == null) throw new IllegalArgumentException("MAIL_RECEIVER_UNAVAILABLE");
        return MessageEmailAddress.normalize(user.getEmail());
    }

    private JavaMailSenderImpl sender(SysMessageChannel channel) {
        if (!StringUtils.hasText(channel.getSmtpUsername()) || !StringUtils.hasText(channel.getSmtpPwdCipher())) {
            throw new IllegalArgumentException("SMTP_CREDENTIALS_REQUIRED");
        }
        SmtpEndpointPolicy.Endpoint target = endpoints.verify(channel.getSmtpHost(), channel.getSmtpPort());
        boolean implicit = Integer.valueOf(1).equals(channel.getSmtpSslFlag());
        if (target.port() == 465 && !implicit || target.port() == 587 && implicit) throw new IllegalArgumentException("SMTP_TLS_MODE_INVALID");
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(target.host());
        sender.setPort(target.port());
        sender.setProtocol("smtp");
        sender.setUsername(channel.getSmtpUsername());
        sender.setPassword(cipher.decrypt(channel.getSmtpPwdCipher()));
        sender.setDefaultEncoding(StandardCharsets.UTF_8.name());
        Properties properties = new Properties();
        properties.setProperty("mail.debug", "false");
        properties.setProperty("mail.smtp.auth", "true");
        properties.setProperty("mail.smtp.connectiontimeout", "5000");
        properties.setProperty("mail.smtp.timeout", "10000");
        properties.setProperty("mail.smtp.writetimeout", "10000");
        properties.setProperty("mail.smtp.ssl.enable", Boolean.toString(implicit));
        properties.setProperty("mail.smtp.starttls.enable", Boolean.toString(!implicit));
        properties.setProperty("mail.smtp.starttls.required", Boolean.toString(!implicit));
        properties.setProperty("mail.smtp.ssl.checkserveridentity", "true");
        properties.setProperty("mail.smtp.ssl.protocols", "TLSv1.2 TLSv1.3");
        properties.setProperty("mail.smtp.sendpartial", "false");
        properties.setProperty("mail.smtp.quitwait", "false");
        properties.setProperty("mail.smtp.socketFactory.fallback", "false");
        properties.put("mail.smtp.socketFactory", target.socketFactory());
        sender.setJavaMailProperties(properties);
        return sender;
    }

    private ChannelSendResult explicitRefusal(MessagingException failure) {
        Exception current = failure;
        for (int depth = 0; current != null && depth < 8; depth++) {
            int code = current instanceof SMTPAddressFailedException address ? address.getReturnCode()
                    : current instanceof SMTPSendFailedException send ? send.getReturnCode() : 0;
            if (code >= 400 && code <= 499) return ChannelSendResult.retryable("SMTP_REJECTED_" + code);
            if (code >= 500 && code <= 599) return ChannelSendResult.failed("SMTP_REJECTED_" + code);
            current = current instanceof MessagingException message ? message.getNextException() : null;
        }
        return null;
    }

    private void checkHeader(String value) {
        if (value != null && value.chars().anyMatch(character -> character < 32 || character == 127)) {
            throw new IllegalArgumentException("MAIL_HEADER_INVALID");
        }
    }

    private static final class StableMimeMessage extends MimeMessage {
        private final String messageId;

        private StableMimeMessage(Session session, String messageId) {
            super(session);
            this.messageId = messageId;
        }

        @Override
        protected void updateMessageID() throws MessagingException { setHeader("Message-ID", messageId); }
    }
}
