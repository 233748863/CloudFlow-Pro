package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.config.WorkflowCallbackStreamConstants;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.KnowledgeRead;
import com.cloudflow.oa.mapper.KnowledgeDocumentMapper;
import com.cloudflow.oa.mapper.KnowledgeReadMapper;
import com.cloudflow.oa.service.IKnowledgeService;
import com.cloudflow.oa.service.remote.RemoteWorkflowService;
import com.cloudflow.oa.util.OaAttachmentUrlUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Service
public class KnowledgeServiceImpl extends ServiceImpl<KnowledgeDocumentMapper, KnowledgeDocument>
        implements IKnowledgeService {

    private final KnowledgeReadMapper readMapper;
    private final RemoteWorkflowService remoteWorkflowService;

    public KnowledgeServiceImpl(KnowledgeReadMapper readMapper,
                                RemoteWorkflowService remoteWorkflowService) {
        this.readMapper = readMapper;
        this.remoteWorkflowService = remoteWorkflowService;
    }

    @Override
    public List<KnowledgeDocument> getMyReadableList(String keyword, String category, Boolean unreadOnly) {
        Set<String> roleIds = UserContext.getRoles();
        if (roleIds == null) {
            roleIds = new HashSet<>();
        }
        String deptId = String.valueOf(UserContext.getDeptId() != null ? UserContext.getDeptId() : -1L);
        return baseMapper.selectPublishedForUser(
                UserContext.getUserId(),
                deptId,
                roleIds,
                keyword,
                category,
                Boolean.TRUE.equals(unreadOnly)
        );
    }

    @Override
    public Page<KnowledgeDocument> getMySubmissions(String keyword, String category, String status,
                                                    Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<KnowledgeDocument> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeDocument::getSubmitterId, UserContext.getUserId())
                .eq(KnowledgeDocument::getDelFlag, "0")
                .eq(StringUtils.hasText(category), KnowledgeDocument::getCategory, category)
                .eq(StringUtils.hasText(status), KnowledgeDocument::getStatus, status)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(KnowledgeDocument::getTitle, keyword)
                        .or()
                        .like(KnowledgeDocument::getSummary, keyword)
                        .or()
                        .like(KnowledgeDocument::getContent, keyword))
                .orderByDesc(KnowledgeDocument::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public Page<KnowledgeDocument> getManageList(String keyword, String category, String status,
                                                 Integer pageNum, Integer pageSize) {
        LambdaQueryWrapper<KnowledgeDocument> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeDocument::getDelFlag, "0")
                .eq(StringUtils.hasText(category), KnowledgeDocument::getCategory, category)
                .eq(StringUtils.hasText(status), KnowledgeDocument::getStatus, status)
                .and(StringUtils.hasText(keyword), w -> w
                        .like(KnowledgeDocument::getTitle, keyword)
                        .or()
                        .like(KnowledgeDocument::getSummary, keyword)
                        .or()
                        .like(KnowledgeDocument::getContent, keyword))
                .orderByDesc(KnowledgeDocument::getCreateTime);
        return page(new Page<>(pageNum, pageSize), wrapper);
    }

    @Override
    public KnowledgeDocument getReadableDetail(Long documentId) {
        KnowledgeDocument document = getById(documentId);
        if (document == null || !"0".equals(document.getDelFlag())) {
            throw new IllegalArgumentException("知识文档不存在");
        }
        if ("PUBLISHED".equals(document.getStatus()) && !isVisibleToCurrentUser(document) && !hasManageRole()) {
            throw new IllegalArgumentException("无权查看该知识文档");
        }
        if (!"PUBLISHED".equals(document.getStatus())
                && !isOwner(document)
                && !hasManageRole()) {
            throw new IllegalArgumentException("无权查看该知识文档");
        }
        document.setIsRead(hasRead(documentId));
        document.setReadCount(countReads(documentId));
        return document;
    }

    @Override
    @Audit(name = "创建知识库文档", spel = "#document")
    public boolean createDraft(KnowledgeDocument document) {
        normalizeDocument(document);
        LocalDateTime now = LocalDateTime.now();
        document.setSubmitterId(UserContext.getUserId());
        document.setSubmitterName(UserContext.getUserName());
        document.setDeptId(UserContext.getDeptId());
        document.setDeptName(UserContext.getDeptName());
        document.setStatus("DRAFT");
        document.setDelFlag("0");
        document.setCreateBy(UserContext.getUserName());
        document.setCreateTime(now);
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(now);
        return save(document);
    }

    @Override
    @Audit(name = "修改知识库文档", spel = "#document")
    public boolean updateDraft(KnowledgeDocument document) {
        if (document == null || document.getDocumentId() == null) {
            throw new IllegalArgumentException("文档ID不能为空");
        }
        KnowledgeDocument old = requireDocument(document.getDocumentId());
        if (!isOwner(old) && !hasManageRole()) {
            throw new IllegalArgumentException("只能修改自己的知识文档");
        }
        if (!"DRAFT".equals(old.getStatus()) && !"REJECTED".equals(old.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回文档可以修改");
        }
        normalizeDocument(document);
        document.setStatus(old.getStatus());
        document.setSubmitterId(old.getSubmitterId());
        document.setSubmitterName(old.getSubmitterName());
        document.setDeptId(old.getDeptId());
        document.setDeptName(old.getDeptName());
        document.setInstanceId(old.getInstanceId());
        document.setSubmitTime(old.getSubmitTime());
        document.setPublishTime(old.getPublishTime());
        document.setDelFlag("0");
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(LocalDateTime.now());
        return updateById(document);
    }

    @Override
    @Audit(name = "提交知识库发布审批", spel = "#documentId")
    @Transactional(rollbackFor = Exception.class)
    public boolean submit(Long documentId) {
        KnowledgeDocument document = requireDocument(documentId);
        if (!isOwner(document) && !hasManageRole()) {
            throw new IllegalArgumentException("只能提交自己的知识文档");
        }
        if (!"DRAFT".equals(document.getStatus()) && !"REJECTED".equals(document.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回文档可以提交审批");
        }
        normalizeDocument(document);
        document.setStatus("PENDING");
        document.setSubmitTime(LocalDateTime.now());
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(LocalDateTime.now());

        try {
            Map<String, Object> req = new HashMap<>();
            req.put("processDefKey", "knowledge_publish");
            req.put("businessKey", "KNOWLEDGE_DOCUMENT:" + document.getDocumentId());

            Map<String, Object> variables = new HashMap<>();
            variables.put("documentId", document.getDocumentId());
            variables.put("title", document.getTitle());
            variables.put("category", document.getCategory());
            variables.put("summary", document.getSummary());
            variables.put("scopeType", document.getScopeType());
            variables.put("scopeValue", document.getScopeValue());
            variables.put("submitterId", document.getSubmitterId());
            variables.put("submitterName", document.getSubmitterName());
            variables.put("deptName", document.getDeptName());
            WorkflowCallbackStreamConstants.applyCallbackMetadata(
                    variables,
                    WorkflowCallbackStreamConstants.BUSINESS_TYPE_KNOWLEDGE_DOCUMENT,
                    document.getDocumentId(),
                    document.getTitle()
            );
            req.put("variables", variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            if (result != null && result.getCode() == 200 && result.getData() != null) {
                String instanceId = extractInstanceId(result.getData());
                if (instanceId != null) {
                    document.setInstanceId(instanceId);
                }
            } else {
                log.warn("知识库文档 {} 启动工作流返回异常: {}",
                        document.getDocumentId(), result != null ? result.getMsg() : "null");
            }
        } catch (Exception e) {
            log.error("知识库文档 {} 启动工作流失败，但提交状态已更新", document.getDocumentId(), e);
        }

        return updateById(document);
    }

    @Override
    @Audit(name = "撤回知识库发布审批", spel = "#documentId")
    @Transactional(rollbackFor = Exception.class)
    public boolean recall(Long documentId) {
        KnowledgeDocument document = requireDocument(documentId);
        if (!isOwner(document)) {
            throw new IllegalArgumentException("只能撤回自己的知识文档");
        }
        if (!"PENDING".equals(document.getStatus())) {
            throw new IllegalArgumentException("只有审批中的文档可以撤回");
        }
        if (StringUtils.hasText(document.getInstanceId())) {
            Map<String, String> req = new HashMap<>();
            req.put("instanceId", document.getInstanceId());
            R<?> result = remoteWorkflowService.recallProcess(req);
            if (result != null && result.getCode() != 200) {
                throw new IllegalArgumentException(result.getMsg() != null ? result.getMsg() : "流程撤回失败");
            }
        }
        document.setStatus("DRAFT");
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(LocalDateTime.now());
        return updateById(document);
    }

    @Override
    @Audit(name = "删除知识库文档", spel = "#documentId")
    public boolean removeDocument(Long documentId) {
        KnowledgeDocument document = requireDocument(documentId);
        if (!isOwner(document) && !hasManageRole()) {
            throw new IllegalArgumentException("无权删除该知识文档");
        }
        if ("PENDING".equals(document.getStatus())) {
            throw new IllegalArgumentException("审批中的文档不能删除");
        }
        KnowledgeDocument update = new KnowledgeDocument();
        update.setDocumentId(documentId);
        update.setDelFlag("2");
        update.setUpdateBy(UserContext.getUserName());
        update.setUpdateTime(LocalDateTime.now());
        return updateById(update);
    }

    @Override
    @Transactional
    public boolean read(Long documentId) {
        KnowledgeDocument document = requireDocument(documentId);
        if (!"PUBLISHED".equals(document.getStatus()) || !isVisibleToCurrentUser(document)) {
            throw new IllegalArgumentException("无权阅读该知识文档");
        }
        if (hasRead(documentId)) {
            return true;
        }
        try {
            KnowledgeRead read = new KnowledgeRead();
            read.setTenantId(UserContext.getTenantId());
            read.setDocumentId(documentId);
            read.setUserId(UserContext.getUserId());
            read.setUserName(UserContext.getUserName());
            read.setReadTime(LocalDateTime.now());
            readMapper.insert(read);
            return true;
        } catch (Exception e) {
            return true;
        }
    }

    @Override
    public Map<String, Object> getReadStats(Long documentId) {
        requireDocument(documentId);
        LambdaQueryWrapper<KnowledgeRead> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeRead::getDocumentId, documentId)
                .orderByDesc(KnowledgeRead::getReadTime);
        List<KnowledgeRead> reads = readMapper.selectList(wrapper);
        Map<String, Object> stats = new HashMap<>();
        stats.put("readCount", reads.size());
        stats.put("readUsers", reads);
        return stats;
    }

    private KnowledgeDocument requireDocument(Long documentId) {
        KnowledgeDocument document = getById(documentId);
        if (document == null || !"0".equals(document.getDelFlag())) {
            throw new IllegalArgumentException("知识文档不存在");
        }
        return document;
    }

    private void normalizeDocument(KnowledgeDocument document) {
        if (document == null) {
            throw new IllegalArgumentException("知识文档不能为空");
        }
        if (!StringUtils.hasText(document.getTitle())) {
            throw new IllegalArgumentException("标题不能为空");
        }
        if (!StringUtils.hasText(document.getCategory())) {
            throw new IllegalArgumentException("分类不能为空");
        }
        if (!StringUtils.hasText(document.getContent())) {
            throw new IllegalArgumentException("正文不能为空");
        }
        if (!StringUtils.hasText(document.getScopeType())) {
            document.setScopeType("ALL");
        }
        if (!"ALL".equals(document.getScopeType())
                && !"DEPT".equals(document.getScopeType())
                && !"ROLE".equals(document.getScopeType())) {
            throw new IllegalArgumentException("可见范围只能是 ALL、DEPT 或 ROLE");
        }
        if (!"ALL".equals(document.getScopeType()) && !StringUtils.hasText(document.getScopeValue())) {
            throw new IllegalArgumentException("定向可见范围值不能为空");
        }
        if ("ALL".equals(document.getScopeType())) {
            document.setScopeValue(null);
        }
        document.setAttachmentUrl(
                OaAttachmentUrlUtils.normalizeMultiAttachmentUrls(document.getAttachmentUrl(), "知识库附件")
        );
    }

    private boolean isOwner(KnowledgeDocument document) {
        return Objects.equals(document.getSubmitterId(), UserContext.getUserId());
    }

    private boolean hasManageRole() {
        Set<String> roles = UserContext.getRoles();
        if (roles == null) {
            return false;
        }
        return roles.stream()
                .filter(Objects::nonNull)
                .map(String::toLowerCase)
                .anyMatch(role -> "admin".equals(role) || "hr".equals(role) || "role_admin".equals(role) || "role_hr".equals(role));
    }

    private boolean isVisibleToCurrentUser(KnowledgeDocument document) {
        if ("ALL".equals(document.getScopeType())) {
            return true;
        }
        if ("DEPT".equals(document.getScopeType())) {
            return Objects.equals(document.getScopeValue(), String.valueOf(UserContext.getDeptId()));
        }
        if ("ROLE".equals(document.getScopeType())) {
            Set<String> roles = UserContext.getRoles();
            return roles != null && roles.contains(document.getScopeValue());
        }
        return false;
    }

    private boolean hasRead(Long documentId) {
        LambdaQueryWrapper<KnowledgeRead> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeRead::getDocumentId, documentId)
                .eq(KnowledgeRead::getUserId, UserContext.getUserId())
                .last("LIMIT 1");
        return readMapper.selectOne(wrapper) != null;
    }

    private int countReads(Long documentId) {
        LambdaQueryWrapper<KnowledgeRead> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeRead::getDocumentId, documentId);
        return Math.toIntExact(readMapper.selectCount(wrapper));
    }

    @SuppressWarnings("unchecked")
    private String extractInstanceId(Object data) {
        if (data instanceof Map) {
            Map<String, Object> dataMap = (Map<String, Object>) data;
            Object instanceId = dataMap.get("processInstanceId");
            if (instanceId == null) {
                instanceId = dataMap.get("instanceId");
            }
            return instanceId != null ? String.valueOf(instanceId) : null;
        }
        return data instanceof String ? (String) data : null;
    }
}
