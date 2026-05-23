package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaContractTemplate;
import com.cloudflow.oa.mapper.OaContractTemplateMapper;
import com.cloudflow.oa.service.IOaContractTemplateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * OA-P0-2 合同模板服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaContractTemplateServiceImpl implements IOaContractTemplateService {

    private static final Pattern VAR_PATTERN = Pattern.compile("\\{\\{\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\}\\}");
    private static final Long DEFAULT_TENANT_ID = 100000L;

    private final OaContractTemplateMapper templateMapper;

    @Override
    public Page<OaContractTemplate> page(String keyword, String category, String contractType, String status,
                                         Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<OaContractTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaContractTemplate::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(OaContractTemplate::getTemplateName, keyword)
                    .or().like(OaContractTemplate::getTemplateCode, keyword));
        }
        if (StringUtils.hasText(category)) {
            wrapper.eq(OaContractTemplate::getCategory, category);
        }
        if (StringUtils.hasText(contractType)) {
            wrapper.eq(OaContractTemplate::getContractType, contractType);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(OaContractTemplate::getStatus, status);
        }
        wrapper.orderByDesc(OaContractTemplate::getUpdateTime);
        return templateMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<OaContractTemplate> listActive(String contractType) {
        LambdaQueryWrapper<OaContractTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaContractTemplate::getDeleted, 0)
                .eq(OaContractTemplate::getStatus, "ACTIVE");
        if (StringUtils.hasText(contractType)) {
            wrapper.eq(OaContractTemplate::getContractType, contractType);
        }
        wrapper.orderByAsc(OaContractTemplate::getTemplateName);
        return templateMapper.selectList(wrapper);
    }

    @Override
    public OaContractTemplate getById(Long templateId) {
        if (templateId == null) {
            return null;
        }
        return templateMapper.selectById(templateId);
    }

    @Override
    @Transactional
    public boolean save(OaContractTemplate template) {
        if (template == null || !StringUtils.hasText(template.getTemplateName())) {
            throw new IllegalArgumentException("模板名称必填");
        }
        if (template.getTenantId() == null) {
            template.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(template.getStatus())) {
            template.setStatus("ACTIVE");
        }
        template.setCreateBy(UserContext.getUserName());
        template.setUpdateBy(UserContext.getUserName());
        return templateMapper.insert(template) > 0;
    }

    @Override
    @Transactional
    public boolean update(OaContractTemplate template) {
        if (template == null || template.getTemplateId() == null) {
            throw new IllegalArgumentException("模板 ID 必填");
        }
        template.setUpdateBy(UserContext.getUserName());
        template.setUpdateTime(LocalDateTime.now());
        return templateMapper.updateById(template) > 0;
    }

    @Override
    @Transactional
    public boolean remove(Long templateId) {
        if (templateId == null) {
            return false;
        }
        OaContractTemplate template = templateMapper.selectById(templateId);
        if (template == null) {
            return false;
        }
        template.setDeleted(1);
        template.setUpdateBy(UserContext.getUserName());
        template.setUpdateTime(LocalDateTime.now());
        return templateMapper.updateById(template) > 0;
    }

    @Override
    public String renderContent(Long templateId, Map<String, Object> variables) {
        OaContractTemplate template = getById(templateId);
        if (template == null || !StringUtils.hasText(template.getContentHtml())) {
            return "";
        }
        String content = template.getContentHtml();
        if (variables == null || variables.isEmpty()) {
            return content;
        }
        Matcher matcher = VAR_PATTERN.matcher(content);
        StringBuilder buffer = new StringBuilder();
        while (matcher.find()) {
            String key = matcher.group(1);
            Object value = variables.get(key);
            String replacement = value == null ? matcher.group(0) : Objects.toString(value, "");
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }
}
