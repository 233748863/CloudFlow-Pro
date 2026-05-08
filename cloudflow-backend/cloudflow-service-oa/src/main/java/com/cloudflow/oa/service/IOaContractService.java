package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaTraceEvent;

import java.util.List;

/**
 * OA 合同台账服务。
 */
public interface IOaContractService extends IService<OaContract> {

    PageResult<OaContract> queryPage(OaContract query, PageQuery pageQuery);

    OaContract getContractInfo(Long id);

    Long createContract(OaContract contract);

    boolean updateContract(OaContract contract);

    boolean removeContracts(List<Long> ids);

    boolean submitContract(Long id);

    boolean cancelContract(Long id);

    boolean linkSeal(Long contractId, Long sealApplicationId);

    List<OaTraceEvent> listTimeline(Long contractId);

    List<OaRiskAlert> listRisks(Long contractId);
}
