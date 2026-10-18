package com.cloudflow.auth.controller;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.datasource.runtime.DataSourceApplyRequest;
import com.cloudflow.common.datasource.runtime.DataSourceControlSignature;
import com.cloudflow.common.datasource.runtime.DataSourceInstanceIdentity;
import com.cloudflow.common.datasource.runtime.DataSourceRuntimeManager;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.security.annotation.Inner;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/inner/auth/data-source")
@RequiredArgsConstructor
public class DataSourceRuntimeController {
    private final DataSourceControlSignature signature;
    private final DataSourceInstanceIdentity identity;
    private final DataSourceRuntimeManager runtime;

    @PostMapping("/apply")
    @Inner(allowedServices = "cloudflow-auth")
    @RepeatSubmit.Disabled
    @SysLog(value = "按获准版本应用动态数据源", logParams = false)
    public R<DataSourceRuntimeManager.ApplyResult> applyVersion(@RequestBody DataSourceApplyRequest command,
            HttpServletRequest request) {
        signature.verify("/inner/auth/data-source/apply", identity.key(),
                request.getHeader(SecurityConstants.FROM_SERVICE_HEADER), request.getRemoteAddr(),
                request.getHeader(DataSourceControlSignature.TIME_HEADER),
                request.getHeader(DataSourceControlSignature.NONCE_HEADER),
                request.getHeader(DataSourceControlSignature.TARGET_HEADER),
                request.getHeader(DataSourceControlSignature.SIGNATURE_HEADER), command);
        return R.ok(runtime.applyVersion(command));
    }
}
