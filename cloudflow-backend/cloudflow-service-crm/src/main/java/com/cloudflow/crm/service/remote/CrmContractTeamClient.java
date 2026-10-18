package com.cloudflow.crm.service.remote;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "cloudflow-service-oa", contextId = "crmContractTeamClient", path = "/inner/oa/contract-teams")
public interface CrmContractTeamClient {
    @GetMapping("/{id}")
    R<CrmDealTeamView> read(@PathVariable("id") Long id, @RequestParam(value = "teamVersion", required = false) Integer teamVersion);

    @PutMapping("/{id}")
    R<CrmDealTeamView> update(@PathVariable("id") Long id, @RequestBody CrmDealTeamRequest request);
}
