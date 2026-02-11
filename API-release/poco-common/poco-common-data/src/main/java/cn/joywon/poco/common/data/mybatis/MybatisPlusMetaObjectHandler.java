package cn.joywon.poco.common.data.mybatis;

import cn.hutool.core.util.StrUtil;
import cn.joywon.poco.common.core.constant.CommonConstants;
import cn.joywon.poco.common.security.util.SecurityUtils;
import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import lombok.extern.slf4j.Slf4j;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.ClassUtils;

import java.nio.charset.Charset;
import java.time.LocalDateTime;
import java.util.Optional;

/**
 * MybatisPlus 自动填充配置
 *
 * @author L.cm
 */
@Slf4j
@Component
public class MybatisPlusMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        log.debug("mybatis plus start insert fill ....");
        LocalDateTime now = LocalDateTime.now();

        // 审计字段自动填充,覆盖用户输入
        fillValIfNullByName("createTime", now, metaObject, true);
        fillValIfNullByName("createdTime", now, metaObject, true);
        fillValIfNullByName("updateTime", now, metaObject, true);
        fillValIfNullByName("updatedTime", now, metaObject, true);
        
        String userName = getUserName();
        Long userId = getUserId();
        log.debug("获取到的 user name: {}, user id: {}", userName, userId);
        
        fillValIfNullByName("createBy", userName, metaObject, true);
        fillValIfNullByName("updateBy", userName, metaObject, true);
        Object createdByVal = null;
        if (userId != null && metaObject.hasSetter("createdBy")) {
            Class<?> t = metaObject.getGetterType("createdBy");
            if (ClassUtils.isAssignableValue(t, userId)) {
                createdByVal = userId;
            } else if (org.springframework.util.ClassUtils.isAssignableValue(t, String.valueOf(userId))) {
                createdByVal = String.valueOf(userId);
            }
        }
        fillValIfNullByName("createdBy", createdByVal, metaObject, true);
        Object updatedByVal = null;
        if (userId != null && metaObject.hasSetter("updatedBy")) {
            Class<?> t2 = metaObject.getGetterType("updatedBy");
            if (ClassUtils.isAssignableValue(t2, userId)) {
                updatedByVal = userId;
            } else if (ClassUtils.isAssignableValue(t2, String.valueOf(userId))) {
                updatedByVal = String.valueOf(userId);
            }
        }
        fillValIfNullByName("updatedBy", updatedByVal, metaObject, true);

        // 删除标记自动填充
        fillValIfNullByName("delFlag", CommonConstants.STATUS_NORMAL, metaObject, true);
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        log.debug("mybatis plus start update fill ....");
        LocalDateTime now = LocalDateTime.now();
        String userName = getUserName();
        Long userId = getUserId();
        log.debug("获取到的 user name: {}, user id: {}", userName, userId);
        
        fillValIfNullByName("updateTime", now, metaObject, true);
        fillValIfNullByName("updatedTime", now, metaObject, true);
        fillValIfNullByName("updateBy", userName, metaObject, true);
        Object updatedByVal2 = null;
        if (userId != null && metaObject.hasSetter("updatedBy")) {
            Class<?> t3 = metaObject.getGetterType("updatedBy");
            if (ClassUtils.isAssignableValue(t3, userId)) {
                updatedByVal2 = userId;
            } else if (ClassUtils.isAssignableValue(t3, String.valueOf(userId))) {
                updatedByVal2 = String.valueOf(userId);
            }
        }
        fillValIfNullByName("updatedBy", updatedByVal2, metaObject, true);
    }

    /**
     * 填充值，先判断是否有手动设置，优先手动设置的值，例如：job必须手动设置
     *
     * @param fieldName  属性名
     * @param fieldVal   属性值
     * @param metaObject MetaObject
     * @param isCover    是否覆盖原有值,避免更新操作手动入参
     */
    private static void fillValIfNullByName(String fieldName, Object fieldVal, MetaObject metaObject, boolean isCover) {
        // 0. 如果填充值为空
        if (fieldVal == null) {
            return;
        }
        // 1. 没有 get 方法
        if (!metaObject.hasSetter(fieldName)) {
            return;
        }
        // 2. 如果用户有手动设置的值
        Object userSetValue = metaObject.getValue(fieldName);
        String setValueStr = StrUtil.str(userSetValue, Charset.defaultCharset());
        if (StrUtil.isNotBlank(setValueStr) && !isCover) {
            return;
        }
        // 3. field 类型相同时设置
        Class<?> getterType = metaObject.getGetterType(fieldName);
        if (ClassUtils.isAssignableValue(getterType, fieldVal)) {
            metaObject.setValue(fieldName, fieldVal);
        }
    }

    /**
     * 获取 spring security 当前的用户名
     *
     * @return 当前用户名
     */
    private String getUserName() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        // 匿名接口直接返回
        if (authentication instanceof AnonymousAuthenticationToken) {
            return null;
        }

        if (Optional.ofNullable(authentication).isPresent()) {
            return authentication.getName();
        }

        return null;
    }


    private Long getUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        // 匿名接口直接返回
        if (authentication instanceof AnonymousAuthenticationToken) {
            return null;
        }
        if (Optional.ofNullable(authentication).isPresent()) {
            return SecurityUtils.getUser(authentication).getId();
        }
        return null;
    }


}