package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.EmployeeContract;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

/**
 * 员工合同Mapper接口
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Mapper
public interface EmployeeContractMapper extends BaseMapper<EmployeeContract> {

    /**
     * 查询即将到期的合同
     * 
     * @param days 天数（例如30表示30天内到期）
     * @param currentDate 当前日期
     * @return 即将到期的合同列表
     */
    List<EmployeeContract> selectExpiringContracts(@Param("days") Integer days, 
                                                    @Param("currentDate") LocalDate currentDate);
}
