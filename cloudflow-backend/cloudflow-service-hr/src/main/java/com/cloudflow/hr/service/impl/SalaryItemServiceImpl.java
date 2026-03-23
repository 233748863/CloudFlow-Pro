package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.SalaryItemCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryItemUpdateDTO;
import com.cloudflow.hr.domain.entity.SalaryItem;
import com.cloudflow.hr.domain.entity.SalaryStructureItem;
import com.cloudflow.hr.domain.vo.SalaryItemVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.SalaryItemMapper;
import com.cloudflow.hr.mapper.SalaryStructureItemMapper;
import com.cloudflow.hr.service.SalaryItemService;
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
 * 薪资项目服务实现类
 * 提供薪资项目的CRUD操作
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SalaryItemServiceImpl implements SalaryItemService {
    
    private final SalaryItemMapper salaryItemMapper;
    private final SalaryStructureItemMapper salaryStructureItemMapper;
    
    // 项目类型映射
    private static final Map<String, String> ITEM_TYPE_MAP = new HashMap<>();
    static {
        ITEM_TYPE_MAP.put("FIXED", "固定项");
        ITEM_TYPE_MAP.put("VARIABLE", "浮动项");
    }
    
    // 分类映射
    private static final Map<String, String> CATEGORY_MAP = new HashMap<>();
    static {
        CATEGORY_MAP.put("BASIC", "基本工资");
        CATEGORY_MAP.put("ALLOWANCE", "津贴");
        CATEGORY_MAP.put("BONUS", "奖金");
        CATEGORY_MAP.put("DEDUCTION", "扣款");
        CATEGORY_MAP.put("INSURANCE", "社保");
        CATEGORY_MAP.put("TAX", "个税");
    }
    
    /**
     * 创建薪资项目
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSalaryItem(SalaryItemCreateDTO dto) {
        log.info("创建薪资项目，itemCode: {}, itemName: {}", dto.getItemCode(), dto.getItemName());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查项目编码是否已存在
        LambdaQueryWrapper<SalaryItem> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryItem::getTenantId, tenantId)
                    .eq(SalaryItem::getItemCode, dto.getItemCode());
        
        if (salaryItemMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("薪资项目编码已存在：" + dto.getItemCode());
        }
        
        // 创建薪资项目实体
        SalaryItem salaryItem = new SalaryItem();
        BeanUtils.copyProperties(dto, salaryItem);
        salaryItem.setTenantId(tenantId);
        
        // 设置默认值
        if (salaryItem.getSortOrder() == null) {
            salaryItem.setSortOrder(0);
        }
        salaryItem.setStatus(1); // 默认启用
        
        // 保存到数据库
        salaryItemMapper.insert(salaryItem);
        
        log.info("薪资项目创建成功，ID: {}", salaryItem.getId());
        return salaryItem.getId();
    }
    
    /**
     * 更新薪资项目
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateSalaryItem(Long id, SalaryItemUpdateDTO dto) {
        log.info("更新薪资项目，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资项目
        SalaryItem salaryItem = salaryItemMapper.selectById(id);
        if (salaryItem == null || !salaryItem.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("薪资项目不存在");
        }
        
        // 更新薪资项目信息
        BeanUtils.copyProperties(dto, salaryItem);
        salaryItemMapper.updateById(salaryItem);
        
        log.info("薪资项目更新成功，ID: {}", id);
    }
    
    /**
     * 获取薪资项目详情
     */
    @Override
    public SalaryItemVO getSalaryItem(Long id) {
        log.info("获取薪资项目详情，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资项目
        SalaryItem salaryItem = salaryItemMapper.selectById(id);
        if (salaryItem == null || !salaryItem.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("薪资项目不存在");
        }
        
        // 转换为VO
        return convertToVO(salaryItem);
    }
    
    /**
     * 查询所有薪资项目列表
     */
    @Override
    public List<SalaryItemVO> listSalaryItems() {
        log.info("查询薪资项目列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资项目列表
        LambdaQueryWrapper<SalaryItem> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryItem::getTenantId, tenantId)
                    .orderByAsc(SalaryItem::getSortOrder)
                    .orderByDesc(SalaryItem::getCreateTime);
        
        List<SalaryItem> salaryItems = salaryItemMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return salaryItems.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 删除薪资项目
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteSalaryItem(Long id) {
        log.info("删除薪资项目，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资项目
        SalaryItem salaryItem = salaryItemMapper.selectById(id);
        if (salaryItem == null || !salaryItem.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("薪资项目不存在");
        }
        
        LambdaQueryWrapper<SalaryStructureItem> relationWrapper = new LambdaQueryWrapper<>();
        relationWrapper.eq(SalaryStructureItem::getTenantId, tenantId)
                .eq(SalaryStructureItem::getItemId, id);
        if (salaryStructureItemMapper.selectCount(relationWrapper) > 0) {
            throw new HrBusinessException("SALARY_ITEM_IN_USE", "该薪资项目已被薪资结构引用，无法删除");
        }
        
        // 删除薪资项目（软删除）
        salaryItemMapper.deleteById(id);
        
        log.info("薪资项目删除成功，ID: {}", id);
    }
    
    /**
     * 转换为VO对象
     */
    private SalaryItemVO convertToVO(SalaryItem salaryItem) {
        SalaryItemVO vo = new SalaryItemVO();
        BeanUtils.copyProperties(salaryItem, vo);
        
        // 设置描述字段
        vo.setItemTypeDesc(ITEM_TYPE_MAP.getOrDefault(salaryItem.getItemType(), salaryItem.getItemType()));
        vo.setCategoryDesc(CATEGORY_MAP.getOrDefault(salaryItem.getCategory(), salaryItem.getCategory()));
        vo.setStatusDesc(salaryItem.getStatus() == 1 ? "启用" : "禁用");
        
        return vo;
    }
}
