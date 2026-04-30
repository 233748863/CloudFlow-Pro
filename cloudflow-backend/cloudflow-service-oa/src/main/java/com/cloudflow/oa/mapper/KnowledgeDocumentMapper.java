package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.KnowledgeDocument;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Map;
import java.util.Set;

@Mapper
public interface KnowledgeDocumentMapper extends BaseMapper<KnowledgeDocument> {

    List<KnowledgeDocument> selectPublishedForUser(@Param("userId") Long userId,
                                                   @Param("deptId") String deptId,
                                                   @Param("roleIds") Set<String> roleIds,
                                                   @Param("keyword") String keyword,
                                                   @Param("category") String category,
                                                   @Param("unreadOnly") Boolean unreadOnly);

    List<Map<String, Object>> selectExpectedReaders(@Param("tenantId") Long tenantId,
                                                    @Param("scopeType") String scopeType,
                                                    @Param("scopeValues") List<String> scopeValues);
}
