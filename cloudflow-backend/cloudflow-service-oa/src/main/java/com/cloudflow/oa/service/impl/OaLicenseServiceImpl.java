package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.mapper.OaLicenseMapper;
import com.cloudflow.oa.service.IOaLicenseService;
import com.cloudflow.oa.util.OaBorrowConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 证照台账服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaLicenseServiceImpl extends ServiceImpl<OaLicenseMapper, OaLicense> implements IOaLicenseService {

    private final OaLicenseBorrowMapper licenseBorrowMapper;

    @Override
    public PageResult<OaLicense> queryPage(OaLicense query, PageQuery pageQuery) {
        LambdaQueryWrapper<OaLicense> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(query.getLicenseName()), OaLicense::getLicenseName, query.getLicenseName())
                .like(StringUtils.hasText(query.getLicenseCode()), OaLicense::getLicenseCode, query.getLicenseCode())
                .like(StringUtils.hasText(query.getLicenseNo()), OaLicense::getLicenseNo, query.getLicenseNo())
                .eq(StringUtils.hasText(query.getLicenseType()), OaLicense::getLicenseType, query.getLicenseType())
                .eq(StringUtils.hasText(query.getStatus()), OaLicense::getStatus, query.getStatus())
                .eq(OaLicense::getDelFlag, "0")
                .orderByDesc(OaLicense::getCreateTime);
        Page<OaLicense> page = page(pageQuery.build(), wrapper);
        return PageResult.build(page);
    }

    @Override
    public List<OaLicense> listAvailable() {
        return list(new LambdaQueryWrapper<OaLicense>()
                .eq(OaLicense::getStatus, OaBorrowConstants.RESOURCE_AVAILABLE)
                .eq(OaLicense::getDelFlag, "0")
                .orderByAsc(OaLicense::getLicenseName));
    }

    @Override
    public OaLicense getLicenseInfo(Long id) {
        OaLicense license = getById(id);
        if (license == null || !"0".equals(license.getDelFlag())) {
            throw new IllegalArgumentException("证照不存在");
        }
        return license;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean createLicense(OaLicense license) {
        validateLicense(license);
        LocalDateTime now = LocalDateTime.now();
        license.setTenantId(resolveTenantId());
        license.setStatus(StringUtils.hasText(license.getStatus()) ? license.getStatus() : OaBorrowConstants.RESOURCE_AVAILABLE);
        license.setDelFlag("0");
        license.setCreateBy(UserContext.getUserName());
        license.setCreateTime(now);
        license.setUpdateBy(UserContext.getUserName());
        license.setUpdateTime(now);
        return save(license);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean updateLicense(OaLicense license) {
        if (license == null || license.getLicenseId() == null) {
            throw new IllegalArgumentException("证照ID不能为空");
        }
        OaLicense persisted = getById(license.getLicenseId());
        if (persisted == null || !"0".equals(persisted.getDelFlag())) {
            throw new IllegalArgumentException("证照不存在");
        }
        if (OaBorrowConstants.RESOURCE_BORROWED.equals(persisted.getStatus())
                && OaBorrowConstants.RESOURCE_DISABLED.equals(license.getStatus())) {
            throw new IllegalArgumentException("借出中的证照不能停用");
        }
        validateLicense(license);
        license.setUpdateBy(UserContext.getUserName());
        license.setUpdateTime(LocalDateTime.now());
        return updateById(license);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean removeLicenses(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return true;
        }
        LocalDateTime now = LocalDateTime.now();
        for (Long id : ids) {
            OaLicense license = getById(id);
            if (license == null || !"0".equals(license.getDelFlag())) {
                continue;
            }
            if (OaBorrowConstants.RESOURCE_BORROWED.equals(license.getStatus())) {
                throw new IllegalArgumentException("借出中的证照不能删除：" + license.getLicenseName());
            }
            Long usageCount = licenseBorrowMapper.selectCount(new LambdaQueryWrapper<OaLicenseBorrow>()
                    .eq(OaLicenseBorrow::getLicenseId, id)
                    .eq(OaLicenseBorrow::getDelFlag, "0"));
            OaLicense update = new OaLicense();
            update.setLicenseId(id);
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

    private void validateLicense(OaLicense license) {
        if (license == null) {
            throw new IllegalArgumentException("证照信息不能为空");
        }
        if (!StringUtils.hasText(license.getLicenseCode())) {
            throw new IllegalArgumentException("证照编码不能为空");
        }
        if (!StringUtils.hasText(license.getLicenseName())) {
            throw new IllegalArgumentException("证照名称不能为空");
        }
        if (!StringUtils.hasText(license.getLicenseType())) {
            throw new IllegalArgumentException("证照类型不能为空");
        }
    }

    private Long resolveTenantId() {
        return UserContext.getTenantId() == null ? OaBorrowConstants.DEFAULT_TENANT_ID : UserContext.getTenantId();
    }
}
