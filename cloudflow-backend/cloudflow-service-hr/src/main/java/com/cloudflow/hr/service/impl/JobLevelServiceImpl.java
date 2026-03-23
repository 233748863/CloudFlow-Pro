package com.cloudflow.hr.service.impl;
import com.cloudflow.common.core.utils.SecurityUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.dto.JobLevelCreateDTO;
import com.cloudflow.hr.domain.dto.JobLevelUpdateDTO;
import com.cloudflow.hr.domain.entity.JobLevel;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.vo.JobLevelVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.JobLevelMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.service.JobLevelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 职级服务实现类
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class JobLevelServiceImpl implements JobLevelService {
    
    private final JobLevelMapper jobLevelMapper;
    private final PositionMapper positionMapper;
    
    /**
     * 创建职级
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createJobLevel(JobLevelCreateDTO dto) {
        log.info("创建职级，levelCode: {}, levelName: {}", dto.getLevelCode(), dto.getLevelName());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查职级编码是否已存在
        LambdaQueryWrapper<JobLevel> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(JobLevel::getTenantId, tenantId)
                    .eq(JobLevel::getLevelCode, dto.getLevelCode());
        
        if (jobLevelMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("职级编码已存在：" + dto.getLevelCode());
        }
        
        // 创建职级实体
        JobLevel jobLevel = new JobLevel();
        BeanUtils.copyProperties(dto, jobLevel);
        jobLevel.setTenantId(tenantId);
        
        // 保存到数据库
        jobLevelMapper.insert(jobLevel);
        
        log.info("职级创建成功，ID: {}", jobLevel.getId());
        return jobLevel.getId();
    }
    
    /**
     * 更新职级
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateJobLevel(Long id, JobLevelUpdateDTO dto) {
        log.info("更新职级，ID: {}, levelCode: {}", id, dto.getLevelCode());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查职级是否存在
        JobLevel existingLevel = jobLevelMapper.selectById(id);
        if (existingLevel == null || !existingLevel.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("职级不存在或无权限访问");
        }
        
        // 检查职级编码是否与其他记录冲突
        LambdaQueryWrapper<JobLevel> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(JobLevel::getTenantId, tenantId)
                    .eq(JobLevel::getLevelCode, dto.getLevelCode())
                    .ne(JobLevel::getId, id);
        
        if (jobLevelMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("职级编码已被其他记录使用：" + dto.getLevelCode());
        }
        
        // 更新职级信息
        JobLevel jobLevel = new JobLevel();
        BeanUtils.copyProperties(dto, jobLevel);
        jobLevel.setId(id);
        jobLevel.setTenantId(tenantId);
        
        jobLevelMapper.updateById(jobLevel);
        
        log.info("职级更新成功，ID: {}", id);
    }
    
    /**
     * 获取职级详情
     */
    @Override
    public JobLevelVO getJobLevel(Long id) {
        log.info("获取职级详情，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询职级
        JobLevel jobLevel = jobLevelMapper.selectById(id);
        if (jobLevel == null || !jobLevel.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("职级不存在或无权限访问");
        }
        
        // 转换为VO
        JobLevelVO vo = new JobLevelVO();
        BeanUtils.copyProperties(jobLevel, vo);
        
        return vo;
    }
    
    /**
     * 获取职级列表（可按序列筛选）
     */
    @Override
    public List<JobLevelVO> listJobLevels(String levelSeries) {
        log.info("获取职级列表，levelSeries: {}", levelSeries);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 构建查询条件
        LambdaQueryWrapper<JobLevel> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(JobLevel::getTenantId, tenantId);
        
        // 如果指定了职级序列，添加筛选条件
        if (StringUtils.hasText(levelSeries)) {
            queryWrapper.eq(JobLevel::getLevelSeries, levelSeries);
        }
        
        // 按职级等级升序排序
        queryWrapper.orderByAsc(JobLevel::getLevelRank);
        
        List<JobLevel> levels = jobLevelMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return levels.stream()
                .map(level -> {
                    JobLevelVO vo = new JobLevelVO();
                    BeanUtils.copyProperties(level, vo);
                    return vo;
                })
                .collect(Collectors.toList());
    }
    
    /**
     * 删除职级
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteJobLevel(Long id) {
        log.info("删除职级，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查职级是否存在
        JobLevel existingLevel = jobLevelMapper.selectById(id);
        if (existingLevel == null || !existingLevel.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("职级不存在或无权限访问");
        }
        
        LambdaQueryWrapper<Position> positionWrapper = new LambdaQueryWrapper<>();
        positionWrapper.eq(Position::getTenantId, tenantId)
                .eq(Position::getLevelId, id);
        if (positionMapper.selectCount(positionWrapper) > 0) {
            throw new HrBusinessException("JOB_LEVEL_IN_USE", "该职级已被职位引用，无法删除");
        }
        
        // 删除职级
        jobLevelMapper.deleteById(id);
        
        log.info("职级删除成功，ID: {}", id);
    }
}
