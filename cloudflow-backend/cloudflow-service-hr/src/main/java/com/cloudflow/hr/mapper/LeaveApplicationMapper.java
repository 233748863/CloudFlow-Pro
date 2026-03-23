package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.hr.domain.dto.LeaveApplicationQueryDTO;
import com.cloudflow.hr.domain.entity.LeaveApplication;
import com.cloudflow.hr.domain.vo.LeaveApplicationVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 请假申请Mapper接口
 */
@Mapper
public interface LeaveApplicationMapper extends BaseMapper<LeaveApplication> {
    
    /**
     * 分页查询请假申请列表（包含员工姓名和假期类型名称）
     *
     * @param page 分页对象
     * @param tenantId 租户ID
     * @param query 查询条件
     * @return 请假申请分页列表
     */
    IPage<LeaveApplicationVO> selectLeaveApplicationPage(Page<LeaveApplicationVO> page,
                                                         @Param("tenantId") Long tenantId,
                                                         @Param("query") LeaveApplicationQueryDTO query);
}
