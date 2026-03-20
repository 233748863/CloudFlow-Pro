package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.HeadcountQueryDTO;
import com.cloudflow.hr.domain.dto.HeadcountSetDTO;
import com.cloudflow.hr.domain.vo.HeadcountStatisticsVO;
import com.cloudflow.hr.domain.vo.HeadcountVO;

import java.util.List;

/**
 * 编制管理服务接口
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
public interface HeadcountService {

    /**
     * 设置编制
     * 
     * @param dto 编制设置DTO
     */
    void setHeadcount(HeadcountSetDTO dto);

    /**
     * 获取编制统计信息
     * 
     * @param targetType 目标类型：DEPT-部门 POST-岗位
     * @param targetId 目标ID
     * @return 编制统计信息
     */
    HeadcountStatisticsVO getHeadcountStatistics(String targetType, Long targetId);

    /**
     * 查询编制列表
     * 
     * @param query 查询条件
     * @return 编制列表
     */
    List<HeadcountVO> listHeadcounts(HeadcountQueryDTO query);

    /**
     * 更新实际在职人数
     * 
     * @param targetType 目标类型
     * @param targetId 目标ID
     * @param actualCount 实际在职人数
     */
    void updateActualCount(String targetType, Long targetId, Integer actualCount);
}
