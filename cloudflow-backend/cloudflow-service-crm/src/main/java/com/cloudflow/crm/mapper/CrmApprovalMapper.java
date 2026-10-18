package com.cloudflow.crm.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.crm.domain.CrmApproval;

public interface CrmApprovalMapper extends BaseMapper<CrmApproval> {
    CrmApproval lockById(@org.apache.ibatis.annotations.Param("id") Long id);
}
