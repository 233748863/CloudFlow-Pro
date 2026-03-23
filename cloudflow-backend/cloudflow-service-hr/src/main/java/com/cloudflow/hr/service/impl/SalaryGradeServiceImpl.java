package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.SalaryGradeSetDTO;
import com.cloudflow.hr.domain.entity.JobLevel;
import com.cloudflow.hr.domain.entity.SalaryGrade;
import com.cloudflow.hr.domain.vo.SalaryGradeVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.JobLevelMapper;
import com.cloudflow.hr.mapper.SalaryGradeMapper;
import com.cloudflow.hr.service.SalaryGradeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 薪资等级服务实现类
 * 提供薪资等级的设置和查询功能
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SalaryGradeServiceImpl implements SalaryGradeService {
    
    private final SalaryGradeMapper salaryGradeMapper;
    private final JobLevelMapper jobLevelMapper;
    
    // 币种映射
    private static final Map<String, String> CURRENCY_MAP = new HashMap<>();
    static {
        CURRENCY_MAP.put("CNY", "人民币");
        CURRENCY_MAP.put("USD", "美元");
    }
    
    /**
     * 设置薪资等级
     * 如果职级已有薪资等级，则更新；否则创建新记录
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void setSalaryGrade(SalaryGradeSetDTO dto) {
        log.info("设置薪资等级，levelId: {}", dto.getLevelId());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 验证职级是否存在
        JobLevel jobLevel = jobLevelMapper.selectById(dto.getLevelId());
        if (jobLevel == null || !jobLevel.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("职级不存在");
        }
        
        // 验证薪资范围的合理性
        if (dto.getMinSalary().compareTo(dto.getMaxSalary()) > 0) {
            throw new HrBusinessException("最低薪资不能大于最高薪资");
        }
        if (dto.getMidSalary().compareTo(dto.getMinSalary()) < 0 || 
            dto.getMidSalary().compareTo(dto.getMaxSalary()) > 0) {
            throw new HrBusinessException("中位薪资必须在最低薪资和最高薪资之间");
        }
        
        // 查询是否已存在薪资等级
        LambdaQueryWrapper<SalaryGrade> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryGrade::getTenantId, tenantId)
                    .eq(SalaryGrade::getLevelId, dto.getLevelId());
        
        SalaryGrade salaryGrade = salaryGradeMapper.selectOne(queryWrapper);
        
        if (salaryGrade != null) {
            // 更新现有记录
            BeanUtils.copyProperties(dto, salaryGrade);
            if (dto.getCurrency() != null) {
                salaryGrade.setCurrency(dto.getCurrency());
            }
            salaryGradeMapper.updateById(salaryGrade);
            log.info("薪资等级更新成功，levelId: {}", dto.getLevelId());
        } else {
            // 创建新记录
            salaryGrade = new SalaryGrade();
            BeanUtils.copyProperties(dto, salaryGrade);
            salaryGrade.setTenantId(tenantId);
            if (salaryGrade.getCurrency() == null) {
                salaryGrade.setCurrency("CNY"); // 默认人民币
            }
            salaryGradeMapper.insert(salaryGrade);
            log.info("薪资等级创建成功，levelId: {}", dto.getLevelId());
        }
    }
    
    /**
     * 获取指定职级的薪资等级
     */
    @Override
    public SalaryGradeVO getSalaryGrade(Long levelId) {
        log.info("获取薪资等级，levelId: {}", levelId);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资等级
        LambdaQueryWrapper<SalaryGrade> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryGrade::getTenantId, tenantId)
                    .eq(SalaryGrade::getLevelId, levelId);
        
        SalaryGrade salaryGrade = salaryGradeMapper.selectOne(queryWrapper);
        if (salaryGrade == null) {
            throw new HrBusinessException("薪资等级不存在");
        }
        
        // 转换为VO
        return convertToVO(salaryGrade);
    }
    
    /**
     * 查询所有薪资等级列表
     */
    @Override
    public List<SalaryGradeVO> listSalaryGrades() {
        log.info("查询薪资等级列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资等级列表
        LambdaQueryWrapper<SalaryGrade> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryGrade::getTenantId, tenantId)
                    .orderByDesc(SalaryGrade::getCreateTime);
        
        List<SalaryGrade> salaryGrades = salaryGradeMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return salaryGrades.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 删除薪资等级
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteSalaryGrade(Long levelId) {
        log.info("删除薪资等级，levelId: {}", levelId);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资等级
        LambdaQueryWrapper<SalaryGrade> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryGrade::getTenantId, tenantId)
                    .eq(SalaryGrade::getLevelId, levelId);
        
        SalaryGrade salaryGrade = salaryGradeMapper.selectOne(queryWrapper);
        if (salaryGrade == null) {
            throw new HrBusinessException("薪资等级不存在");
        }
        
        // 删除薪资等级（软删除）
        salaryGradeMapper.deleteById(salaryGrade.getId());
        
        log.info("薪资等级删除成功，levelId: {}", levelId);
    }
    
    /**
     * 转换为VO对象
     */
    private SalaryGradeVO convertToVO(SalaryGrade salaryGrade) {
        SalaryGradeVO vo = new SalaryGradeVO();
        BeanUtils.copyProperties(salaryGrade, vo);
        
        // 查询职级信息
        JobLevel jobLevel = jobLevelMapper.selectById(salaryGrade.getLevelId());
        if (jobLevel != null) {
            vo.setLevelCode(jobLevel.getLevelCode());
            vo.setLevelName(jobLevel.getLevelName());
        }
        
        // 设置币种描述
        vo.setCurrencyDesc(CURRENCY_MAP.getOrDefault(salaryGrade.getCurrency(), salaryGrade.getCurrency()));
        
        return vo;
    }
}
