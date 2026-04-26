package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmployeeContract;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 员工合同 Mapper
 */
@Mapper
public interface EmployeeContractMapper extends BaseMapper<EmployeeContract> {

    /**
     * 按员工查询合同列表，显式列选择，避免主表误选附件字段。
     */
    List<EmployeeContract> selectContractsByEmployeeId(@Param("tenantId") Long tenantId,
                                                       @Param("employeeId") Long employeeId);

    /**
     * 按主键查询合同详情，显式列选择。
     */
    EmployeeContract selectContractById(@Param("tenantId") Long tenantId,
                                        @Param("id") Long id);

    /**
     * 查询即将到期的合同。
     */
    List<EmployeeContract> selectExpiringContracts(@Param("days") Integer days,
                                                   @Param("currentDate") LocalDate currentDate);
}
