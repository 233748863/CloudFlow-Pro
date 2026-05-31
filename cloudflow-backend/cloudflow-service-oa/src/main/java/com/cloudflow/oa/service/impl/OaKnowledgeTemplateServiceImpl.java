package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.OaKnowledgeTemplate;
import com.cloudflow.oa.mapper.OaKnowledgeTemplateMapper;
import com.cloudflow.oa.service.IOaKnowledgeTemplateService;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * OA-P1-3 知识库文档模板服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OaKnowledgeTemplateServiceImpl implements IOaKnowledgeTemplateService {

    private static final Long DEFAULT_TENANT_ID = 100000L;

    private final OaKnowledgeTemplateMapper templateMapper;

    @Override
    public Page<OaKnowledgeTemplate> page(String keyword, String category, String status,
                                          Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<OaKnowledgeTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaKnowledgeTemplate::getDeleted, 0);
        if (StringUtils.hasText(keyword)) {
            wrapper.and(w -> w.like(OaKnowledgeTemplate::getTemplateName, keyword)
                    .or().like(OaKnowledgeTemplate::getTemplateCode, keyword));
        }
        if (StringUtils.hasText(category)) {
            wrapper.eq(OaKnowledgeTemplate::getCategory, category);
        }
        if (StringUtils.hasText(status)) {
            wrapper.eq(OaKnowledgeTemplate::getStatus, status);
        }
        wrapper.orderByDesc(OaKnowledgeTemplate::getUpdateTime);
        return templateMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public List<OaKnowledgeTemplate> listActive(String category) {
        LambdaQueryWrapper<OaKnowledgeTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OaKnowledgeTemplate::getDeleted, 0)
                .eq(OaKnowledgeTemplate::getStatus, "ACTIVE");
        if (StringUtils.hasText(category)) {
            wrapper.eq(OaKnowledgeTemplate::getCategory, category);
        }
        wrapper.orderByDesc(OaKnowledgeTemplate::getUsageCount)
                .orderByAsc(OaKnowledgeTemplate::getTemplateName);
        return templateMapper.selectList(wrapper);
    }

    @Override
    public OaKnowledgeTemplate getById(Long id) {
        if (id == null) {
            return null;
        }
        return templateMapper.selectById(id);
    }

    @Override
    @Transactional
    public boolean save(OaKnowledgeTemplate template) {
        if (template == null
                || !StringUtils.hasText(template.getTemplateCode())
                || !StringUtils.hasText(template.getTemplateName())) {
            throw new IllegalArgumentException("模板编码与名称必填");
        }
        if (template.getTenantId() == null) {
            template.setTenantId(DEFAULT_TENANT_ID);
        }
        if (!StringUtils.hasText(template.getStatus())) {
            template.setStatus("ACTIVE");
        }
        if (template.getUsageCount() == null) {
            template.setUsageCount(0);
        }
        template.setCreateBy(UserContext.getUserName());
        template.setUpdateBy(UserContext.getUserName());
        return templateMapper.insert(template) > 0;
    }

    @Override
    @Transactional
    @Audit(name = "更新知识模板")
    public boolean update(OaKnowledgeTemplate template) {
        if (template == null || template.getId() == null) {
            throw new IllegalArgumentException("ID 必填");
        }
        template.setUpdateBy(UserContext.getUserName());
        template.setUpdateTime(LocalDateTime.now());
        return templateMapper.updateById(template) > 0;
    }

    @Override
    @Transactional
    public boolean remove(Long id) {
        if (id == null) {
            return false;
        }
        OaKnowledgeTemplate exist = templateMapper.selectById(id);
        if (exist == null) {
            return false;
        }
        exist.setDeleted(1);
        exist.setUpdateBy(UserContext.getUserName());
        exist.setUpdateTime(LocalDateTime.now());
        return templateMapper.updateById(exist) > 0;
    }

    @Override
    @Transactional
    public String useTemplate(Long id) {
        OaKnowledgeTemplate template = templateMapper.selectById(id);
        if (template == null || (template.getDeleted() != null && template.getDeleted() == 1)) {
            return "";
        }
        template.setUsageCount((template.getUsageCount() == null ? 0 : template.getUsageCount()) + 1);
        template.setUpdateBy(UserContext.getUserName());
        template.setUpdateTime(LocalDateTime.now());
        templateMapper.updateById(template);
        return template.getContent() == null ? "" : template.getContent();
    }
}
