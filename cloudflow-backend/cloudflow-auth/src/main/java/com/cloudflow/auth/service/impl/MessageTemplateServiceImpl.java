package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.SysMessageTemplate;
import com.cloudflow.auth.domain.dto.MessageTemplateDTO;
import com.cloudflow.auth.domain.dto.MessageTemplatePreviewDTO;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.service.MessageTemplateService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 消息模板服务。
 */
@Service
@RequiredArgsConstructor
public class MessageTemplateServiceImpl extends ServiceImpl<SysMessageTemplateMapper, SysMessageTemplate>
        implements MessageTemplateService {

    private static final List<String> CATEGORIES = List.of("TODO", "CC", "ANNOUNCEMENT", "SYSTEM", "BIZ_REMINDER");
    private final ObjectMapper objectMapper;

    @Override
    public PageResult<SysMessageTemplate> list(String templateCode, String channelType, String status,
                                               int pageNum, int pageSize) {
        String normalizedChannel = StringUtils.hasText(channelType) ? channelType.toUpperCase(Locale.ROOT) : null;
        String normalizedStatus = StringUtils.hasText(status) ? status.toUpperCase(Locale.ROOT) : null;
        LambdaQueryWrapper<SysMessageTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysMessageTemplate::getTenantId, tenantId())
                .eq(SysMessageTemplate::getDeleted, 0)
                .like(StringUtils.hasText(templateCode), SysMessageTemplate::getTemplateCode, templateCode)
                .eq(StringUtils.hasText(normalizedChannel), SysMessageTemplate::getChannelType, normalizedChannel)
                .eq(StringUtils.hasText(normalizedStatus), SysMessageTemplate::getStatus, normalizedStatus)
                .orderByDesc(SysMessageTemplate::getTemplateId);
        int safePage = Math.max(1, pageNum);
        int safeSize = Math.max(1, Math.min(200, pageSize));
        Page<SysMessageTemplate> page = baseMapper.selectPage(new Page<>(safePage, safeSize), wrapper);
        return new PageResult<>(page.getRecords(), page.getTotal(), page.getCurrent(), page.getSize());
    }

    @Override
    public SysMessageTemplate get(Long id) {
        SysMessageTemplate template = getOne(new LambdaQueryWrapper<SysMessageTemplate>()
                .eq(SysMessageTemplate::getTemplateId, id)
                .eq(SysMessageTemplate::getTenantId, tenantId())
                .eq(SysMessageTemplate::getDeleted, 0));
        if (template == null) throw new ServiceException("消息模板不存在", 404);
        return template;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void add(MessageTemplateDTO dto) {
        validate(dto);
        SysMessageTemplate template = new SysMessageTemplate();
        BeanUtils.copyProperties(dto, template, "tenantId", "deleted", "version", "createBy", "createTime", "updateBy", "updateTime");
        template.setTenantId(tenantId());
        template.setTemplateCode(dto.getTemplateCode().trim());
        template.setTemplateName(dto.getTemplateName().trim());
        template.setChannelType(dto.getChannelType().trim().toUpperCase(Locale.ROOT));
        template.setMessageCategory(normalizeCategory(dto.getMessageCategory()));
        template.setDeleted(0);
        template.setForceSendFlag(dto.getForceSendFlag() == null ? 0 : dto.getForceSendFlag());
        template.setDedupeWindowSec(dto.getDedupeWindowSec() == null ? 300 : dto.getDedupeWindowSec());
        template.setStatus(StringUtils.hasText(dto.getStatus())
                ? dto.getStatus().trim().toUpperCase(Locale.ROOT) : "ENABLED");
        template.setDeleted(0);
        template.setVersion(0);
        template.setCreateBy(userName());
        template.setCreateTime(LocalDateTime.now());
        save(template);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void edit(MessageTemplateDTO dto) {
        if (dto == null || dto.getTemplateId() == null) throw new ServiceException("模板ID不能为空");
        validate(dto);
        SysMessageTemplate template = get(dto.getTemplateId());
        String oldStatus = template.getStatus();
        Integer oldForceSendFlag = template.getForceSendFlag();
        Integer oldDedupeWindowSec = template.getDedupeWindowSec();
        BeanUtils.copyProperties(dto, template, "tenantId", "deleted", "version", "createBy", "createTime", "updateBy", "updateTime");
        template.setTenantId(tenantId());
        template.setTemplateCode(dto.getTemplateCode().trim());
        template.setTemplateName(dto.getTemplateName().trim());
        template.setChannelType(dto.getChannelType().trim().toUpperCase(Locale.ROOT));
        template.setMessageCategory(normalizeCategory(dto.getMessageCategory()));
        template.setDeleted(0);
        template.setStatus(StringUtils.hasText(dto.getStatus())
                ? dto.getStatus().trim().toUpperCase(Locale.ROOT)
                : (StringUtils.hasText(oldStatus) ? oldStatus.trim().toUpperCase(Locale.ROOT) : "ENABLED"));
        template.setForceSendFlag(dto.getForceSendFlag() == null ? oldForceSendFlag : dto.getForceSendFlag());
        template.setDedupeWindowSec(dto.getDedupeWindowSec() == null ? oldDedupeWindowSec : dto.getDedupeWindowSec());
        template.setUpdateBy(userName());
        template.setUpdateTime(LocalDateTime.now());
        updateById(template);
    }

    @Override
    @Audit(name = "删除消息模板", highRisk = true)
    @Transactional(rollbackFor = Exception.class)
    public void remove(List<Long> ids) {
        if (ids == null) return;
        for (Long id : ids) {
            SysMessageTemplate template = get(id);
            template.setDeleted(1);
            template.setUpdateBy(userName());
            template.setUpdateTime(LocalDateTime.now());
            updateById(template);
        }
    }

    @Override
    public Map<String, String> preview(MessageTemplatePreviewDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getTemplateCode()) || !StringUtils.hasText(dto.getChannelType())) {
            throw new ServiceException("模板编码和渠道类型不能为空");
        }
        SysMessageTemplate template = findEnabled(dto.getTemplateCode(), dto.getChannelType());
        if (template == null) throw new ServiceException("模板不存在或已停用", 404);
        Map<String, Object> params = dto.getParams() == null ? Map.of() : dto.getParams();
        String missing = missingRequiredParam(template.getParamsDeclare(), params);
        if (missing != null) throw new ServiceException("缺失参数: " + missing);
        Map<String, String> result = new HashMap<>();
        result.put("title", render(template.getTitleTemplate(), params));
        result.put("content", render(template.getContentTemplate(), params));
        return result;
    }

    @Override
    public SysMessageTemplate findEnabled(String code, String channelType) {
        return getOne(new LambdaQueryWrapper<SysMessageTemplate>()
                .eq(SysMessageTemplate::getTenantId, tenantId())
                .eq(SysMessageTemplate::getTemplateCode, code)
                .eq(SysMessageTemplate::getChannelType, channelType == null ? null : channelType.trim().toUpperCase(Locale.ROOT))
                .eq(SysMessageTemplate::getStatus, "ENABLED")
                .eq(SysMessageTemplate::getDeleted, 0));
    }

    private String render(String template, Map<String, Object> params) {
        if (template == null) return "";
        String result = template;
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            String value = entry.getValue() == null ? "" : String.valueOf(entry.getValue());
            result = result.replace("${" + entry.getKey() + "}", value)
                    .replace("{{" + entry.getKey() + "}}", value);
        }
        return result;
    }

    private void validate(MessageTemplateDTO dto) {
        if (dto == null || !StringUtils.hasText(dto.getTemplateCode()) || !StringUtils.hasText(dto.getTemplateName())
                || !StringUtils.hasText(dto.getChannelType()) || !StringUtils.hasText(dto.getContentTemplate())) {
            throw new ServiceException("模板编码、名称、渠道和内容不能为空");
        }
        try { com.cloudflow.common.message.constant.MessageChannelType.valueOf(dto.getChannelType().toUpperCase(Locale.ROOT)); }
        catch (IllegalArgumentException e) { throw new ServiceException("渠道类型不受支持"); }
        if (StringUtils.hasText(dto.getStatus())
                && !List.of("ENABLED", "DISABLED").contains(dto.getStatus().trim().toUpperCase(Locale.ROOT))) {
            throw new ServiceException("模板状态不受支持");
        }
        if (dto.getForceSendFlag() != null && dto.getForceSendFlag() != 0 && dto.getForceSendFlag() != 1) {
            throw new ServiceException("强制发送开关值不合法");
        }
        if (dto.getDedupeWindowSec() != null && dto.getDedupeWindowSec() < 0) {
            throw new ServiceException("去重窗口不能小于0");
        }
        validateParamsDeclare(dto.getParamsDeclare());
    }

    private void validateParamsDeclare(String declaration) {
        if (!StringUtils.hasText(declaration)) return;
        try {
            JsonNode root = objectMapper.readTree(declaration);
            if (root == null || !root.isArray()) throw new ServiceException("参数声明必须是 JSON 数组");
            Set<String> names = new HashSet<>();
            for (JsonNode item : root) {
                String name = item.path("name").asText("").trim();
                if (!name.matches("[A-Za-z][A-Za-z0-9_]*")) {
                    throw new ServiceException("参数声明中的参数名不合法");
                }
                if (!names.add(name)) throw new ServiceException("参数声明中存在重复参数: " + name);
            }
        } catch (ServiceException e) {
            throw e;
        } catch (Exception e) {
            throw new ServiceException("参数声明不是合法 JSON");
        }
    }

    private String missingRequiredParam(String declaration, Map<String, Object> params) {
        if (!StringUtils.hasText(declaration)) return null;
        try {
            JsonNode root = objectMapper.readTree(declaration);
            if (root == null || !root.isArray()) return "params_declare";
            for (JsonNode item : root) {
                if (!item.path("required").asBoolean(false)) continue;
                String name = item.path("name").asText();
                Object value = params.get(name);
                if (value == null || value instanceof String text && !StringUtils.hasText(text)) return name;
            }
            return null;
        } catch (Exception e) {
            return "params_declare";
        }
    }

    private String normalizeCategory(String value) {
        if (!StringUtils.hasText(value)) return "SYSTEM";
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!CATEGORIES.contains(normalized)) throw new ServiceException("消息分类不受支持");
        return normalized;
    }

    private Long tenantId() { return UserContext.getTenantId() == null ? 100000L : UserContext.getTenantId(); }
    private String userName() { return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system"; }
}
