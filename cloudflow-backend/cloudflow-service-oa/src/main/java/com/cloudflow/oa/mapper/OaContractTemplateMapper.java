package com.cloudflow.oa.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.oa.domain.OaContractTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

@Mapper
public interface OaContractTemplateMapper extends BaseMapper<OaContractTemplate> {
    OaContractTemplate selectForUpdate(@org.apache.ibatis.annotations.Param("id") Long id, @org.apache.ibatis.annotations.Param("tenantId") Long tenantId);

    record Usage(Long templateId, long usageCount) { }

    @Select("""
            <script>
            SELECT template_id AS templateId, COUNT(*) AS usageCount FROM oa_contract
            WHERE tenant_id = #{tenantId} AND deleted = 0 AND template_id IN
            <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
            GROUP BY template_id
            </script>
            """)
    List<Usage> usageCounts(@Param("tenantId") Long tenantId, @Param("ids") List<Long> ids);
}
