package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.InsuranceSchemeCreateDTO;
import com.cloudflow.hr.domain.dto.InsuranceSchemeUpdateDTO;
import com.cloudflow.hr.domain.entity.InsuranceScheme;
import com.cloudflow.hr.domain.vo.InsuranceSchemeVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.InsuranceSchemeMapper;
import com.cloudflow.hr.service.InsuranceSchemeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 五险一金方案服务实现类
 * 提供五险一金方案的CRUD操作
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InsuranceSchemeServiceImpl implements InsuranceSchemeService {
    
    private final InsuranceSchemeMapper insuranceSchemeMapper;
    
    /**
     * 创建五险一金方案
     * 
     * @param dto 创建DTO
     * @return 方案ID
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createInsuranceScheme(InsuranceSchemeCreateDTO dto) {
        log.info("创建五险一金方案，方案名称：{}", dto.getSchemeName());
        
        // 验证基数范围
        if (dto.getBaseMax().compareTo(dto.getBaseMin()) < 0) {
            throw new HrBusinessException("缴纳基数上限不能小于下限");
        }
        
        // 创建实体
        InsuranceScheme scheme = new InsuranceScheme();
        BeanUtils.copyProperties(dto, scheme);
        scheme.setTenantId(SecurityUtils.getTenantId());
        scheme.setStatus(1); // 默认启用
        
        // 保存到数据库
        insuranceSchemeMapper.insert(scheme);
        
        log.info("五险一金方案创建成功，方案ID：{}", scheme.getId());
        return scheme.getId();
    }
    
    /**
     * 更新五险一金方案
     * 
     * @param id 方案ID
     * @param dto 更新DTO
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateInsuranceScheme(Long id, InsuranceSchemeUpdateDTO dto) {
        log.info("更新五险一金方案，方案ID：{}", id);
        
        // 查询方案是否存在
        InsuranceScheme scheme = insuranceSchemeMapper.selectById(id);
        if (scheme == null) {
            throw new HrBusinessException("五险一金方案不存在");
        }
        
        // 验证租户权限
        if (!scheme.getTenantId().equals(SecurityUtils.getTenantId())) {
            throw new HrBusinessException("无权限操作该方案");
        }
        
        // 验证基数范围
        if (dto.getBaseMax() != null && dto.getBaseMin() != null) {
            if (dto.getBaseMax().compareTo(dto.getBaseMin()) < 0) {
                throw new HrBusinessException("缴纳基数上限不能小于下限");
            }
        }
        
        // 更新实体
        BeanUtils.copyProperties(dto, scheme, "id", "tenantId", "createTime", "createBy");
        insuranceSchemeMapper.updateById(scheme);
        
        log.info("五险一金方案更新成功，方案ID：{}", id);
    }
    
    /**
     * 获取五险一金方案详情
     * 
     * @param id 方案ID
     * @return 方案VO
     */
    @Override
    public InsuranceSchemeVO getInsuranceScheme(Long id) {
        log.info("查询五险一金方案详情，方案ID：{}", id);
        
        // 查询方案
        InsuranceScheme scheme = insuranceSchemeMapper.selectById(id);
        if (scheme == null) {
            throw new HrBusinessException("五险一金方案不存在");
        }
        
        // 验证租户权限
        if (!scheme.getTenantId().equals(SecurityUtils.getTenantId())) {
            throw new HrBusinessException("无权限查看该方案");
        }
        
        // 转换为VO
        InsuranceSchemeVO vo = new InsuranceSchemeVO();
        BeanUtils.copyProperties(scheme, vo);
        
        return vo;
    }
    
    /**
     * 获取五险一金方案列表
     * 
     * @return 方案列表
     */
    @Override
    public List<InsuranceSchemeVO> listInsuranceSchemes() {
        log.info("查询五险一金方案列表");
        
        // 构建查询条件
        LambdaQueryWrapper<InsuranceScheme> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(InsuranceScheme::getTenantId, SecurityUtils.getTenantId())
                   .eq(InsuranceScheme::getStatus, 1) // 只查询启用的方案
                   .orderByDesc(InsuranceScheme::getEffectiveDate);
        
        // 查询列表
        List<InsuranceScheme> schemes = insuranceSchemeMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return schemes.stream()
                     .map(scheme -> {
                         InsuranceSchemeVO vo = new InsuranceSchemeVO();
                         BeanUtils.copyProperties(scheme, vo);
                         return vo;
                     })
                     .collect(Collectors.toList());
    }
    
    /**
     * 根据城市获取五险一金方案列表
     * 
     * @param city 城市
     * @return 方案列表
     */
    @Override
    public List<InsuranceSchemeVO> listInsuranceSchemesByCity(String city) {
        log.info("查询城市五险一金方案列表，城市：{}", city);
        
        // 构建查询条件
        LambdaQueryWrapper<InsuranceScheme> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(InsuranceScheme::getTenantId, SecurityUtils.getTenantId())
                   .eq(InsuranceScheme::getCity, city)
                   .eq(InsuranceScheme::getStatus, 1) // 只查询启用的方案
                   .orderByDesc(InsuranceScheme::getEffectiveDate);
        
        // 查询列表
        List<InsuranceScheme> schemes = insuranceSchemeMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return schemes.stream()
                     .map(scheme -> {
                         InsuranceSchemeVO vo = new InsuranceSchemeVO();
                         BeanUtils.copyProperties(scheme, vo);
                         return vo;
                     })
                     .collect(Collectors.toList());
    }
}
