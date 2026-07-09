package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

abstract class CrmServiceSupport<M extends com.baomidou.mybatisplus.core.mapper.BaseMapper<T>, T>
        extends ServiceImpl<M, T> {

    protected PageResult<T> pageResult(PageQuery pageQuery, LambdaQueryWrapper<T> wrapper) {
        return PageResult.build(page(pageQuery.build(), wrapper));
    }

    protected String currentUserName() {
        return StringUtils.hasText(UserContext.getUserName()) ? UserContext.getUserName() : "system";
    }

    protected Long currentTenantId() {
        Long tenantId = UserContext.getTenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("tenantId不能为空");
        }
        return tenantId;
    }

    protected LocalDateTime now() {
        return LocalDateTime.now();
    }

    protected T requireById(Long id, String missingMessage) {
        T entity = getById(id);
        if (entity == null) {
            throw new IllegalArgumentException(missingMessage);
        }
        return entity;
    }

    protected <V> LambdaQueryWrapper<T> eqIfPresent(LambdaQueryWrapper<T> wrapper,
                                                    SFunction<T, V> column,
                                                    V value) {
        if (value != null) {
            wrapper.eq(column, value);
        }
        return wrapper;
    }

    protected LambdaQueryWrapper<T> likeIfPresent(LambdaQueryWrapper<T> wrapper,
                                                  SFunction<T, String> column,
                                                  String value) {
        if (StringUtils.hasText(value)) {
            wrapper.like(column, value);
        }
        return wrapper;
    }
}
