package com.cloudflow.auth.service.printing;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.printing.PrintData;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

public interface PrintRemoteApi {
    @GetMapping("/{bizType}/{bizId}")
    R<PrintData> data(@PathVariable("bizType") String bizType, @PathVariable("bizId") Long bizId);
}
