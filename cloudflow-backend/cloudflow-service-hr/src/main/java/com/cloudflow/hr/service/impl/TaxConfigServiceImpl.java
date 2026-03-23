package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.dto.TaxConfigCreateDTO;
import com.cloudflow.hr.domain.dto.TaxConfigUpdateDTO;
import com.cloudflow.hr.domain.entity.TaxConfig;
import com.cloudflow.hr.domain.vo.TaxConfigVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.TaxConfigMapper;
import com.cloudflow.hr.service.TaxConfigService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * 个税配置服务实现类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TaxConfigServiceImpl implements TaxConfigService {
    
    private final TaxConfigMapper taxConfigMapper;
    
    /**
     * 创建个税配置
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createTaxConfig(TaxConfigCreateDTO dto) {
        log.info("创建个税配置，起征点：{}", dto.getThreshold());
        
        // 创建个税配置实体
        TaxConfig taxConfig = new TaxConfig();
        BeanUtils.copyProperties(dto, taxConfig);
        taxConfig.setStatus(1); // 默认启用
        
        // 保存到数据库
        taxConfigMapper.insert(taxConfig);
        
        log.info("个税配置创建成功，ID：{}", taxConfig.getId());
        return taxConfig.getId();
    }
    
    /**
     * 更新个税配置
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateTaxConfig(Long id, TaxConfigUpdateDTO dto) {
        log.info("更新个税配置，ID：{}", id);
        
        // 查询配置是否存在
        TaxConfig taxConfig = taxConfigMapper.selectById(id);
        if (taxConfig == null) {
            throw new HrBusinessException("个税配置不存在");
        }
        
        // 更新配置信息
        if (dto.getThreshold() != null) {
            taxConfig.setThreshold(dto.getThreshold());
        }
        if (dto.getTaxBrackets() != null) {
            taxConfig.setTaxBrackets(dto.getTaxBrackets());
        }
        if (dto.getDeductionItems() != null) {
            taxConfig.setDeductionItems(dto.getDeductionItems());
        }
        if (dto.getEffectiveDate() != null) {
            taxConfig.setEffectiveDate(dto.getEffectiveDate());
        }
        if (dto.getStatus() != null) {
            taxConfig.setStatus(dto.getStatus());
        }
        
        // 保存到数据库
        taxConfigMapper.updateById(taxConfig);
        
        log.info("个税配置更新成功");
    }
    
    /**
     * 获取当前生效的个税配置
     */
    @Override
    public TaxConfigVO getCurrentTaxConfig() {
        log.info("获取当前生效的个税配置");
        
        // 查询当前日期之前生效且状态为启用的配置，按生效日期倒序取第一条
        LambdaQueryWrapper<TaxConfig> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(TaxConfig::getStatus, 1)
                .le(TaxConfig::getEffectiveDate, LocalDate.now())
                .orderByDesc(TaxConfig::getEffectiveDate)
                .last("LIMIT 1");
        
        TaxConfig taxConfig = taxConfigMapper.selectOne(queryWrapper);
        if (taxConfig == null) {
            throw new HrBusinessException("未找到生效的个税配置");
        }
        
        // 转换为VO
        TaxConfigVO vo = new TaxConfigVO();
        BeanUtils.copyProperties(taxConfig, vo);
        
        return vo;
    }
    
    /**
     * 根据ID获取个税配置
     */
    @Override
    public TaxConfigVO getTaxConfig(Long id) {
        log.info("获取个税配置，ID：{}", id);
        
        TaxConfig taxConfig = taxConfigMapper.selectById(id);
        if (taxConfig == null) {
            throw new HrBusinessException("个税配置不存在");
        }
        
        // 转换为VO
        TaxConfigVO vo = new TaxConfigVO();
        BeanUtils.copyProperties(taxConfig, vo);
        
        return vo;
    }
}
