package com.cloudflow.hr.service.impl;
import com.cloudflow.common.core.utils.SecurityUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.hr.domain.dto.PositionFamilyCreateDTO;
import com.cloudflow.hr.domain.dto.PositionFamilyUpdateDTO;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.PositionFamily;
import com.cloudflow.hr.domain.vo.PositionFamilyVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.PositionFamilyMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.service.PositionFamilyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 职位族服务实现类
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PositionFamilyServiceImpl implements PositionFamilyService {
    
    private final PositionFamilyMapper positionFamilyMapper;
    private final PositionMapper positionMapper;
    
    /**
     * 创建职位族
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createPositionFamily(PositionFamilyCreateDTO dto) {
        log.info("创建职位族，familyCode: {}, familyName: {}", dto.getFamilyCode(), dto.getFamilyName());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查职位族编码是否已存在
        LambdaQueryWrapper<PositionFamily> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(PositionFamily::getTenantId, tenantId)
                    .eq(PositionFamily::getFamilyCode, dto.getFamilyCode());
        
        if (positionFamilyMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("职位族编码已存在：" + dto.getFamilyCode());
        }
        
        // 创建职位族实体
        PositionFamily positionFamily = new PositionFamily();
        BeanUtils.copyProperties(dto, positionFamily);
        positionFamily.setTenantId(tenantId);
        
        // 保存到数据库
        positionFamilyMapper.insert(positionFamily);
        
        log.info("职位族创建成功，ID: {}", positionFamily.getId());
        return positionFamily.getId();
    }
    
    /**
     * 更新职位族
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updatePositionFamily(Long id, PositionFamilyUpdateDTO dto) {
        log.info("更新职位族，ID: {}, familyCode: {}", id, dto.getFamilyCode());
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查职位族是否存在
        PositionFamily existingFamily = positionFamilyMapper.selectById(id);
        if (existingFamily == null || !existingFamily.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("职位族不存在或无权限访问");
        }
        
        // 检查职位族编码是否与其他记录冲突
        LambdaQueryWrapper<PositionFamily> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(PositionFamily::getTenantId, tenantId)
                    .eq(PositionFamily::getFamilyCode, dto.getFamilyCode())
                    .ne(PositionFamily::getId, id);
        
        if (positionFamilyMapper.selectCount(queryWrapper) > 0) {
            throw new HrBusinessException("职位族编码已被其他记录使用：" + dto.getFamilyCode());
        }
        
        // 更新职位族信息
        PositionFamily positionFamily = new PositionFamily();
        BeanUtils.copyProperties(dto, positionFamily);
        positionFamily.setId(id);
        positionFamily.setTenantId(tenantId);
        
        positionFamilyMapper.updateById(positionFamily);
        
        log.info("职位族更新成功，ID: {}", id);
    }
    
    /**
     * 获取职位族详情
     */
    @Override
    public PositionFamilyVO getPositionFamily(Long id) {
        log.info("获取职位族详情，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询职位族
        PositionFamily positionFamily = positionFamilyMapper.selectById(id);
        if (positionFamily == null || !positionFamily.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("职位族不存在或无权限访问");
        }
        
        // 转换为VO
        PositionFamilyVO vo = new PositionFamilyVO();
        BeanUtils.copyProperties(positionFamily, vo);
        
        return vo;
    }
    
    /**
     * 获取所有职位族列表
     */
    @Override
    public List<PositionFamilyVO> listPositionFamilies() {
        log.info("获取职位族列表");
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 查询职位族列表（按排序号升序）
        LambdaQueryWrapper<PositionFamily> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(PositionFamily::getTenantId, tenantId)
                    .orderByAsc(PositionFamily::getSortOrder);
        
        List<PositionFamily> families = positionFamilyMapper.selectList(queryWrapper);
        
        // 转换为VO列表
        return families.stream()
                .map(family -> {
                    PositionFamilyVO vo = new PositionFamilyVO();
                    BeanUtils.copyProperties(family, vo);
                    return vo;
                })
                .collect(Collectors.toList());
    }
    
    /**
     * 删除职位族
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePositionFamily(Long id) {
        log.info("删除职位族，ID: {}", id);
        
        // 获取当前租户ID
        Long tenantId = SecurityUtils.getTenantId();
        
        // 检查职位族是否存在
        PositionFamily existingFamily = positionFamilyMapper.selectById(id);
        if (existingFamily == null || !existingFamily.getTenantId().equals(tenantId)) {
            throw new HrBusinessException("职位族不存在或无权限访问");
        }
        
        LambdaQueryWrapper<Position> positionWrapper = new LambdaQueryWrapper<>();
        positionWrapper.eq(Position::getTenantId, tenantId)
                .eq(Position::getFamilyId, id);
        if (positionMapper.selectCount(positionWrapper) > 0) {
            throw new HrBusinessException("POSITION_FAMILY_IN_USE", "该职位族已被职位引用，无法删除");
        }
        
        // 删除职位族
        positionFamilyMapper.deleteById(id);
        
        log.info("职位族删除成功，ID: {}", id);
    }
}
