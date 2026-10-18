package com.cloudflow.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.auth.domain.SysPrintTemplate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface SysPrintTemplateMapper extends BaseMapper<SysPrintTemplate> {
    @Select("SELECT COUNT(*) FROM sys_print_template WHERE tenant_id = #{tenantId} AND template_code = #{code} "
            + "AND (#{id} IS NULL OR template_id != #{id})")
    long countCode(@Param("tenantId") Long tenantId, @Param("code") String code, @Param("id") Long id);

    /** 锁住已有租户行，空模板集合也能串行化默认模板切换。 */
    @Select("SELECT tenant_id FROM sys_tenant WHERE tenant_id = #{tenantId} AND deleted = 0 FOR UPDATE")
    Long lockTenant(@Param("tenantId") Long tenantId);

    @Update("UPDATE sys_print_template SET default_flag = 0, version = version + 1, "
            + "update_by = #{operator}, update_time = CURRENT_TIMESTAMP "
            + "WHERE tenant_id = #{tenantId} AND biz_type = #{bizType} AND deleted = 0 "
            + "AND default_flag = 1 AND template_id != #{templateId}")
    int clearOtherDefaults(@Param("tenantId") Long tenantId, @Param("bizType") String bizType,
                           @Param("templateId") Long templateId, @Param("operator") String operator);
}
