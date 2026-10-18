package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.datascope.DataScope;
import com.cloudflow.crm.domain.CrmQuote;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CrmQuoteMapper extends BaseMapper<CrmQuote> {
    record ContractLink(Long contractId, Long customerId, String contractNo, String currency) { }

    ContractLink lockCreatedContract(@Param("id") Long id, @Param("contractId") Long contractId, @Param("tenantId") Long tenantId);
    List<Long> lockConvertedContracts(@Param("id") Long id, @Param("tenantId") Long tenantId);
    int writeContractLink(@Param("record") CrmQuote record, @Param("expectedVersion") Integer expectedVersion);
    int acceptLinkedContract(@Param("record") CrmQuote record, @Param("expectedVersion") Integer expectedVersion);

    CrmQuote lockById(@Param("id") Long id);
    CrmQuote lockAccessible(@Param("id") Long id, @Param("tenantId") Long tenantId, @Param("dataScope") DataScope dataScope);
    int writeOwner(@Param("record") CrmQuote record, @Param("expectedVersion") Integer expectedVersion);

    Page<CrmQuote> selectPageByDataScope(Page<CrmQuote> page,
                                         @Param("query") CrmQuote query,
                                         @Param("dataScope") DataScope dataScope);

    CrmQuote selectByIdWithDataScope(@Param("quoteId") Long quoteId,
                                     @Param("dataScope") DataScope dataScope);
}
