package com.cloudflow.hr.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.utils.SecurityUtils;
import com.cloudflow.hr.domain.dto.SalaryStructureCreateDTO;
import com.cloudflow.hr.domain.dto.SalaryStructureUpdateDTO;
import com.cloudflow.hr.domain.entity.EmployeeSalary;
import com.cloudflow.hr.domain.entity.SalaryItem;
import com.cloudflow.hr.domain.entity.SalaryStructure;
import com.cloudflow.hr.domain.entity.SalaryStructureItem;
import com.cloudflow.hr.domain.vo.SalaryItemVO;
import com.cloudflow.hr.domain.vo.SalaryStructureDetailVO;
import com.cloudflow.hr.domain.vo.SalaryStructureVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.EmployeeSalaryMapper;
import com.cloudflow.hr.mapper.SalaryItemMapper;
import com.cloudflow.hr.mapper.SalaryStructureItemMapper;
import com.cloudflow.hr.mapper.SalaryStructureMapper;
import com.cloudflow.hr.service.SalaryStructureService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 薪资结构服务实现类
 * 提供薪资结构的CRUD操作和薪资项目关联管理
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SalaryStructureServiceImpl implements SalaryStructureService {
    
    private final SalaryStructureMapper salaryStructureMapper;
    private final SalaryStructureItemMapper salaryStructureItemMapper;
    private final SalaryItemMapper salaryItemMapper;
    private final EmployeeSalaryMapper employeeSalaryMapper;
    
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
     * 创建薪资结构
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createSalaryStructure(SalaryStructureCreateDTO dto) {
        log.info("创建薪资结构，structureCode: {}, structureName: {}", dto.getStructureCode(), dto.getStructureName());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查结构编码是否已存在
        LambdaQueryWrapper<SalaryStructure> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryStructure::getTenantId, tenantId)
                    .eq(SalaryStructure::getStructureCode, dto.getStructureCode());
        
        if (salaryStructureMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("薪资结构编码已存在：" + dto.getStructureCode());
        }
        
        // 创建薪资结构实体
        SalaryStructure salaryStructure = new SalaryStructure();
        BeanUtils.copyProperties(dto, salaryStructure);
        salaryStructure.setTenantId(tenantId);
        if (salaryStructure.getStatus() == null) {
            salaryStructure.setStatus(1);
        }
        
        // 保存到数据库
        salaryStructureMapper.insert(salaryStructure);
        
        // 关联薪资项目
        if (dto.getItemIds() != null && !dto.getItemIds().isEmpty()) {
            associateItems(tenantId, salaryStructure.getId(), dto.getItemIds());
        }
        
        log.info("薪资结构创建成功，ID: {}", salaryStructure.getId());
        return salaryStructure.getId();
    }
    
    /**
     * 更新薪资结构
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateSalaryStructure(Long id, SalaryStructureUpdateDTO dto) {
        log.info("更新薪资结构，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资结构
        SalaryStructure salaryStructure = salaryStructureMapper.selectById(id);
        if (salaryStructure == null || !salaryStructure.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("薪资结构不存在");
        }
        
        // 更新薪资结构信息
        if (dto.getStructureName() != null) {
            salaryStructure.setStructureName(dto.getStructureName());
        }
        if (dto.getDescription() != null) {
            salaryStructure.setDescription(dto.getDescription());
        }
        if (dto.getStatus() != null) {
            salaryStructure.setStatus(dto.getStatus());
        }
        
        salaryStructureMapper.updateById(salaryStructure);
        
        // 如果提供了薪资项目列表，则更新关联关系
        if (dto.getItemIds() != null) {
            // 删除旧的关联关系
            LambdaQueryWrapper<SalaryStructureItem> deleteWrapper = new LambdaQueryWrapper<>();
            deleteWrapper.eq(SalaryStructureItem::getTenantId, tenantId)
                    .eq(SalaryStructureItem::getStructureId, id);
            salaryStructureItemMapper.delete(deleteWrapper);
            
            // 创建新的关联关系
            if (!dto.getItemIds().isEmpty()) {
                associateItems(tenantId, id, dto.getItemIds());
            }
        }
        
        log.info("薪资结构更新成功，ID: {}", id);
    }
    
    /**
     * 获取薪资结构详情（包含关联的薪资项目）
     */
    @Override
    public SalaryStructureDetailVO getSalaryStructure(Long id) {
        log.info("获取薪资结构详情，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资结构
        SalaryStructure salaryStructure = salaryStructureMapper.selectById(id);
        if (salaryStructure == null || !salaryStructure.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("薪资结构不存在");
        }
        
        // 转换为VO
        SalaryStructureDetailVO vo = new SalaryStructureDetailVO();
        BeanUtils.copyProperties(salaryStructure, vo);
        vo.setStatusDesc(salaryStructure.getStatus() == 1 ? "启用" : "禁用");
        
        // 查询关联的薪资项目
        List<SalaryItemVO> items = getAssociatedItems(id, tenantId);
        vo.setItems(items);
        
        return vo;
    }
    
    /**
     * 查询所有薪资结构列表
     */
    @Override
    public List<SalaryStructureVO> listSalaryStructures() {
        log.info("查询薪资结构列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资结构列表
        LambdaQueryWrapper<SalaryStructure> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryStructure::getTenantId, tenantId)
                    .orderByDesc(SalaryStructure::getCreateTime);
        
        List<SalaryStructure> salaryStructures = salaryStructureMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return salaryStructures.stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 删除薪资结构
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteSalaryStructure(Long id) {
        log.info("删除薪资结构，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询薪资结构
        SalaryStructure salaryStructure = salaryStructureMapper.selectById(id);
        if (salaryStructure == null || !salaryStructure.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("薪资结构不存在");
        }
        
        LambdaQueryWrapper<EmployeeSalary> employeeSalaryWrapper = new LambdaQueryWrapper<>();
        employeeSalaryWrapper.eq(EmployeeSalary::getTenantId, tenantId)
                .eq(EmployeeSalary::getStructureId, id);
        if (employeeSalaryMapper.selectCount(employeeSalaryWrapper) > 0) {
            throw new HrBusinessException("SALARY_STRUCTURE_IN_USE", "该薪资结构已被员工薪资引用，无法删除");
        }
        
        // 删除关联的薪资项目
        LambdaQueryWrapper<SalaryStructureItem> deleteWrapper = new LambdaQueryWrapper<>();
        deleteWrapper.eq(SalaryStructureItem::getTenantId, tenantId)
                .eq(SalaryStructureItem::getStructureId, id);
        salaryStructureItemMapper.delete(deleteWrapper);
        
        // 删除薪资结构（软删除）
        salaryStructureMapper.deleteById(id);
        
        log.info("薪资结构删除成功，ID: {}", id);
    }
    
    /**
     * 关联薪资项目
     */
    private void associateItems(Long tenantId, Long structureId, List<Long> itemIds) {
        Map<Long, SalaryItem> salaryItemMap = salaryItemMapper.selectBatchIds(itemIds).stream()
                .collect(Collectors.toMap(SalaryItem::getId, item -> item, (left, right) -> left));

        int sortOrder = 1;
        for (Long itemId : itemIds) {
            SalaryItem salaryItem = salaryItemMap.get(itemId);
            if (salaryItem == null || !tenantId.equals(salaryItem.getTenantId())) {
                throw new HrBusinessException("薪资项目不存在");
            }
            // 禁用项目不再允许被新结构继续引用，避免下游继续使用失效配置。
            if (!Integer.valueOf(1).equals(salaryItem.getStatus())) {
                throw new HrBusinessException("薪资项目已禁用，不能继续关联");
            }

            SalaryStructureItem structureItem = new SalaryStructureItem();
            structureItem.setTenantId(tenantId);
            structureItem.setStructureId(structureId);
            structureItem.setItemId(itemId);
            structureItem.setSortOrder(sortOrder++);
            salaryStructureItemMapper.insert(structureItem);
        }
    }
    
    /**
     * 获取关联的薪资项目列表
     */
    private List<SalaryItemVO> getAssociatedItems(Long structureId, Long tenantId) {
        // 查询关联关系
        LambdaQueryWrapper<SalaryStructureItem> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(SalaryStructureItem::getTenantId, tenantId)
                .eq(SalaryStructureItem::getStructureId, structureId)
                .orderByAsc(SalaryStructureItem::getSortOrder);
        
        List<SalaryStructureItem> structureItems = salaryStructureItemMapper.selectList(queryWrapper);
        
        if (structureItems.isEmpty()) {
            return new ArrayList<>();
        }
        
        // 查询薪资项目详情
        List<Long> itemIds = structureItems.stream()
                .map(SalaryStructureItem::getItemId)
                .collect(Collectors.toList());
        
        List<SalaryItem> salaryItems = salaryItemMapper.selectBatchIds(itemIds);
        Map<Long, SalaryItem> salaryItemMap = salaryItems.stream()
                .collect(Collectors.toMap(SalaryItem::getId, item -> item));
        
        // 按关联表顺序返回，避免批量查询打乱薪资项目展示顺序
        return structureItems.stream()
                .map(SalaryStructureItem::getItemId)
                .map(salaryItemMap::get)
                .filter(item -> item != null)
                .map(this::convertItemToVO)
                .collect(Collectors.toList());
    }
    
    /**
     * 转换为VO对象
     */
    private SalaryStructureVO convertToVO(SalaryStructure salaryStructure) {
        SalaryStructureVO vo = new SalaryStructureVO();
        BeanUtils.copyProperties(salaryStructure, vo);
        vo.setStatusDesc(salaryStructure.getStatus() == 1 ? "启用" : "禁用");
        return vo;
    }
    
    /**
     * 转换薪资项目为VO对象
     */
    private SalaryItemVO convertItemToVO(SalaryItem salaryItem) {
        SalaryItemVO vo = new SalaryItemVO();
        BeanUtils.copyProperties(salaryItem, vo);
        vo.setItemTypeDesc(ITEM_TYPE_MAP.getOrDefault(salaryItem.getItemType(), salaryItem.getItemType()));
        vo.setCategoryDesc(CATEGORY_MAP.getOrDefault(salaryItem.getCategory(), salaryItem.getCategory()));
        vo.setStatusDesc(salaryItem.getStatus() == 1 ? "启用" : "禁用");
        return vo;
    }
}
