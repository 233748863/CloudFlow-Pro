package com.cloudflow.auth.message;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.domain.SysMessageSubscribe;
import com.cloudflow.auth.domain.SysMessageTemplate;
import com.cloudflow.auth.domain.SysDept;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserRole;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.mapper.SysMessageSubscribeMapper;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.mapper.SysDeptMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserRoleMapper;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.util.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * auth 侧消息事件消费与站内投递服务。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MessageDispatchService {
    private static final int DEFAULT_RECEIVER_EXPAND_LIMIT = 500;
    private static final DefaultRedisScript<Long> QUOTA_SCRIPT = new DefaultRedisScript<>(
            "local n=redis.call('INCR',KEYS[1]); "
                    + "if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[2]); end; "
                    + "if n>tonumber(ARGV[1]) then return 0 else return n end",
            Long.class);

    private final ObjectMapper objectMapper;
    private final SysMessageChannelMapper channelMapper;
    private final SysMessageTemplateMapper templateMapper;
    private final SysMessageRecordMapper recordMapper;
    private final SysMessageSubscribeMapper subscribeMapper;
    private final SysUserMapper userMapper;
    private final SysUserRoleMapper userRoleMapper;
    private final SysDeptMapper deptMapper;
    private final MessageChannelSenderFactory senderFactory;
    private final MessageSecretCipher secretCipher;
    private final MessageSender messageSender;
    private final StringRedisTemplate redisTemplate;
    private final MessageDeliveryService deliveryService;
    private final PlatformTransactionManager transactionManager;

    @Value("${cloudflow.message.receiver-expand-limit:500}")
    private int receiverExpandLimit = DEFAULT_RECEIVER_EXPAND_LIMIT;

    /**
     * 消费 MESSAGE_SEND 事件。每个接收人和渠道独立生成一条幂等记录。
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public DispatchResult dispatch(BusinessEventEnvelope envelope) throws Exception {
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        DispatchResult prepared;
        try {
            prepared = transaction.execute(status -> stage(envelope));
        } catch (DuplicateKeyException collision) {
            prepared = transaction.execute(status -> stage(envelope));
        }
        if (prepared == null) throw new ServiceException("消息占位事务未完成", 500);
        List<SysMessageRecord> completed = new ArrayList<>();
        for (SysMessageRecord record : prepared.records()) {
            if (deliveryService.findByRecord(record.getTenantId(), record.getRecordId()) != null) {
                completed.add(deliveryService.deliverRecord(record.getTenantId(), record.getRecordId()));
            } else {
                completed.add(record);
            }
        }
        return resultOf(completed, prepared.delayed(), prepared.message());
    }

    private DispatchResult stage(BusinessEventEnvelope envelope) {
        if (envelope == null || !StringUtils.hasText(envelope.getPayload())) {
            throw new ServiceException("消息事件负载不能为空");
        }
        if (!StringUtils.hasText(envelope.getEventId())) envelope.setEventId(UUID.randomUUID().toString());
        if (envelope.getTenantId() == null) {
            Long tenantId = com.cloudflow.common.core.context.UserContext.getTenantId();
            if (tenantId == null) tenantId = com.cloudflow.common.tenant.TenantContext.getTenantId();
            envelope.setTenantId(tenantId == null ? 100000L : tenantId);
        }
        MessageSendRequest request = MessagePayloadCodec.decode(envelope, objectMapper, secretCipher);
        if (request == null) throw new ServiceException("消息请求不能为空");
        if (!StringUtils.hasText(request.getTraceId())) request.setTraceId(envelope.getEventId());
        List<MessageReceiver> receivers;
        try {
            receivers = expandReceivers(request.safeReceivers(), envelope.getTenantId());
        } catch (ReceiverExpansionException e) {
            List<SysMessageRecord> failures = new ArrayList<>();
            MessageReceiver receiver = e.getReceiver() == null
                    ? MessageReceiver.builder().receiverType("GROUP").receiverName("接收人组").build()
                    : e.getReceiver();
            for (MessageChannelType channelType : request.safeChannelTypes()) {
                SysMessageRecord existing = findExistingRecord(envelope.getTenantId(), envelope.getEventId(),
                        channelType, receiver);
                if (existing != null) {
                    failures.add(existing);
                } else {
                    SysMessageTemplate template = findTemplate(envelope.getTenantId(), request.getTemplateCode(), channelType);
                    failures.add(insertRecord(envelope, request, channelType, receiver, template, null,
                            "FAILED", null, e.getMessage(), null, null));
                }
            }
            return resultOf(failures, false, e.getMessage());
        }
        if (receivers.isEmpty()) {
            return new DispatchResult(false, false, null, "接收人不能为空", List.of());
        }
        List<SysMessageRecord> records = new ArrayList<>();
        boolean delayed = false;
        String delayedReason = null;
        for (MessageChannelType channelType : request.safeChannelTypes()) {
            for (MessageReceiver receiver : receivers) {
                DispatchOneResult one = dispatchOne(envelope, request, channelType, receiver);
                if (one.record() != null) records.add(one.record());
                if (one.delayed()) {
                    delayed = true;
                    delayedReason = one.message();
                }
            }
        }
        return resultOf(records, delayed, delayedReason);
    }

    private DispatchOneResult dispatchOne(BusinessEventEnvelope envelope, MessageSendRequest request,
                                          MessageChannelType channelType, MessageReceiver receiver) {
        if (channelType != MessageChannelType.INTERNAL || "OA_MEETING_NOTICE".equals(request.getBizType()) || "CRM_OPPORTUNITY_STAGE_NOTICE".equals(request.getBizType()) || "CRM_ACTIVITY".equals(request.getBizType())) {
            SysMessageRecord record = deliveryService.reserve(envelope, request, channelType, receiver);
            return new DispatchOneResult(record, "PENDING".equals(record.getSendStatus()), "消息已登记，尚未发送");
        }
        Long tenantId = envelope.getTenantId();
        SysMessageRecord existing = findExistingRecord(tenantId, envelope.getEventId(), channelType, receiver);
        if (existing != null) {
            return new DispatchOneResult(existing, false, "消息已处理");
        }
        SysMessageTemplate template = findTemplate(tenantId, request.getTemplateCode(), channelType);
        boolean directContent = StringUtils.hasText(request.getContent())
                && (template == null || Boolean.TRUE.equals(request.getRenderedContent()));
        if (template == null && !directContent) {
            return new DispatchOneResult(insertRecord(envelope, request, channelType, receiver, null, null,
                    "FAILED", null, "模板不存在或已停用", null, null), false, "模板不存在或已停用");
        }

        String category = template != null && StringUtils.hasText(template.getMessageCategory())
                ? template.getMessageCategory() : category(request);
        boolean force = Boolean.TRUE.equals(request.getForceSend())
                || template != null && Integer.valueOf(1).equals(template.getForceSendFlag());
        Map<String, Object> params = request.safeParams();
        String title = directContent ? request.getTitle() : render(template.getTitleTemplate(), params);
        String content = directContent ? request.getContent() : render(template.getContentTemplate(), params);
        String linkTemplate = StringUtils.hasText(request.getLinkUrl())
                ? request.getLinkUrl() : template == null ? null : template.getLinkUrlTemplate();
        String linkUrl = render(linkTemplate, params);
        if (!StringUtils.hasText(linkUrl)) {
            linkUrl = null;
        }
        if (template != null && !directContent) {
            String missing = missingRequiredParams(template.getParamsDeclare(), params);
            if (missing != null) {
                String error = "缺失参数: " + missing;
                return new DispatchOneResult(insertRecord(envelope, request, channelType, receiver, template, null,
                        "FAILED", null, error, title, content), false, error);
            }
        }

        List<SysMessageChannel> channels = findChannels(tenantId, channelType);
        MessageChannelSender sender = senderFactory.get(channelType);
        if (channels.isEmpty()) {
            return new DispatchOneResult(insertRecord(envelope, request, channelType, receiver, template, null,
                    "SKIPPED", "NO_CHANNEL", null, title, content), false, "渠道未配置");
        }
        List<SysMessageChannel> usableChannels = channels.stream()
                .filter(channel -> Integer.valueOf(1).equals(channel.getImplementedFlag()))
                .toList();
        if (sender == null || !sender.implemented() || usableChannels.isEmpty()) {
            return new DispatchOneResult(insertRecord(envelope, request, channelType, receiver, template,
                    channels.get(0), "FAILED", null, "NOT_IMPLEMENTED", title, content), false, "渠道未实现");
        }
        if (receiver.getReceiverId() != null && !force && !isSubscribed(tenantId, receiver.getReceiverId(), category, channelType)) {
            return new DispatchOneResult(insertRecord(envelope, request, channelType, receiver, template,
                    usableChannels.get(0), "SKIPPED", "UNSUBSCRIBED", null, title, content), false, "用户已关闭订阅");
        }
        LocalDateTime quietUntil = receiver.getReceiverId() == null || force ? null
                : quietUntil(tenantId, receiver.getReceiverId(), category, channelType);
        if (quietUntil != null) {
            schedule(request, channelType, receiver, quietUntil, retryAttempt(request));
            return new DispatchOneResult(null, true, "消息处于免打扰时段，已延迟发送");
        }
        int dedupeSeconds = template == null || template.getDedupeWindowSec() == null
                ? 0 : template.getDedupeWindowSec();
        if (dedupeSeconds > 0 && !force && retryAttempt(request) == 0
                && !hasStableEventIdentity(envelope, request)
                && isDuplicated(tenantId, request.getTemplateCode(), channelType,
                receiver, request.getBizId(), dedupeSeconds)) {
            return new DispatchOneResult(insertRecord(envelope, request, channelType, receiver, template,
                    usableChannels.get(0), "SKIPPED", "DEDUPED", null, title, content), false, "重复消息已跳过");
        }

        SysMessageRecord record = null;
        String lastError = "渠道发送失败";
        LocalDateTime earliestQuotaRetry = null;
        boolean attempted = false;
        for (SysMessageChannel channel : usableChannels) {
            QuotaDecision quota = acquireQuota(channel);
            if (!quota.allowed()) {
                earliestQuotaRetry = earlier(earliestQuotaRetry, quota.retryAt());
                continue;
            }
            attempted = true;
            if (record == null) {
                record = insertRecord(envelope, request, channelType, receiver, template,
                        channel, "SENDING", null, null, title, content);
            }
            record.setChannelId(channel.getChannelId());
            ChannelSendResult result;
            try {
                result = sender.send(ChannelSendContext.builder()
                        .recordId(record.getRecordId()).channelId(channel.getChannelId())
                        .tenantId(envelope.getTenantId()).messageCategory(category)
                        .title(title).content(content).receiver(receiver).params(params)
                        .linkUrl(linkUrl).build());
            } catch (RuntimeException e) {
                result = ChannelSendResult.failed("渠道发送失败");
            }
            if (result == null) result = ChannelSendResult.failed("渠道未返回发送结果");
            if (result.isSuccess()) {
                record.setSendStatus("SUCCESS");
                record.setSendTime(LocalDateTime.now());
                record.setUpdateTime(LocalDateTime.now());
                recordMapper.updateById(record);
                return new DispatchOneResult(record, false, "消息已发送");
            }
            if (!result.isImplemented()) {
                record.setSendStatus("FAILED");
                record.setSkipReason(null);
                record.setErrorMsg("NOT_IMPLEMENTED");
                record.setSendTime(LocalDateTime.now());
                record.setUpdateTime(LocalDateTime.now());
                recordMapper.updateById(record);
                return new DispatchOneResult(record, false, "渠道未实现");
            }
            if (StringUtils.hasText(result.getErrorMessage())) {
                lastError = result.getErrorMessage();
            }
        }
        if (!attempted && earliestQuotaRetry != null) {
            schedule(request, channelType, receiver, earliestQuotaRetry, retryAttempt(request));
            return new DispatchOneResult(null, true, "渠道达到发送上限，已延迟发送");
        }
        if (record == null) {
            return new DispatchOneResult(insertRecord(envelope, request, channelType, receiver, template,
                    usableChannels.get(0), "FAILED", null, lastError, title, content), false, lastError);
        }
        record.setSendStatus("FAILED");
        record.setErrorMsg(truncate(lastError, 1000));
        record.setRetryCount(retryAttempt(request));
        record.setSendTime(LocalDateTime.now());
        record.setUpdateTime(LocalDateTime.now());
        recordMapper.updateById(record);
        int maxRetry = usableChannels.stream()
                .map(SysMessageChannel::getRetryCount).filter(Objects::nonNull).max(Integer::compareTo).orElse(0);
        int currentRetry = retryAttempt(request);
        if (currentRetry < maxRetry) {
            int retryDelay = usableChannels.stream().map(SysMessageChannel::getRetryIntervalSec)
                    .filter(Objects::nonNull).filter(value -> value > 0).min(Integer::compareTo).orElse(60);
            LocalDateTime retryAt = LocalDateTime.now().plusSeconds(retryDelay);
            if (earliestQuotaRetry != null && earliestQuotaRetry.isAfter(retryAt)) retryAt = earliestQuotaRetry;
            schedule(request, channelType, receiver, retryAt, currentRetry + 1);
            return new DispatchOneResult(record, true, "渠道发送失败，已安排重试");
        }
        return new DispatchOneResult(record, false, lastError);
    }

    private SysMessageRecord insertRecord(BusinessEventEnvelope envelope, MessageSendRequest request,
                                          MessageChannelType channelType, MessageReceiver receiver,
                                          SysMessageTemplate template, SysMessageChannel channel,
                                          String status, String skipReason,
                                          String error, String title, String content) {
        SysMessageRecord record = new SysMessageRecord();
        record.setTenantId(envelope.getTenantId());
        record.setTraceId(truncate(StringUtils.hasText(request.getTraceId())
                ? request.getTraceId() : envelope.getEventId(), 64));
        record.setTemplateCode(truncate(request.getTemplateCode(), 100));
        record.setChannelType(channelType.name());
        record.setReceiverType(normalizedReceiverType(receiver));
        record.setReceiverId(receiver.getReceiverId());
        if (StringUtils.hasText(receiver.getReceiverAddress())) {
            record.setReceiverAddrMask(secretCipher.maskAddress(receiver.getReceiverAddress()));
            record.setReceiverAddrCipher(secretCipher.encrypt(receiver.getReceiverAddress()));
        }
        record.setChannelId(channel == null ? null : channel.getChannelId());
        record.setReceiverName(truncate(receiver.getReceiverName(), 100));
        record.setTitle(truncate(title, 500));
        record.setContent(content);
        record.setMessageCategory(template != null && StringUtils.hasText(template.getMessageCategory())
                ? template.getMessageCategory() : category(request));
        record.setBizType(truncate(request.getBizType(), 50));
        record.setBizId(truncate(request.getBizId(), 64));
        String linkTemplate = StringUtils.hasText(request.getLinkUrl())
                ? request.getLinkUrl() : template == null ? null : template.getLinkUrlTemplate();
        record.setLinkUrl(render(linkTemplate, request.safeParams()));
        if (!StringUtils.hasText(record.getLinkUrl())) {
            record.setLinkUrl(null);
        } else {
            record.setLinkUrl(truncate(record.getLinkUrl(), 500));
        }
        record.setSendStatus(status);
        record.setSkipReason(skipReason);
        record.setRetryCount(retryAttempt(request));
        record.setErrorMsg(truncate(error, 1000));
        record.setReadFlag(0);
        record.setOutboxEventId(envelope.getEventId());
        record.setResendFromId(request.getResendFromId());
        Object senderName = request.safeParams().get("senderName");
        String auditUser = senderName == null || !StringUtils.hasText(String.valueOf(senderName))
                ? "system" : String.valueOf(senderName);
        auditUser = truncate(auditUser, 64);
        record.setCreateBy(auditUser);
        record.setUpdateBy(auditUser);
        record.setCreateTime(LocalDateTime.now());
        record.setUpdateTime(record.getCreateTime());
        if ("SUCCESS".equals(status) || "SKIPPED".equals(status) || "FAILED".equals(status)) {
            record.setSendTime(record.getCreateTime());
        }
        recordMapper.insert(record);
        return record;
    }

    private List<MessageReceiver> expandReceivers(List<MessageReceiver> source, Long tenantId) {
        Map<String, MessageReceiver> result = new LinkedHashMap<>();
        int expandLimit = Math.max(1, receiverExpandLimit);
        for (MessageReceiver receiver : source) {
            if (receiver == null) continue;
            String type = receiver.getReceiverType() == null ? "USER" : receiver.getReceiverType().toUpperCase(Locale.ROOT);
            if ("USER".equals(type)) {
                if (receiver.getReceiverId() == null) continue;
                putReceiver(result, receiver, expandLimit, receiver);
            } else if ("ROLE".equals(type) && receiver.getReceiverId() != null) {
                List<SysUserRole> links = userRoleMapper.selectList(new LambdaQueryWrapper<SysUserRole>()
                        .eq(SysUserRole::getRoleId, receiver.getReceiverId())
                        .eq(SysUserRole::getTenantId, tenantId));
                Set<Long> userIds = links.stream().map(SysUserRole::getUserId)
                        .filter(java.util.Objects::nonNull).collect(java.util.stream.Collectors.toSet());
                List<SysUser> users = userIds.isEmpty() ? List.of() : userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .in(SysUser::getUserId, userIds)
                        .eq(SysUser::getTenantId, tenantId)
                        .eq(SysUser::getStatus, "0")
                        .eq(SysUser::getDeleted, 0));
                for (SysUser user : users) {
                    putReceiver(result, MessageReceiver.builder().receiverType("USER").receiverId(user.getUserId())
                            .receiverName(user.getNickName()).build(), expandLimit, receiver);
                }
            } else if ("DEPT".equals(type) && receiver.getReceiverId() != null) {
                Set<Long> deptIds = expandDepartmentIds(receiver.getReceiverId(), tenantId);
                if (deptIds.isEmpty()) continue;
                List<SysUser> users = userMapper.selectList(new LambdaQueryWrapper<SysUser>()
                        .in(SysUser::getDeptId, deptIds)
                        .eq(SysUser::getTenantId, tenantId)
                        .eq(SysUser::getStatus, "0")
                        .eq(SysUser::getDeleted, 0));
                for (SysUser user : users) {
                    putReceiver(result, MessageReceiver.builder().receiverType("USER").receiverId(user.getUserId())
                            .receiverName(user.getNickName()).build(), expandLimit, receiver);
                }
            } else if (("PHONE".equals(type) || "EMAIL".equals(type))
                    && StringUtils.hasText(receiver.getReceiverAddress())) {
                putReceiver(result, receiver, expandLimit, receiver);
            }
        }
        return new ArrayList<>(result.values());
    }

    private void putReceiver(Map<String, MessageReceiver> target, MessageReceiver value,
                             int limit, MessageReceiver source) {
        String key = receiverKey(value);
        if (!target.containsKey(key) && target.size() >= limit) {
            throw new ReceiverExpansionException("接收人超上限，请改用公告", source);
        }
        target.putIfAbsent(key, value);
    }

    /** 返回指定部门及其全部后代部门，避免 DEPT 接收方漏发子部门员工。 */
    private Set<Long> expandDepartmentIds(Long rootDeptId, Long tenantId) {
        List<SysDept> departments = deptMapper.selectList(new LambdaQueryWrapper<SysDept>()
                .eq(SysDept::getTenantId, tenantId)
                .eq(SysDept::getStatus, "0")
                .eq(SysDept::getDeleted, 0));
        Set<Long> result = new java.util.LinkedHashSet<>();
        if (departments.stream().noneMatch(dept -> Objects.equals(dept.getDeptId(), rootDeptId))) {
            return result;
        }
        result.add(rootDeptId);
        boolean changed;
        do {
            changed = false;
            for (SysDept dept : departments) {
                if (dept.getDeptId() != null && dept.getParentId() != null
                        && result.contains(dept.getParentId()) && result.add(dept.getDeptId())) {
                    changed = true;
                }
            }
        } while (changed);
        return result;
    }

    private SysMessageTemplate findTemplate(Long tenantId, String code, MessageChannelType type) {
        if (!StringUtils.hasText(code)) return null;
        return templateMapper.selectOne(new LambdaQueryWrapper<SysMessageTemplate>()
                .eq(SysMessageTemplate::getTenantId, tenantId)
                .eq(SysMessageTemplate::getTemplateCode, code)
                .eq(SysMessageTemplate::getChannelType, type.name())
                .eq(SysMessageTemplate::getStatus, "ENABLED")
                .eq(SysMessageTemplate::getDeleted, 0));
    }

    private List<SysMessageChannel> findChannels(Long tenantId, MessageChannelType type) {
        return channelMapper.selectList(new LambdaQueryWrapper<SysMessageChannel>()
                .eq(SysMessageChannel::getTenantId, tenantId)
                .eq(SysMessageChannel::getChannelType, type.name())
                .eq(SysMessageChannel::getStatus, "ENABLED")
                .eq(SysMessageChannel::getDeleted, 0)
                .orderByAsc(SysMessageChannel::getPriority, SysMessageChannel::getChannelId));
    }

    private boolean isSubscribed(Long tenantId, Long userId, String category, MessageChannelType type) {
        SysMessageSubscribe row = subscribeMapper.selectOne(new LambdaQueryWrapper<SysMessageSubscribe>()
                .eq(SysMessageSubscribe::getTenantId, tenantId)
                .eq(SysMessageSubscribe::getUserId, userId)
                .eq(SysMessageSubscribe::getMessageCategory, category)
                .eq(SysMessageSubscribe::getChannelType, type.name()));
        return row == null || !Integer.valueOf(0).equals(row.getEnabledFlag());
    }

    private LocalDateTime quietUntil(Long tenantId, Long userId, String category, MessageChannelType type) {
        SysMessageSubscribe row = subscribeMapper.selectOne(new LambdaQueryWrapper<SysMessageSubscribe>()
                .eq(SysMessageSubscribe::getTenantId, tenantId)
                .eq(SysMessageSubscribe::getUserId, userId)
                .eq(SysMessageSubscribe::getMessageCategory, category)
                .eq(SysMessageSubscribe::getChannelType, type.name()));
        if (row == null || row.getQuietStart() == null || row.getQuietEnd() == null
                || row.getQuietStart().equals(row.getQuietEnd())) return null;
        LocalTime now = LocalTime.now();
        boolean quiet;
        if (row.getQuietStart().isBefore(row.getQuietEnd())) {
            quiet = !now.isBefore(row.getQuietStart()) && now.isBefore(row.getQuietEnd());
        } else {
            quiet = !now.isBefore(row.getQuietStart()) || now.isBefore(row.getQuietEnd());
        }
        if (!quiet) return null;
        LocalDate endDate = now.isBefore(row.getQuietEnd()) ? LocalDate.now() : LocalDate.now().plusDays(1);
        return LocalDateTime.of(endDate, row.getQuietEnd());
    }

    private boolean hasStableEventIdentity(BusinessEventEnvelope envelope, MessageSendRequest request) {
        if (!StringUtils.hasText(request.getDeduplicationKey()) || !StringUtils.hasText(envelope.getSourceModule())) {
            return false;
        }
        String identity = envelope.getSourceModule() + ":" + envelope.getTenantId() + ":" + request.getDeduplicationKey();
        return UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)).toString().equals(envelope.getEventId());
    }

    private boolean isDuplicated(Long tenantId, String templateCode, MessageChannelType channelType,
                                 MessageReceiver receiver, String bizId, int windowSeconds) {
        // 去重键明确包含 bizId；没有业务号时不能把不同通知误合并。
        if (receiver == null || !StringUtils.hasText(bizId)) return false;
        LocalDateTime threshold = LocalDateTime.now().minusSeconds(windowSeconds);
        LambdaQueryWrapper<SysMessageRecord> wrapper = new LambdaQueryWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getTenantId, tenantId)
                .eq(SysMessageRecord::getTemplateCode, templateCode)
                .eq(SysMessageRecord::getChannelType, channelType.name())
                .eq(SysMessageRecord::getBizId, bizId)
                .in(SysMessageRecord::getSendStatus, "SENDING", "SUCCESS")
                .ge(SysMessageRecord::getCreateTime, threshold);
        if (receiver.getReceiverId() != null) {
            return recordMapper.selectCount(wrapper.eq(SysMessageRecord::getReceiverId, receiver.getReceiverId())) > 0;
        }
        if (!StringUtils.hasText(receiver.getReceiverAddress())) return false;
        for (SysMessageRecord candidate : recordMapper.selectList(wrapper.isNull(SysMessageRecord::getReceiverId))) {
            try {
                if (receiver.getReceiverAddress().equals(secretCipher.decrypt(candidate.getReceiverAddrCipher()))) return true;
            } catch (RuntimeException ignored) {
                // 无法解密的历史记录不参与地址去重。
            }
        }
        return false;
    }

    /**
     * 地址型接收人没有 receiver_id，MySQL 唯一索引会把 NULL 视为互不相等；
     * 因此重复消费时需按解密后的接收地址补充应用层幂等判断。
     */
    private SysMessageRecord findExistingRecord(Long tenantId, String eventId,
                                                MessageChannelType channelType, MessageReceiver receiver) {
        List<SysMessageRecord> candidates = recordMapper.selectList(new LambdaQueryWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getTenantId, tenantId)
                .eq(SysMessageRecord::getOutboxEventId, eventId)
                .eq(SysMessageRecord::getChannelType, channelType.name()));
        String expectedType = normalizedReceiverType(receiver);
        for (SysMessageRecord candidate : candidates) {
            if (receiver.getReceiverId() != null) {
                if (Objects.equals(receiver.getReceiverId(), candidate.getReceiverId())) return candidate;
                continue;
            }
            if (!expectedType.equals(normalizedReceiverType(candidate.getReceiverType()))) continue;
            if (!StringUtils.hasText(receiver.getReceiverAddress())) {
                if (candidate.getReceiverId() == null && !StringUtils.hasText(candidate.getReceiverAddrCipher())) {
                    return candidate;
                }
                continue;
            }
            try {
                if (receiver.getReceiverAddress().equals(secretCipher.decrypt(candidate.getReceiverAddrCipher()))) {
                    return candidate;
                }
            } catch (RuntimeException ignored) {
                // 历史密文无法解密时继续比较其他候选，不能把不同地址误判为同一接收人。
            }
        }
        return null;
    }

    private String receiverKey(MessageReceiver receiver) {
        String type = normalizedReceiverType(receiver);
        if (receiver.getReceiverId() != null) return "ID:" + receiver.getReceiverId();
        return type + ":ADDR:" + (receiver.getReceiverAddress() == null ? "" : receiver.getReceiverAddress());
    }

    private String normalizedReceiverType(MessageReceiver receiver) {
        return normalizedReceiverType(receiver == null ? null : receiver.getReceiverType());
    }

    private String normalizedReceiverType(String type) {
        return StringUtils.hasText(type) ? type.trim().toUpperCase(Locale.ROOT) : "USER";
    }

    private QuotaDecision acquireQuota(SysMessageChannel channel) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime minuteRetry = now.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1).plusSeconds(1);
        QuotaDecision minute = acquireQuotaKey(
                "cloudflow:message:quota:minute:" + channel.getTenantId() + ":" + channel.getChannelId()
                        + ":" + now.truncatedTo(ChronoUnit.MINUTES),
                channel.getRateLimitMinute(), 120, minuteRetry);
        if (!minute.allowed()) return minute;

        LocalDateTime dailyRetry = LocalDate.now().plusDays(1).atStartOfDay().plusSeconds(1);
        QuotaDecision daily = acquireQuotaKey(
                "cloudflow:message:quota:day:" + channel.getTenantId() + ":" + channel.getChannelId()
                        + ":" + LocalDate.now(),
                channel.getDailyLimit(), 172800, dailyRetry);
        if (!daily.allowed()) return daily;
        return new QuotaDecision(true, null);
    }

    private QuotaDecision acquireQuotaKey(String key, Integer limit, int ttlSeconds, LocalDateTime retryAt) {
        if (limit == null || limit <= 0) return new QuotaDecision(true, null);
        try {
            Long result = redisTemplate.execute(QUOTA_SCRIPT, List.of(key),
                    String.valueOf(limit), String.valueOf(ttlSeconds));
            return new QuotaDecision(result == null || result > 0, result == null ? null : retryAt);
        } catch (RuntimeException e) {
            log.warn("消息渠道限流检查失败，按可用策略放行: channelKey={}", key, e);
            return new QuotaDecision(true, null);
        }
    }

    private void schedule(MessageSendRequest request, MessageChannelType channelType,
                          MessageReceiver receiver, LocalDateTime scheduleTime, int retryAttempt) {
        MessageSendRequest delayed = request.toBuilder()
                .channelTypes(List.of(channelType))
                .receivers(List.of(receiver))
                .scheduleTime(scheduleTime)
                .retryAttempt(retryAttempt)
                .build();
        messageSender.send(delayed);
    }

    private int retryAttempt(MessageSendRequest request) {
        return request.getRetryAttempt() == null ? 0 : Math.max(0, request.getRetryAttempt());
    }

    private LocalDateTime earlier(LocalDateTime left, LocalDateTime right) {
        if (left == null) return right;
        if (right == null) return left;
        return left.isBefore(right) ? left : right;
    }

    private DispatchResult resultOf(List<SysMessageRecord> records, boolean delayed, String delayedReason) {
        Long firstId = records.stream().map(SysMessageRecord::getRecordId)
                .filter(Objects::nonNull).findFirst().orElse(null);
        boolean allSuccessful = !records.isEmpty()
                && records.stream().allMatch(record -> "SUCCESS".equals(record.getSendStatus()));
        if (allSuccessful) return new DispatchResult(true, delayed, firstId, "消息已发送", List.copyOf(records));
        if (records.stream().anyMatch(record -> "UNKNOWN".equals(record.getSendStatus()))) {
            return new DispatchResult(false, false, firstId, "外部发送结果未确认，禁止自动重发", List.copyOf(records));
        }
        if (records.stream().anyMatch(record -> List.of("PENDING", "CLAIMED", "SENDING", "RETRYABLE").contains(record.getSendStatus()))) {
            return new DispatchResult(false, true, firstId, "消息已排队，尚未确认发送", List.copyOf(records));
        }
        if (delayed && records.isEmpty()) {
            return new DispatchResult(true, true, null,
                    StringUtils.hasText(delayedReason) ? delayedReason : "消息已延迟发送", List.of());
        }
        String message = records.stream().map(record -> StringUtils.hasText(record.getErrorMsg())
                        ? record.getErrorMsg() : skipMessage(record.getSkipReason()))
                .filter(StringUtils::hasText).findFirst()
                .orElse(StringUtils.hasText(delayedReason) ? delayedReason : "消息发送失败");
        return new DispatchResult(false, delayed, firstId, message, List.copyOf(records));
    }

    private String skipMessage(String reason) {
        if ("NOT_IMPLEMENTED".equals(reason)) return "渠道未实现";
        if ("NO_CHANNEL".equals(reason)) return "渠道未配置";
        if ("UNSUBSCRIBED".equals(reason)) return "用户已关闭订阅";
        if ("DEDUPED".equals(reason)) return "重复消息已跳过";
        return reason;
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) return value;
        return value.substring(0, maxLength);
    }

    private String missingRequiredParams(String declaration, Map<String, Object> params) {
        return MessageTemplateRendering.missing(declaration, params, objectMapper);
    }

    private String render(String template, Map<String, Object> params) {
        return MessageTemplateRendering.render(template, params);
    }

    private String category(MessageSendRequest request) {
        return request.getCategory() == null ? "SYSTEM" : request.getCategory().name();
    }

    public record DispatchResult(boolean success, boolean delayed, Long firstRecordId,
                                 String message, List<SysMessageRecord> records) {
    }

    private record DispatchOneResult(SysMessageRecord record, boolean delayed, String message) {
    }

    private record QuotaDecision(boolean allowed, LocalDateTime retryAt) {
    }

    private static final class ReceiverExpansionException extends RuntimeException {
        private final MessageReceiver receiver;

        private ReceiverExpansionException(String message, MessageReceiver receiver) {
            super(message);
            this.receiver = receiver;
        }

        private MessageReceiver getReceiver() {
            return receiver;
        }
    }
}
