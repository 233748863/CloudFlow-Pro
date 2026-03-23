package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.LeaveQuota;
import com.cloudflow.hr.domain.vo.LeaveQuotaVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 假期额度Mapper接口
 */
@Mapper
public interface LeaveQuotaMapper extends BaseMapper<LeaveQuota> {
    
    /**
     * 查询员工假期额度列表（包含假期类型名称）
     *
     * @param tenantId 租户ID
     * @param employeeId 员工ID
     * @param year 年度
     * @return 假期额度列表
     */
    List<LeaveQuotaVO> selectLeaveQuotaList(@Param("tenantId") Long tenantId,
                                            @Param("employeeId") Long employeeId,
                                            @Param("year") Integer year);
}
