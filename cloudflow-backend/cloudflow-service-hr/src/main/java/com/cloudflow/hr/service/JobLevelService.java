package com.cloudflow.hr.service;

import com.cloudflow.hr.domain.dto.JobLevelCreateDTO;
import com.cloudflow.hr.domain.dto.JobLevelUpdateDTO;
import com.cloudflow.hr.domain.vo.JobLevelVO;

import java.util.List;

/**
 * 职级服务接口
 * 
 * @author CloudFlow
 */
public interface JobLevelService {
    
    /**
     * 创建职级
     * 
     * @param dto 职级创建DTO
     * @return 职级ID
     */
    Long createJobLevel(JobLevelCreateDTO dto);
    
    /**
     * 更新职级
     * 
     * @param id 职级ID
     * @param dto 职级更新DTO
     */
    void updateJobLevel(Long id, JobLevelUpdateDTO dto);
    
    /**
     * 获取职级详情
     * 
     * @param id 职级ID
     * @return 职级VO
     */
    JobLevelVO getJobLevel(Long id);
    
    /**
     * 获取职级列表（可按序列筛选）
     * 
     * @param levelSeries 职级序列（可选，P-专业序列、M-管理序列）
     * @return 职级列表
     */
    List<JobLevelVO> listJobLevels(String levelSeries);
    
    /**
     * 删除职级
     * 
     * @param id 职级ID
     */
    void deleteJobLevel(Long id);
}
