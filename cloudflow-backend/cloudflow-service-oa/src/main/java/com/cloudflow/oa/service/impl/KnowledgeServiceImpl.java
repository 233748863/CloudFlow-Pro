package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackConstants;
import com.cloudflow.oa.constant.OaBusinessTypes;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.KnowledgeRead;
import com.cloudflow.oa.domain.dto.WorkflowProcessStartDTO;
import com.cloudflow.oa.domain.dto.WorkflowRecallDTO;
import com.cloudflow.oa.domain.vo.DynamicMapVO;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

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
                .eq(KnowledgeDocument::getDeleted, "0")
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
        wrapper.eq(KnowledgeDocument::getDeleted, "0")
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
        if (document == null || !Integer.valueOf(0).equals(document.getDeleted())) {
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
        document.setDeleted(0);
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
        // M1-4: 所有权校验
        DataScopeUtils.assertOwnership(old, KnowledgeDocument::getSubmitterId, "知识文档");
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
        document.setDeleted(0);
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(LocalDateTime.now());
        return updateById(document);
    }

    @Override
    @Audit(name = "提交知识库发布审批", spel = "#documentId")
    public boolean submit(Long documentId) {
        KnowledgeDocument document = requireDocument(documentId);
        DataScopeUtils.assertOwnership(document, KnowledgeDocument::getSubmitterId, "知识文档");
        if (!"DRAFT".equals(document.getStatus()) && !"REJECTED".equals(document.getStatus())) {
            throw new IllegalArgumentException("只有草稿或已驳回文档可以提交审批");
        }
        normalizeDocument(document);
        String instanceId;
        try {
            WorkflowProcessStartDTO req = new WorkflowProcessStartDTO();
            req.setProcessDefKey("knowledge_publish");
            req.setBusinessKey("KNOWLEDGE_DOCUMENT:" + document.getDocumentId());

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
            WorkflowCallbackConstants.applyCallbackMetadata(
                    variables,
                    OaBusinessTypes.KNOWLEDGE_DOCUMENT,
                    document.getDocumentId(),
                    document.getTitle(),
                    "workflow:stream:approval-callback:oa"
            );
            req.setVariables(variables);

            R<?> result = remoteWorkflowService.startProcess(req);
            instanceId = requireWorkflowInstanceId(document, result);
        } catch (Exception e) {
            log.error("知识库文档 {} 启动工作流失败，保持原状态 {}", document.getDocumentId(), document.getStatus(), e);
            if (e instanceof IllegalArgumentException) {
                throw (IllegalArgumentException) e;
            }
            throw new IllegalArgumentException("流程启动失败，请稍后重试");
        }

        return markSubmitted(document, instanceId);
    }

    @Override
    @Audit(name = "撤回知识库发布审批", spel = "#documentId")
    public boolean recall(Long documentId) {
        KnowledgeDocument document = requireDocument(documentId);
        DataScopeUtils.assertOwnership(document, KnowledgeDocument::getSubmitterId, "知识文档");
        if (!"PENDING".equals(document.getStatus())) {
            throw new IllegalArgumentException("只有审批中的文档可以撤回");
        }
        if (StringUtils.hasText(document.getInstanceId())) {
            WorkflowRecallDTO req = new WorkflowRecallDTO();
            req.setInstanceId(document.getInstanceId());
            R<?> result = remoteWorkflowService.recallProcess(req);
            if (result != null && result.getCode() != 200) {
                throw new IllegalArgumentException(result.getMsg() != null ? result.getMsg() : "流程撤回失败");
            }
        }
        return markRecalled(document);
    }

    @Transactional(rollbackFor = Exception.class)
    protected boolean markSubmitted(KnowledgeDocument document, String instanceId) {
        LocalDateTime now = LocalDateTime.now();
        document.setStatus("PENDING");
        document.setSubmitTime(now);
        document.setInstanceId(instanceId);
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(now);
        return updateById(document);
    }

    @Transactional(rollbackFor = Exception.class)
    protected boolean markRecalled(KnowledgeDocument document) {
        document.setStatus("DRAFT");
        document.setUpdateBy(UserContext.getUserName());
        document.setUpdateTime(LocalDateTime.now());
        return updateById(document);
    }

    @Override
    @Audit(name = "删除知识库文档", spel = "#documentId", diff = true, highRisk = true)
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
        update.setDeleted(1);
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
            read.setTenantId(UserContext.getTenantId() != null ? UserContext.getTenantId() : document.getTenantId());
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
    public DynamicMapVO getReadStats(Long documentId) {
        KnowledgeDocument document = requireDocument(documentId);
        LambdaQueryWrapper<KnowledgeRead> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeRead::getDocumentId, documentId)
                .orderByDesc(KnowledgeRead::getReadTime);
        List<KnowledgeRead> reads = readMapper.selectList(wrapper);
        List<Map<String, Object>> expectedUsers = selectExpectedReaders(document);
        Set<Long> readUserIds = reads.stream()
                .map(KnowledgeRead::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        List<Map<String, Object>> unreadUsers = expectedUsers.stream()
                .filter(user -> {
                    Long userId = mapUserId(user);
                    return userId != null && !readUserIds.contains(userId);
                })
                .collect(Collectors.toList());
        Map<String, Object> stats = new HashMap<>();
        stats.put("readCount", reads.size());
        stats.put("expectedCount", expectedUsers.size());
        stats.put("unreadCount", unreadUsers.size());
        stats.put("readUsers", reads);
        stats.put("unreadUsers", unreadUsers);
        return DynamicMapVO.from(stats);
    }

    private KnowledgeDocument requireDocument(Long documentId) {
        KnowledgeDocument document = getById(documentId);
        if (document == null || !Integer.valueOf(0).equals(document.getDeleted())) {
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
        } else {
            List<String> scopeValues = parseScopeValues(document.getScopeValue());
            if (scopeValues.isEmpty()) {
                throw new IllegalArgumentException("定向可见范围值不能为空");
            }
            document.setScopeValue(String.join(",", scopeValues));
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
        List<String> scopeValues = parseScopeValues(document.getScopeValue());
        if ("DEPT".equals(document.getScopeType())) {
            return UserContext.getDeptId() != null && scopeValues.contains(String.valueOf(UserContext.getDeptId()));
        }
        if ("ROLE".equals(document.getScopeType())) {
            Set<String> roles = UserContext.getRoles();
            return roles != null && roles.stream()
                    .filter(Objects::nonNull)
                    .anyMatch(scopeValues::contains);
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

    private String requireWorkflowInstanceId(KnowledgeDocument document, R<?> result) {
        if (result == null) {
            throw new IllegalArgumentException("流程启动失败：工作流服务无响应");
        }
        if (result.getCode() != R.SUCCESS) {
            throw new IllegalArgumentException(StringUtils.hasText(result.getMsg()) ? result.getMsg() : "流程启动失败");
        }
        if (result.getData() == null) {
            throw new IllegalArgumentException("流程启动失败：未返回流程实例");
        }
        String instanceId = extractInstanceId(result.getData());
        if (!StringUtils.hasText(instanceId)) {
            throw new IllegalArgumentException("流程启动失败：未返回流程实例ID");
        }
        log.info("知识库文档 {} 工作流启动成功，流程实例ID: {}", document.getDocumentId(), instanceId);
        return instanceId;
    }

    private List<String> parseScopeValues(String scopeValue) {
        if (!StringUtils.hasText(scopeValue)) {
            return Collections.emptyList();
        }
        Set<String> values = new LinkedHashSet<>();
        for (String value : scopeValue.split(",")) {
            if (StringUtils.hasText(value)) {
                values.add(value.trim());
            }
        }
        return new ArrayList<>(values);
    }

    private List<Map<String, Object>> selectExpectedReaders(KnowledgeDocument document) {
        List<String> scopeValues = parseScopeValues(document.getScopeValue());
        if (!"ALL".equals(document.getScopeType()) && scopeValues.isEmpty()) {
            return Collections.emptyList();
        }
        return normalizeUserRows(baseMapper.selectExpectedReaders(
                document.getTenantId(),
                document.getScopeType(),
                scopeValues
        ));
    }

    private List<Map<String, Object>> normalizeUserRows(List<Map<String, Object>> rows) {
        List<Map<String, Object>> result = new ArrayList<>();
        Set<Long> seenUserIds = new LinkedHashSet<>();
        for (Map<String, Object> row : rows) {
            Long userId = mapUserId(row);
            if (userId == null || !seenUserIds.add(userId)) {
                continue;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("userId", userId);
            item.put("userName", stringValue(rowValue(row, "userName", "user_name", "USER_NAME")));
            item.put("deptName", stringValue(rowValue(row, "deptName", "dept_name", "DEPT_NAME")));
            result.add(item);
        }
        return result;
    }

    private Long mapUserId(Map<String, Object> row) {
        Object value = rowValue(row, "userId", "user_id", "USER_ID");
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value != null && StringUtils.hasText(String.valueOf(value))) {
            return Long.valueOf(String.valueOf(value));
        }
        return null;
    }

    private Object rowValue(Map<String, Object> row, String... keys) {
        for (String key : keys) {
            if (row.containsKey(key)) {
                return row.get(key);
            }
        }
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            for (String key : keys) {
                if (entry.getKey().equalsIgnoreCase(key)) {
                    return entry.getValue();
                }
            }
        }
        return null;
    }

    private String stringValue(Object value) {
        return value != null ? String.valueOf(value) : "";
    }
}
