package com.cloudflow.crm.service.deal;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.domain.dto.CrmDealTeamRequest;
import com.cloudflow.crm.domain.vo.CrmDealTeamView;
import com.cloudflow.crm.exception.CrmBusinessException;
import com.cloudflow.crm.service.remote.CrmContractTeamClient;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CrmContractTeamService {
    private final CrmContractTeamClient contracts;

    public CrmDealTeamView read(Long id, Integer version) {
        R<CrmDealTeamView> response;
        try { response = contracts.read(id, version); }
        catch (RuntimeException unavailable) { throw new CrmBusinessException("合同服务暂不可用，请稍后重新读取", unavailable); }
        return checked(id, response);
    }

    public CrmDealTeamView save(Long id, CrmDealTeamRequest request) {
        R<CrmDealTeamView> response;
        try { response = contracts.update(id, request); }
        catch (RuntimeException unavailable) { throw new CrmBusinessException("合同服务暂不可用，未确认保存成功；请重新读取核对后再试", unavailable); }
        return checked(id, response);
    }

    private CrmDealTeamView checked(Long id, R<CrmDealTeamView> response) {
        if (response == null || !response.isSuccess() || response.getData() == null)
            throw new CrmBusinessException(response == null ? "合同服务暂不可用，未确认保存成功" : response.getMsg());
        if (!"CONTRACT".equals(response.getData().bizType()) || !Objects.equals(id, response.getData().bizId()))
            throw new CrmBusinessException("合同团队响应与请求不一致");
        return response.getData();
    }
}
