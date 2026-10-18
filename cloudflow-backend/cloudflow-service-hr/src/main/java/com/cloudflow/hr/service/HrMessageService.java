package com.cloudflow.hr.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.hr.domain.entity.HrEmployee;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * HR 业务消息适配器。消息统一写入 outbox，具体投递由 auth 消费端完成。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HrMessageService {

    private final HrEmployeeMapper employeeMapper;
    private final MessageSender messageSender;

    /**
     * 按员工档案解析登录用户并发送站内消息。
     * 员工尚未绑定账号时跳过发送，避免把 employee_id 错当成 user_id 写入消息记录。
     */
    public void sendToEmployee(Long tenantId, Long employeeId, String category,
                               String title, String content, String linkUrl,
                               String bizType, Long bizId) {
        if (employeeId == null || !StringUtils.hasText(title)) {
            return;
        }
        HrEmployee employee = employeeMapper.selectOne(new LambdaQueryWrapper<HrEmployee>()
                .eq(HrEmployee::getTenantId, tenantId)
                .eq(HrEmployee::getId, employeeId)
                .eq(HrEmployee::getDeleted, 0));
        if (employee == null || employee.getUserId() == null) {
            log.warn("HR 消息未发送：员工未绑定用户，employeeId={}", employeeId);
            return;
        }
        String safeCategory = normalizeCategory(category);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("title", title);
        params.put("content", content == null ? "" : content);
        params.put("employeeId", employeeId);
        params.put("employeeName", employee.getName());
        messageSender.send(MessageSendRequest.builder()
                .templateCode("HR_ESS_" + normalizeCode(category))
                .channelTypes(List.of(MessageChannelType.INTERNAL))
                .receivers(List.of(MessageReceiver.builder()
                        .receiverType("USER")
                        .receiverId(employee.getUserId())
                        .receiverName(employee.getName())
                        .build()))
                .params(params)
                .category(MessageCategory.valueOf(safeCategory))
                .bizType(bizType)
                .bizId(bizId == null ? null : String.valueOf(bizId))
                .linkUrl(linkUrl)
                .title(title)
                .content(content)
                .build());
    }

    private String normalizeCategory(String category) {
        if ("TODO".equalsIgnoreCase(category) || "CC".equalsIgnoreCase(category)
                || "ANNOUNCEMENT".equalsIgnoreCase(category)
                || "SYSTEM".equalsIgnoreCase(category)) {
            return category.toUpperCase(Locale.ROOT);
        }
        return MessageCategory.BIZ_REMINDER.name();
    }

    private String normalizeCode(String category) {
        if (!StringUtils.hasText(category)) {
            return "REMINDER";
        }
        return category.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "_");
    }
}
