package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysLegalConsent;
import com.cloudflow.auth.domain.SysLegalDocument;
import com.cloudflow.auth.domain.SysLegalRelease;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.vo.LegalDocumentDetailVO;
import com.cloudflow.auth.domain.vo.LegalDocumentSummaryVO;
import com.cloudflow.auth.domain.vo.LegalReleaseVO;
import com.cloudflow.auth.mapper.SysLegalConsentMapper;
import com.cloudflow.auth.mapper.SysLegalDocumentMapper;
import com.cloudflow.auth.mapper.SysLegalReleaseMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.service.ILegalAgreementService;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.IpUtils;
import com.cloudflow.common.tenant.TenantBroker;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class LegalAgreementServiceImpl extends ServiceImpl<SysLegalReleaseMapper, SysLegalRelease> implements ILegalAgreementService {

    private static final long GLOBAL_TENANT_ID = 0L;
    private static final String STATUS_PUBLISHED = "PUBLISHED";
    private static final String DOCUMENT_STATUS_ACTIVE = "0";

    private final SysLegalDocumentMapper legalDocumentMapper;
    private final SysLegalConsentMapper legalConsentMapper;
    private final SysTenantMapper sysTenantMapper;

    @Override
    public LegalReleaseVO getActiveRelease(String tenantCode) {
        SysTenant tenant = resolveTenant(tenantCode);
        SysLegalRelease release = resolveActiveRelease(tenant != null ? tenant.getTenantId() : null);
        if (release == null) {
            throw new ServiceException("条款暂未配置，请联系管理员");
        }
        List<SysLegalDocument> documents = listDocuments(release);
        return toReleaseVO(release, documents);
    }

    @Override
    public LegalDocumentDetailVO getDocument(String tenantCode, String releaseCode, String docType) {
        SysTenant tenant = resolveTenant(tenantCode);
        SysLegalRelease release = resolveRelease(tenant != null ? tenant.getTenantId() : null, releaseCode);
        if (release == null) {
            throw new ServiceException("条款版本不存在或未发布");
        }
        SysLegalDocument document = TenantBroker.applyWithoutTenant(ignored -> legalDocumentMapper.selectOne(
                new LambdaQueryWrapper<SysLegalDocument>()
                        .eq(SysLegalDocument::getReleaseId, release.getReleaseId())
                        .eq(SysLegalDocument::getDocType, docType)
                        .eq(SysLegalDocument::getStatus, DOCUMENT_STATUS_ACTIVE)
                        .last("LIMIT 1")
        ));
        if (document == null) {
            throw new ServiceException("条款文档不存在或未发布");
        }
        return toDocumentDetailVO(document);
    }

    @Override
    public void assertCurrentReleaseAccepted(SysTenant tenant, String releaseCode) {
        SysLegalRelease activeRelease = resolveActiveRelease(tenant != null ? tenant.getTenantId() : null);
        if (activeRelease == null) {
            throw new ServiceException("条款暂未配置，请联系管理员");
        }
        if (!StringUtils.hasText(releaseCode) || !activeRelease.getReleaseCode().equals(releaseCode.trim())) {
            throw new ServiceException("请先阅读并同意最新条款");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void recordConsent(SysUser user, String releaseCode, HttpServletRequest request, String source) {
        if (user == null || !StringUtils.hasText(releaseCode)) {
            return;
        }
        SysLegalRelease release = resolveRelease(user.getTenantId(), releaseCode);
        if (release == null) {
            return;
        }
        Long existingCount = TenantBroker.applyWithoutTenant(ignored -> legalConsentMapper.selectCount(
                new LambdaQueryWrapper<SysLegalConsent>()
                        .eq(SysLegalConsent::getTenantId, user.getTenantId())
                        .eq(SysLegalConsent::getUserId, user.getUserId())
                        .eq(SysLegalConsent::getReleaseCode, release.getReleaseCode())
        ));
        if (existingCount != null && existingCount > 0) {
            return;
        }

        SysLegalConsent consent = new SysLegalConsent();
        consent.setTenantId(user.getTenantId());
        consent.setUserId(user.getUserId());
        consent.setUserName(user.getUserName());
        consent.setReleaseCode(release.getReleaseCode());
        consent.setDocumentSnapshot(buildDocumentSnapshot(release));
        consent.setAcceptedAt(LocalDateTime.now());
        consent.setAcceptedIp(IpUtils.getIpAddr(request));
        consent.setUserAgent(truncate(request != null ? request.getHeader("User-Agent") : null, 512));
        consent.setSource(StringUtils.hasText(source) ? source : "LOGIN");
        consent.setCreateBy(user.getUserName());
        consent.setCreateTime(consent.getAcceptedAt());
        TenantBroker.runWithoutTenant(() -> legalConsentMapper.insert(consent));
    }

    private SysTenant resolveTenant(String tenantCode) {
        if (!StringUtils.hasText(tenantCode)) {
            return null;
        }
        return TenantBroker.applyWithoutTenant(ignored -> sysTenantMapper.selectOne(
                new LambdaQueryWrapper<SysTenant>()
                        .eq(SysTenant::getTenantCode, tenantCode.trim())
                        .eq(SysTenant::getStatus, "0")
                        .last("LIMIT 1")
        ));
    }

    private SysLegalRelease resolveActiveRelease(Long tenantId) {
        SysLegalRelease tenantRelease = findLatestPublished(tenantId);
        return tenantRelease != null ? tenantRelease : findLatestPublished(GLOBAL_TENANT_ID);
    }

    private SysLegalRelease resolveRelease(Long tenantId, String releaseCode) {
        if (!StringUtils.hasText(releaseCode)) {
            return null;
        }
        SysLegalRelease tenantRelease = findPublishedByCode(tenantId, releaseCode.trim());
        return tenantRelease != null ? tenantRelease : findPublishedByCode(GLOBAL_TENANT_ID, releaseCode.trim());
    }

    private SysLegalRelease findLatestPublished(Long tenantId) {
        if (tenantId == null) {
            return null;
        }
        return TenantBroker.applyWithoutTenant(ignored -> this.getOne(
                new LambdaQueryWrapper<SysLegalRelease>()
                        .eq(SysLegalRelease::getTenantId, tenantId)
                        .eq(SysLegalRelease::getStatus, STATUS_PUBLISHED)
                        .orderByDesc(SysLegalRelease::getEffectiveDate)
                        .orderByDesc(SysLegalRelease::getReleaseId)
                        .last("LIMIT 1")
        ));
    }

    private SysLegalRelease findPublishedByCode(Long tenantId, String releaseCode) {
        if (tenantId == null) {
            return null;
        }
        return TenantBroker.applyWithoutTenant(ignored -> this.getOne(
                new LambdaQueryWrapper<SysLegalRelease>()
                        .eq(SysLegalRelease::getTenantId, tenantId)
                        .eq(SysLegalRelease::getReleaseCode, releaseCode)
                        .eq(SysLegalRelease::getStatus, STATUS_PUBLISHED)
                        .last("LIMIT 1")
        ));
    }

    private List<SysLegalDocument> listDocuments(SysLegalRelease release) {
        return TenantBroker.applyWithoutTenant(ignored -> legalDocumentMapper.selectList(
                new LambdaQueryWrapper<SysLegalDocument>()
                        .eq(SysLegalDocument::getReleaseId, release.getReleaseId())
                        .eq(SysLegalDocument::getStatus, DOCUMENT_STATUS_ACTIVE)
                        .orderByAsc(SysLegalDocument::getSortOrder)
                        .orderByAsc(SysLegalDocument::getDocumentId)
        ));
    }

    private LegalReleaseVO toReleaseVO(SysLegalRelease release, List<SysLegalDocument> documents) {
        return LegalReleaseVO.builder()
                .releaseCode(release.getReleaseCode())
                .title(release.getTitle())
                .effectiveDate(release.getEffectiveDate())
                .description(release.getDescription())
                .documents(documents.stream().map(this::toDocumentSummaryVO).collect(Collectors.toList()))
                .build();
    }

    private LegalDocumentSummaryVO toDocumentSummaryVO(SysLegalDocument document) {
        return LegalDocumentSummaryVO.builder()
                .docType(document.getDocType())
                .title(document.getTitle())
                .version(document.getVersion())
                .required(Integer.valueOf(1).equals(document.getRequired()))
                .sortOrder(document.getSortOrder())
                .hasContent(StringUtils.hasText(document.getContent()))
                .hasExternalUrl(StringUtils.hasText(document.getExternalUrl()))
                .build();
    }

    private LegalDocumentDetailVO toDocumentDetailVO(SysLegalDocument document) {
        return LegalDocumentDetailVO.builder()
                .releaseCode(document.getReleaseCode())
                .docType(document.getDocType())
                .title(document.getTitle())
                .version(document.getVersion())
                .content(document.getContent())
                .externalUrl(document.getExternalUrl())
                .required(Integer.valueOf(1).equals(document.getRequired()))
                .build();
    }

    private String buildDocumentSnapshot(SysLegalRelease release) {
        List<SysLegalDocument> documents = listDocuments(release);
        String docs = documents.stream()
                .map(document -> document.getDocType() + ":" + document.getVersion())
                .collect(Collectors.joining(","));
        return truncate("{\"releaseCode\":\"" + release.getReleaseCode() + "\",\"documents\":\"" + docs + "\"}", 2000);
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
