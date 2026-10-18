package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.domain.PortalKnowledgeVO;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.cloudflow.oa.domain.vo.knowledge.KnowledgePublication;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PortalKnowledgeMapper {
    boolean activeIdentity(@Param("identity") PortalIdentity identity);

    Page<PortalKnowledgeVO> published(Page<PortalKnowledgeVO> page,
            @Param("identity") PortalIdentity identity, @Param("keyword") String keyword);

    KnowledgePublication detail(@Param("identity") PortalIdentity identity, @Param("documentId") Long documentId);
}
