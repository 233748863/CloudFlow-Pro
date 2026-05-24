package com.cloudflow.common.handler;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.common.tenant.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * MyBatis-Plus 自动填充处理器
 * 用于自动填充实体类的审计字段（创建人、创建时间、修改人、修改时间、删除标记）
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class MyMetaObjectHandler implements MetaObjectHandler {

    /**
     * 插入时自动填充
     * 填充字段：createBy、createTime、updateBy、updateTime、deleted
     */
    @Override
    public void insertFill(MetaObject metaObject) {
        log.debug("开始插入填充...");
        
        // 获取当前登录用户名
        String username = getUsername();
        
        // 填充创建人
        this.strictInsertFill(metaObject, "createBy", String.class, username);
        
        // 填充创建时间
        this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, LocalDateTime.now());
        
        // 填充修改人（插入时也填充，保持一致性）
        this.strictInsertFill(metaObject, "updateBy", String.class, username);
        
        // 填充修改时间（插入时也填充，保持一致性）
        this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
        
        // 填充逻辑删除标志（默认为0，表示未删除）
        this.strictInsertFill(metaObject, "deleted", Integer.class, 0);

        // 兜底填充 tenant_id：MP TenantLineInnerInterceptor 走 SQL parse 注入，
        // 自定义 XML 已成 SQL / entity 显式 setTenantId(null) 等场景可能绕过；
        // 此处仅在实体有 tenantId 字段且当前值为 null 时补齐，避免覆盖业务显式赋值。
        Long tenantId = TenantContext.getTenantId();
        if (tenantId != null && metaObject.hasGetter("tenantId") && metaObject.getValue("tenantId") == null) {
            this.strictInsertFill(metaObject, "tenantId", Long.class, tenantId);
        }
    }

    /**
     * 更新时自动填充
     * 填充字段：updateBy、updateTime
     */
    @Override
    public void updateFill(MetaObject metaObject) {
        log.debug("开始更新填充...");
        
        // 获取当前登录用户名
        String username = getUsername();
        
        // 填充修改人
        this.strictUpdateFill(metaObject, "updateBy", String.class, username);
        
        // 填充修改时间
        this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
    }

    /**
     * 获取当前登录用户名
     * 如果获取失败，返回"system"作为默认值
     * 
     * @return 用户名
     */
    private String getUsername() {
        try {
            String username = SecurityUtils.getUsername();
            return username != null ? username : "system";
        } catch (Exception e) {
            log.warn("获取当前用户名失败，使用默认值: system", e);
            return "system";
        }
    }
}
