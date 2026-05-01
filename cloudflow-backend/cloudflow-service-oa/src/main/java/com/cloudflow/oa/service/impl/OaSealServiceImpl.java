package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaSeal;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.mapper.OaSealMapper;
import com.cloudflow.oa.service.IOaSealService;
import com.cloudflow.oa.util.OaBorrowConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 印章台账服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaSealServiceImpl extends ServiceImpl<OaSealMapper, OaSeal> implements IOaSealService {

    private final OaSealApplicationMapper sealApplicationMapper;

    @Override
    public PageResult<OaSeal> queryPage(OaSeal query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaSeal> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(query.getSealName()), OaSeal::getSealName, query.getSealName())
                .like(StringUtils.hasText(query.getSealCode()), OaSeal::getSealCode, query.getSealCode())
                .eq(StringUtils.hasText(query.getSealType()), OaSeal::getSealType, query.getSealType())
                .eq(StringUtils.hasText(query.getStatus()), OaSeal::getStatus, query.getStatus())
                .eq(OaSeal::getDelFlag, "0")
                .orderByDesc(OaSeal::getCreateTime);
        Page<OaSeal> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<OaSeal> listAvailable() {
        return list(new LambdaQueryWrapper<OaSeal>()
                .eq(OaSeal::getStatus, OaBorrowConstants.RESOURCE_AVAILABLE)
                .eq(OaSeal::getDelFlag, "0")
                .orderByAsc(OaSeal::getSealName));
    }

    @Override
    public OaSeal getSealInfo(Long id) {
        OaSeal seal = getById(id);
        if (seal == null || !"0".equals(seal.getDelFlag())) {
            throw new IllegalArgumentException("印章不存在");
        }
        return seal;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createSeal(OaSeal seal) {
        validateSeal(seal);
        LocalDateTime now = LocalDateTime.now();
        seal.setTenantId(resolveTenantId());
        seal.setStatus(StringUtils.hasText(seal.getStatus()) ? seal.getStatus() : OaBorrowConstants.RESOURCE_AVAILABLE);
        seal.setDelFlag("0");
        seal.setCreateBy(UserContext.getUserName());
        seal.setCreateTime(now);
        seal.setUpdateBy(UserContext.getUserName());
        seal.setUpdateTime(now);
        return save(seal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateSeal(OaSeal seal) {
        if (seal == null || seal.getSealId() == null) {
            throw new IllegalArgumentException("印章ID不能为空");
        }
        OaSeal persisted = getById(seal.getSealId());
        if (persisted == null || !"0".equals(persisted.getDelFlag())) {
            throw new IllegalArgumentException("印章不存在");
        }
        if (OaBorrowConstants.RESOURCE_BORROWED.equals(persisted.getStatus())
                && OaBorrowConstants.RESOURCE_DISABLED.equals(seal.getStatus())) {
            throw new IllegalArgumentException("借出中的印章不能停用");
        }
        validateSeal(seal);
        seal.setUpdateBy(UserContext.getUserName());
        seal.setUpdateTime(LocalDateTime.now());
        return updateById(seal);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeSeals(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Long id : ids) {
            OaSeal seal = getById(id);
            if (seal == null || !"0".equals(seal.getDelFlag())) {
                continue;
            }
            if (OaBorrowConstants.RESOURCE_BORROWED.equals(seal.getStatus())) {
                throw new IllegalArgumentException("借出中的印章不能删除：" + seal.getSealName());
            }
            Long usageCount = sealApplicationMapper.selectCount(new LambdaQueryWrapper<OaSealApplication>()
                    .eq(OaSealApplication::getSealId, id)
                    .eq(OaSealApplication::getDelFlag, "0"));
            OaSeal update = new OaSeal();
            update.setSealId(id);
            update.setUpdateBy(UserContext.getUserName());
            update.setUpdateTime(now);
            if (usageCount != null && usageCount > 0) {
                update.setDelFlag("1");
                updateById(update);
            } else {
                removeById(id);
            }
        }
        return true;
    }

    private void validateSeal(OaSeal seal) {
        if (seal == null) {
            throw new IllegalArgumentException("印章信息不能为空");
        }
        if (!StringUtils.hasText(seal.getSealCode())) {
            throw new IllegalArgumentException("印章编码不能为空");
        }
        if (!StringUtils.hasText(seal.getSealName())) {
            throw new IllegalArgumentException("印章名称不能为空");
        }
        if (!StringUtils.hasText(seal.getSealType())) {
            throw new IllegalArgumentException("印章类型不能为空");
        }
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }
}
