package com.cloudflow.oa.controller;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.oa.domain.dto.ContractPortalSelectionRequest;
import com.cloudflow.oa.domain.vo.ContractPortalPublicationVO;
import com.cloudflow.oa.service.impl.ContractPortalPublicationService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/contract/{id}/portal-publication")
@RequiredArgsConstructor
public class ContractPortalPublicationController {
    private final ContractPortalPublicationService publication;

    @GetMapping
    @SaCheckPermission("oa:contract:edit")
    public R<ContractPortalPublicationVO> read(@PathVariable Long id, HttpServletRequest request) {
        requireNoQuery(request);
        return R.ok(publication.read(id));
    }

    @PutMapping
    @SaCheckPermission("oa:contract:edit")
    @RepeatSubmit
    @SysLog("维护客户合同公开范围")
    public R<ContractPortalPublicationVO> save(@PathVariable Long id, @RequestBody @Valid ContractPortalSelectionRequest selection,
            HttpServletRequest request) {
        requireNoQuery(request);
        return R.ok(publication.save(id, selection));
    }

    private static void requireNoQuery(HttpServletRequest request) {
        if (!request.getParameterMap().isEmpty()) throw new ServiceException("请求包含不允许的查询条件", 400);
    }
}
