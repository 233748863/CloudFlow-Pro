package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.oa.domain.KnowledgeDocVersion;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.mapper.KnowledgeDocVersionMapper;
import com.cloudflow.oa.mapper.KnowledgeDocumentMapper;
import com.cloudflow.oa.service.IKnowledgeVersionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * OA-P0-1 知识库版本服务实现。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KnowledgeVersionServiceImpl implements IKnowledgeVersionService {

    private final KnowledgeDocVersionMapper versionMapper;
    private final KnowledgeDocumentMapper documentMapper;

    @Override
    @Transactional
    public Long snapshot(KnowledgeDocument document, String changeSummary) {
        if (document == null || document.getDocumentId() == null) {
            return null;
        }
        Integer nextVersion = nextVersionNo(document.getDocumentId());
        KnowledgeDocVersion version = new KnowledgeDocVersion();
        version.setTenantId(document.getTenantId());
        version.setDocumentId(document.getDocumentId());
        version.setVersionNo(nextVersion);
        version.setTitle(document.getTitle());
        version.setSummary(document.getSummary());
        version.setContent(document.getContent());
        version.setAttachmentUrl(document.getAttachmentUrl());
        version.setChangeSummary(changeSummary);
        version.setOperatorId(UserContext.getUserId());
        version.setOperatorName(UserContext.getUserName());
        version.setPublishTime(LocalDateTime.now());
        version.setCreateBy(UserContext.getUserName());
        version.setUpdateBy(UserContext.getUserName());
        versionMapper.insert(version);
        log.info("知识库版本快照已生成: documentId={}, versionNo={}", document.getDocumentId(), nextVersion);
        return version.getId();
    }

    @Override
    public List<KnowledgeDocVersion> listVersions(Long documentId) {
        if (documentId == null) {
            return List.of();
        }
        LambdaQueryWrapper<KnowledgeDocVersion> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeDocVersion::getDocumentId, documentId)
                .eq(KnowledgeDocVersion::getDeleted, 0)
                .orderByDesc(KnowledgeDocVersion::getVersionNo);
        return versionMapper.selectList(wrapper);
    }

    @Override
    public KnowledgeDocVersion getVersion(Long documentId, Integer versionNo) {
        if (documentId == null || versionNo == null) {
            return null;
        }
        LambdaQueryWrapper<KnowledgeDocVersion> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeDocVersion::getDocumentId, documentId)
                .eq(KnowledgeDocVersion::getVersionNo, versionNo)
                .eq(KnowledgeDocVersion::getDeleted, 0);
        return versionMapper.selectOne(wrapper);
    }

    @Override
    public Map<String, Object> diff(Long documentId, Integer fromVersion, Integer toVersion) {
        KnowledgeDocVersion from = getVersion(documentId, fromVersion);
        KnowledgeDocVersion to = getVersion(documentId, toVersion);
        if (from == null || to == null) {
            throw new IllegalArgumentException("指定版本不存在");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("fromVersion", from);
        result.put("toVersion", to);
        result.put("titleChanged", !Objects.equals(from.getTitle(), to.getTitle()));
        result.put("summaryChanged", !Objects.equals(from.getSummary(), to.getSummary()));
        result.put("attachmentChanged", !Objects.equals(from.getAttachmentUrl(), to.getAttachmentUrl()));
        result.put("contentDiff", lineDiff(from.getContent(), to.getContent()));
        return result;
    }

    @Override
    @Transactional
    public boolean rollback(Long documentId, Integer versionNo) {
        KnowledgeDocVersion target = getVersion(documentId, versionNo);
        if (target == null) {
            throw new IllegalArgumentException("回滚目标版本不存在");
        }
        KnowledgeDocument document = documentMapper.selectById(documentId);
        if (document == null) {
            throw new IllegalArgumentException("文档不存在");
        }
        LambdaUpdateWrapper<KnowledgeDocument> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(KnowledgeDocument::getDocumentId, documentId)
                .set(KnowledgeDocument::getTitle, target.getTitle())
                .set(KnowledgeDocument::getSummary, target.getSummary())
                .set(KnowledgeDocument::getContent, target.getContent())
                .set(KnowledgeDocument::getAttachmentUrl, target.getAttachmentUrl())
                .set(KnowledgeDocument::getUpdateBy, UserContext.getUserName())
                .set(KnowledgeDocument::getUpdateTime, LocalDateTime.now());
        int updated = documentMapper.update(null, wrapper);
        if (updated <= 0) {
            return false;
        }
        // 同步生成一个新版本，记录回滚来源
        document.setTitle(target.getTitle());
        document.setSummary(target.getSummary());
        document.setContent(target.getContent());
        document.setAttachmentUrl(target.getAttachmentUrl());
        snapshot(document, "回滚自 v" + versionNo);
        return true;
    }

    private Integer nextVersionNo(Long documentId) {
        LambdaQueryWrapper<KnowledgeDocVersion> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(KnowledgeDocVersion::getDocumentId, documentId)
                .orderByDesc(KnowledgeDocVersion::getVersionNo)
                .last("LIMIT 1");
        KnowledgeDocVersion latest = versionMapper.selectOne(wrapper);
        return latest == null ? 1 : latest.getVersionNo() + 1;
    }

    /**
     * 朴素行级差异。返回 [{type:'EQUAL'|'ADD'|'DEL', text}]。
     */
    private List<Map<String, Object>> lineDiff(String fromText, String toText) {
        List<String> fromLines = splitLines(fromText);
        List<String> toLines = splitLines(toText);
        List<Map<String, Object>> diff = new ArrayList<>();
        int i = 0, j = 0;
        while (i < fromLines.size() && j < toLines.size()) {
            if (Objects.equals(fromLines.get(i), toLines.get(j))) {
                diff.add(Map.of("type", "EQUAL", "text", fromLines.get(i)));
                i++;
                j++;
            } else {
                int matchFrom = toLines.subList(j, Math.min(j + 20, toLines.size())).indexOf(fromLines.get(i));
                int matchTo = fromLines.subList(i, Math.min(i + 20, fromLines.size())).indexOf(toLines.get(j));
                if (matchTo == -1 && matchFrom == -1) {
                    diff.add(Map.of("type", "DEL", "text", fromLines.get(i)));
                    diff.add(Map.of("type", "ADD", "text", toLines.get(j)));
                    i++;
                    j++;
                } else if (matchTo == -1 || (matchFrom != -1 && matchFrom <= matchTo)) {
                    diff.add(Map.of("type", "ADD", "text", toLines.get(j)));
                    j++;
                } else {
                    diff.add(Map.of("type", "DEL", "text", fromLines.get(i)));
                    i++;
                }
            }
        }
        while (i < fromLines.size()) {
            diff.add(Map.of("type", "DEL", "text", fromLines.get(i++)));
        }
        while (j < toLines.size()) {
            diff.add(Map.of("type", "ADD", "text", toLines.get(j++)));
        }
        return diff;
    }

    private List<String> splitLines(String text) {
        if (!StringUtils.hasText(text)) return List.of();
        return new ArrayList<>(List.of(text.split("\\r?\\n", -1)));
    }
}
