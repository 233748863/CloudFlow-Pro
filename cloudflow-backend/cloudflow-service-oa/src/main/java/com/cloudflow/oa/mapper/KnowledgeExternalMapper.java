package com.cloudflow.oa.mapper;

import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.cloudflow.oa.domain.KnowledgeDocVersion;
import com.cloudflow.oa.domain.KnowledgeDocument;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgeExternalStateVO;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface KnowledgeExternalMapper {
    KnowledgeDocument document(@Param("tenantId") Long tenantId, @Param("documentId") Long documentId,
            @Param("lock") boolean lock, @Param("dataScope") DataScope dataScope);

    KnowledgeDocVersion version(@Param("tenantId") Long tenantId, @Param("documentId") Long documentId,
            @Param("versionId") Long versionId);

    List<KnowledgeExternalStateVO.Version> versions(@Param("tenantId") Long tenantId, @Param("documentId") Long documentId);

    int writePublication(@Param("document") KnowledgeDocument document, @Param("versionId") Long versionId,
            @Param("visible") boolean visible, @Param("attachmentFileIds") String attachmentFileIds);

    List<PortalKnowledgeVO.Attachment> attachments(@Param("tenantId") Long tenantId, @Param("documentId") Long documentId,
            @Param("fileIds") List<Long> fileIds);
}
