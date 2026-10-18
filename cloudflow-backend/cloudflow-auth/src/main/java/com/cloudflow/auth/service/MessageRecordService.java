package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.domain.dto.MarkReadDTO;
import com.cloudflow.auth.domain.dto.MessageRecordQuery;
import com.cloudflow.auth.domain.dto.ResendResultVO;
import com.cloudflow.auth.domain.vo.MessageStatisticsVO;
import com.cloudflow.auth.domain.vo.MyMessageVO;
import com.cloudflow.auth.domain.vo.SysMessageRecordVO;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.constant.MessageCategory;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 消息记录查询与已读服务。
 */
@Service
@RequiredArgsConstructor
public class MessageRecordService extends ServiceImpl<SysMessageRecordMapper, SysMessageRecord> {
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final MessageSender messageSender;
    private final MessageSecretCipher secretCipher;
    private final MessageDeliveryService deliveryService;

    public PageResult<SysMessageRecordVO> list(MessageRecordQuery query, int pageNum, int pageSize) {
        LambdaQueryWrapper<SysMessageRecord> wrapper = new LambdaQueryWrapper<>();
        String channelType = query == null || !StringUtils.hasText(query.getChannelType())
                ? null : query.getChannelType().trim().toUpperCase(Locale.ROOT);
        String sendStatus = query == null || !StringUtils.hasText(query.getSendStatus())
                ? null : query.getSendStatus().trim().toUpperCase(Locale.ROOT);
        wrapper.eq(SysMessageRecord::getTenantId, tenantId())
                .eq(StringUtils.hasText(channelType), SysMessageRecord::getChannelType, channelType)
                .eq(StringUtils.hasText(sendStatus), SysMessageRecord::getSendStatus, sendStatus)
                .like(StringUtils.hasText(query == null ? null : query.getTemplateCode()), SysMessageRecord::getTemplateCode,
                        query == null ? null : query.getTemplateCode())
                .eq(StringUtils.hasText(query == null ? null : query.getBizType()), SysMessageRecord::getBizType,
                        query == null ? null : query.getBizType())
                .eq(query != null && query.getReceiverId() != null, SysMessageRecord::getReceiverId,
                        query == null ? null : query.getReceiverId())
                .orderByDesc(SysMessageRecord::getCreateTime)
                .orderByDesc(SysMessageRecord::getRecordId);
        applyTimeRange(wrapper, query == null ? null : query.getBeginTime(), query == null ? null : query.getEndTime());
        int safePage = Math.max(1, pageNum);
        int safeSize = Math.max(1, Math.min(200, pageSize));
        Page<SysMessageRecord> result = baseMapper.selectPage(new Page<>(safePage, safeSize), wrapper);
        List<SysMessageRecordVO> rows = result.getRecords().stream().map(this::toRecordVO).toList();
        Map<Long, Long> deliveryIds = deliveryService.deliveryIds(tenantId(), rows.stream().map(SysMessageRecordVO::getRecordId).toList());
        rows.forEach(row -> row.setDeliveryId(deliveryIds.get(row.getRecordId())));
        return new PageResult<>(rows, result.getTotal(), result.getCurrent(), result.getSize());
    }

    public PageResult<MyMessageVO> mine(String category, Integer readFlag, String beginTime, String endTime,
                                         int pageNum, int pageSize) {
        String normalizedCategory = StringUtils.hasText(category)
                ? category.trim().toUpperCase(Locale.ROOT) : null;
        LambdaQueryWrapper<SysMessageRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysMessageRecord::getTenantId, tenantId())
                .eq(SysMessageRecord::getReceiverId, currentUserId())
                .eq(SysMessageRecord::getChannelType, "INTERNAL")
                .eq(SysMessageRecord::getSendStatus, "SUCCESS")
                .eq(StringUtils.hasText(normalizedCategory), SysMessageRecord::getMessageCategory, normalizedCategory)
                .eq(readFlag != null, SysMessageRecord::getReadFlag, readFlag)
                .orderByDesc(SysMessageRecord::getCreateTime)
                .orderByDesc(SysMessageRecord::getRecordId);
        applyTimeRange(wrapper, beginTime, endTime);
        int safePage = Math.max(1, pageNum);
        int safeSize = Math.max(1, Math.min(200, pageSize));
        Page<SysMessageRecord> result = baseMapper.selectPage(new Page<>(safePage, safeSize), wrapper);
        List<MyMessageVO> rows = result.getRecords().stream().map(this::toMineVO).toList();
        return new PageResult<>(rows, result.getTotal(), result.getCurrent(), result.getSize());
    }

    public MyMessageVO detailMine(Long recordId) {
        SysMessageRecord record = getOne(new LambdaQueryWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getRecordId, recordId)
                .eq(SysMessageRecord::getTenantId, tenantId())
                .eq(SysMessageRecord::getReceiverId, currentUserId())
                .eq(SysMessageRecord::getChannelType, "INTERNAL")
                .eq(SysMessageRecord::getSendStatus, "SUCCESS"));
        if (record == null) throw new ServiceException("消息不存在或无权访问", 403);
        return toMineVO(record);
    }

    @Transactional(rollbackFor = Exception.class)
    public void markRead(MarkReadDTO dto) {
        Long userId = currentUserId();
        LambdaQueryWrapper<SysMessageRecord> wrapper = new LambdaQueryWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getTenantId, tenantId())
                .eq(SysMessageRecord::getReceiverId, userId)
                .eq(SysMessageRecord::getChannelType, "INTERNAL")
                .eq(SysMessageRecord::getSendStatus, "SUCCESS")
                .eq(SysMessageRecord::getReadFlag, 0);
        if (dto != null && dto.getRecordIds() != null && !dto.getRecordIds().isEmpty()) {
            wrapper.in(SysMessageRecord::getRecordId, dto.getRecordIds());
        } else if (dto != null && StringUtils.hasText(dto.getCategory())) {
            wrapper.eq(SysMessageRecord::getMessageCategory,
                    dto.getCategory().trim().toUpperCase(Locale.ROOT));
        } else if (dto == null || !Boolean.TRUE.equals(dto.getAll())) {
            return;
        }
        SysMessageRecord update = new SysMessageRecord();
        update.setReadFlag(1);
        update.setReadTime(LocalDateTime.now());
        update.setUpdateTime(LocalDateTime.now());
        update(update, wrapper);
    }

    public Map<String, Long> unreadCount() {
        Long tenantId = tenantId();
        Long userId = currentUserId();
        Map<String, Long> result = new java.util.LinkedHashMap<>();
        result.put("TOTAL", baseMapper.selectCount(unreadWrapper(tenantId, userId)));
        for (String category : List.of("TODO", "CC", "ANNOUNCEMENT", "SYSTEM", "BIZ_REMINDER")) {
            result.put(category, baseMapper.selectCount(unreadWrapper(tenantId, userId)
                    .eq(SysMessageRecord::getMessageCategory, category)));
        }
        return result;
    }

    private LambdaQueryWrapper<SysMessageRecord> unreadWrapper(Long tenantId, Long userId) {
        return new LambdaQueryWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getTenantId, tenantId)
                .eq(SysMessageRecord::getReceiverId, userId)
                .eq(SysMessageRecord::getChannelType, "INTERNAL")
                .eq(SysMessageRecord::getSendStatus, "SUCCESS")
                .eq(SysMessageRecord::getReadFlag, 0);
    }

    @Transactional(rollbackFor = Exception.class)
    @Audit(name = "人工重新登记消息发送", highRisk = true)
    public ResendResultVO resend(List<Long> recordIds) {
        if (recordIds == null || recordIds.isEmpty()) return ResendResultVO.builder().requested(0).accepted(0).build();
        int accepted = 0;
        for (Long id : recordIds) {
            SysMessageRecord record = getOne(new LambdaQueryWrapper<SysMessageRecord>()
                    .eq(SysMessageRecord::getRecordId, id).eq(SysMessageRecord::getTenantId, tenantId()));
            if (record == null) continue;
            if (!"FAILED".equals(record.getSendStatus())) {
                continue;
            }
            if (!"INTERNAL".equals(record.getChannelType()) || deliveryService.findByRecord(tenantId(), record.getRecordId()) != null) {
                if (deliveryService.requestResend(tenantId(), record.getRecordId())) accepted++;
                continue;
            }
            MessageChannelType channel;
            try {
                channel = MessageChannelType.valueOf(record.getChannelType() == null
                        ? "" : record.getChannelType().toUpperCase(java.util.Locale.ROOT));
            } catch (IllegalArgumentException e) { continue; }
            MessageCategory category;
            try { category = MessageCategory.valueOf(record.getMessageCategory() == null
                    ? "" : record.getMessageCategory().toUpperCase(java.util.Locale.ROOT)); }
            catch (IllegalArgumentException e) { category = MessageCategory.SYSTEM; }
            MessageReceiver receiver = MessageReceiver.builder().receiverType(record.getReceiverType())
                    .receiverId(record.getReceiverId()).receiverName(record.getReceiverName())
                    .receiverAddress(decryptAddress(record.getReceiverAddrCipher())).build();
            if (receiver.getReceiverId() == null && !StringUtils.hasText(receiver.getReceiverAddress())) {
                continue;
            }
            messageSender.send(MessageSendRequest.builder()
                    .templateCode(record.getTemplateCode())
                    .channelTypes(List.of(channel))
                    .receivers(List.of(receiver))
                    .category(category).bizType(record.getBizType()).bizId(record.getBizId())
                    .traceId(record.getTraceId()).linkUrl(record.getLinkUrl())
                    .title(record.getTitle()).content(record.getContent())
                    .renderedContent(true)
                    // 重发是运维显式动作，应绕过原消息的订阅、免打扰与去重窗口。
                    .forceSend(true)
                    .resendFromId(record.getRecordId()).build());
            accepted++;
        }
        return ResendResultVO.builder().requested(recordIds.size()).accepted(accepted).build();
    }

    public MessageStatisticsVO statistics(String beginTime, String endTime) {
        LambdaQueryWrapper<SysMessageRecord> wrapper = new LambdaQueryWrapper<SysMessageRecord>()
                .eq(SysMessageRecord::getTenantId, tenantId());
        applyTimeRange(wrapper, beginTime, endTime);
        List<SysMessageRecord> rows = list(wrapper);
        MessageStatisticsVO result = new MessageStatisticsVO();
        result.setTotal(rows.size());
        result.setSuccess(rows.stream().filter(row -> "SUCCESS".equals(row.getSendStatus())).count());
        result.setFailed(rows.stream().filter(row -> "FAILED".equals(row.getSendStatus())).count());
        result.setUnknown(rows.stream().filter(row -> "UNKNOWN".equals(row.getSendStatus())).count());
        result.setSuccessRate(result.getTotal() == 0 ? 0D : (double) result.getSuccess() / result.getTotal());
        result.setChannelSuccessRates(successRates(rows, SysMessageRecord::getChannelType));
        result.setTemplateSuccessRates(successRates(rows, SysMessageRecord::getTemplateCode));
        Map<String, Long> reasons = new HashMap<>();
        rows.stream().filter(row -> "FAILED".equals(row.getSendStatus()))
                .map(SysMessageRecord::getErrorMsg).filter(StringUtils::hasText)
                .forEach(reason -> reasons.merge(reason, 1L, Long::sum));
        List<MessageStatisticsVO.FailureReasonVO> top = reasons.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed()).limit(5).map(entry -> {
                    MessageStatisticsVO.FailureReasonVO item = new MessageStatisticsVO.FailureReasonVO();
                    item.setReason(entry.getKey()); item.setCount(entry.getValue()); return item;
                }).toList();
        result.setTopFailureReasons(top);
        return result;
    }

    private Map<String, Double> successRates(List<SysMessageRecord> rows,
                                             java.util.function.Function<SysMessageRecord, String> keyFunction) {
        return rows.stream().filter(row -> StringUtils.hasText(keyFunction.apply(row)))
                .collect(Collectors.groupingBy(keyFunction, java.util.LinkedHashMap::new, Collectors.collectingAndThen(
                        Collectors.toList(), values -> values.isEmpty() ? 0D
                                : values.stream().filter(row -> "SUCCESS".equals(row.getSendStatus())).count()
                                / (double) values.size())));
    }

    private MyMessageVO toMineVO(SysMessageRecord source) {
        MyMessageVO target = new MyMessageVO();
        BeanUtils.copyProperties(source, target);
        target.setSenderName(source.getCreateBy());
        return target;
    }

    private SysMessageRecordVO toRecordVO(SysMessageRecord source) {
        SysMessageRecordVO target = new SysMessageRecordVO();
        BeanUtils.copyProperties(source, target);
        return target;
    }

    private void applyTimeRange(LambdaQueryWrapper<SysMessageRecord> wrapper, String beginTime, String endTime) {
        if (StringUtils.hasText(beginTime)) {
            wrapper.ge(SysMessageRecord::getCreateTime, parseDateTime(beginTime));
        }
        if (StringUtils.hasText(endTime)) {
            LocalDateTime end = parseDateTime(endTime);
            if (endTime.length() == 10) {
                // 日期使用次日零点的排他上界，避免 JDBC 精度舍入把次日零点纳入。
                wrapper.lt(SysMessageRecord::getCreateTime, end.plusDays(1));
            } else {
                wrapper.le(SysMessageRecord::getCreateTime, end);
            }
        }
    }

    private LocalDateTime parseDateTime(String value) {
        try { return LocalDateTime.parse(value, DATE_TIME); }
        catch (DateTimeParseException ignored) {
            try {
                return LocalDate.parse(value).atStartOfDay();
            }
            catch (DateTimeParseException e) { throw new ServiceException("时间格式应为 yyyy-MM-dd HH:mm:ss"); }
        }
    }

    private String decryptAddress(String cipherText) {
        if (!StringUtils.hasText(cipherText)) return null;
        try {
            return secretCipher.decrypt(cipherText);
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private Long tenantId() { return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId(); }
    private Long currentUserId() {
        if (UserContext.getUserId() == null) throw new ServiceException("登录用户不存在", 401);
        return UserContext.getUserId();
    }
}
