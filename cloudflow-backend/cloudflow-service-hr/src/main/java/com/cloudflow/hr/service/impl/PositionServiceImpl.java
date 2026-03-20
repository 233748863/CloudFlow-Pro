package com.cloudflow.hr.service.impl;
import com.cloudflow.common.core.utils.SecurityUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.dto.PositionCreateDTO;
import com.cloudflow.hr.domain.dto.PositionQueryDTO;
import com.cloudflow.hr.domain.dto.PositionUpdateDTO;
import com.cloudflow.hr.domain.entity.JobLevel;
import com.cloudflow.hr.domain.entity.Position;
import com.cloudflow.hr.domain.entity.PositionFamily;
import com.cloudflow.hr.domain.vo.JobLevelVO;
import com.cloudflow.hr.domain.vo.PositionDetailVO;
import com.cloudflow.hr.domain.vo.PositionFamilyVO;
import com.cloudflow.hr.domain.vo.PositionVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.JobLevelMapper;
import com.cloudflow.hr.mapper.PositionFamilyMapper;
import com.cloudflow.hr.mapper.PositionMapper;
import com.cloudflow.hr.service.PositionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 职位服务实现类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PositionServiceImpl implements PositionService {
    
    private final PositionMapper positionMapper;
    private final PositionFamilyMapper positionFamilyMapper;
    private final JobLevelMapper jobLevelMapper;
    private final AuthServiceClient authServiceClient;
    private final com.cloudflow.hr.service.DeptPostSyncService deptPostSyncService;
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long createPosition(PositionCreateDTO dto) {
        log.info("创建职位，职位编码：{}", dto.getPositionCode());
        
        // 1. 检查职位编码是否重复
        LambdaQueryWrapper<Position> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(Position::getPositionCode, dto.getPositionCode());
        if (positionMapper.selectCount(wrapper) > 0) {
            throw new HrBusinessException("DUPLICATE_POSITION_CODE", 
                    String.format("职位编码 [%s] 已存在", dto.getPositionCode()));
        }
        
        // 2. 验证职位族是否存在
        if (dto.getFamilyId() != null) {
            PositionFamily family = positionFamilyMapper.selectById(dto.getFamilyId());
            if (family == null) {
                throw new HrBusinessException("POSITION_FAMILY_NOT_FOUND", 
                        String.format("职位族 ID [%d] 不存在", dto.getFamilyId()));
            }
        }
        
        // 3. 验证职级是否存在
        if (dto.getLevelId() != null) {
            JobLevel level = jobLevelMapper.selectById(dto.getLevelId());
            if (level == null) {
                throw new HrBusinessException("JOB_LEVEL_NOT_FOUND", 
                        String.format("职级 ID [%d] 不存在", dto.getLevelId()));
            }
        }
        
        // 4. 验证岗位是否存在（调用Auth服务）
        if (dto.getPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(dto.getPostId());
                if (postResult == null || !postResult.isSuccess() || postResult.getData() == null) {
                    throw HrBusinessException.invalidDeptOrPost("POST", dto.getPostId());
                }
            } catch (Exception e) {
                log.error("调用Auth服务验证岗位失败，postId: {}", dto.getPostId(), e);
                throw new HrSystemException("SERVICE_CALL_ERROR", 
                        "调用Auth服务验证岗位失败", e);
            }
        }
        
        // 5. 创建职位
        Position position = new Position();
        BeanUtils.copyProperties(dto, position);
        positionMapper.insert(position);
        
        log.info("职位创建成功，职位ID：{}", position.getId());
        return position.getId();
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updatePosition(Long id, PositionUpdateDTO dto) {
        log.info("更新职位，职位ID：{}", id);
        
        // 1. 检查职位是否存在
        Position position = positionMapper.selectById(id);
        if (position == null) {
            throw new HrBusinessException("POSITION_NOT_FOUND", 
                    String.format("职位 ID [%d] 不存在", id));
        }
        
        // 2. 验证职位族是否存在
        if (dto.getFamilyId() != null) {
            PositionFamily family = positionFamilyMapper.selectById(dto.getFamilyId());
            if (family == null) {
                throw new HrBusinessException("POSITION_FAMILY_NOT_FOUND", 
                        String.format("职位族 ID [%d] 不存在", dto.getFamilyId()));
            }
        }
        
        // 3. 验证职级是否存在
        if (dto.getLevelId() != null) {
            JobLevel level = jobLevelMapper.selectById(dto.getLevelId());
            if (level == null) {
                throw new HrBusinessException("JOB_LEVEL_NOT_FOUND", 
                        String.format("职级 ID [%d] 不存在", dto.getLevelId()));
            }
        }
        
        // 4. 验证岗位是否存在（调用Auth服务）
        if (dto.getPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(dto.getPostId());
                if (postResult == null || !postResult.isSuccess() || postResult.getData() == null) {
                    throw HrBusinessException.invalidDeptOrPost("POST", dto.getPostId());
                }
            } catch (Exception e) {
                log.error("调用Auth服务验证岗位失败，postId: {}", dto.getPostId(), e);
                throw new HrSystemException("SERVICE_CALL_ERROR", 
                        "调用Auth服务验证岗位失败", e);
            }
        }
        
        // 5. 更新职位
        BeanUtils.copyProperties(dto, position);
        position.setId(id);
        positionMapper.updateById(position);
        
        log.info("职位更新成功，职位ID：{}", id);
    }
    
    @Override
    public PositionDetailVO getPosition(Long id) {
        log.info("查询职位详情，职位ID：{}", id);
        
        // 1. 查询职位基础信息
        Position position = positionMapper.selectById(id);
        if (position == null) {
            throw new HrBusinessException("POSITION_NOT_FOUND", 
                    String.format("职位 ID [%d] 不存在", id));
        }
        
        // 2. 构建详情VO
        PositionDetailVO detailVO = new PositionDetailVO();
        BeanUtils.copyProperties(position, detailVO);
        
        // 3. 查询职位族信息
        if (position.getFamilyId() != null) {
            PositionFamily family = positionFamilyMapper.selectById(position.getFamilyId());
            if (family != null) {
                PositionFamilyVO familyVO = new PositionFamilyVO();
                BeanUtils.copyProperties(family, familyVO);
                detailVO.setFamily(familyVO);
            }
        }
        
        // 4. 查询职级信息
        if (position.getLevelId() != null) {
            JobLevel level = jobLevelMapper.selectById(position.getLevelId());
            if (level != null) {
                JobLevelVO levelVO = new JobLevelVO();
                BeanUtils.copyProperties(level, levelVO);
                detailVO.setLevel(levelVO);
            }
        }
        
        // 5. 查询岗位信息（调用Auth服务）
        if (position.getPostId() != null) {
            try {
                R<PostVO> postResult = authServiceClient.getPostById(position.getPostId());
                if (postResult != null && postResult.isSuccess() && postResult.getData() != null) {
                    detailVO.setPost(postResult.getData());
                }
            } catch (Exception e) {
                log.error("调用Auth服务查询岗位信息失败，postId: {}", position.getPostId(), e);
                // 不抛出异常，允许返回部分信息
            }
        }
        
        log.info("职位详情查询成功，职位ID：{}", id);
        return detailVO;
    }
    
    @Override
    public List<PositionVO> listPositions(PositionQueryDTO query) {
        log.info("查询职位列表，查询条件：{}", query);
        
        // 1. 构建查询条件
        LambdaQueryWrapper<Position> wrapper = Wrappers.lambdaQuery();
        
        if (StringUtils.hasText(query.getPositionCode())) {
            wrapper.like(Position::getPositionCode, query.getPositionCode());
        }
        
        if (StringUtils.hasText(query.getPositionName())) {
            wrapper.like(Position::getPositionName, query.getPositionName());
        }
        
        if (query.getFamilyId() != null) {
            wrapper.eq(Position::getFamilyId, query.getFamilyId());
        }
        
        if (query.getLevelId() != null) {
            wrapper.eq(Position::getLevelId, query.getLevelId());
        }
        
        if (query.getPostId() != null) {
            wrapper.eq(Position::getPostId, query.getPostId());
        }
        
        if (query.getStatus() != null) {
            wrapper.eq(Position::getStatus, query.getStatus());
        }
        
        wrapper.orderByDesc(Position::getCreateTime);
        
        // 2. 查询职位列表
        List<Position> positions = positionMapper.selectList(wrapper);
        
        // 3. 转换为VO
        List<PositionVO> voList = positions.stream().map(position -> {
            PositionVO vo = new PositionVO();
            BeanUtils.copyProperties(position, vo);
            
            // 查询职位族名称
            if (position.getFamilyId() != null) {
                PositionFamily family = positionFamilyMapper.selectById(position.getFamilyId());
                if (family != null) {
                    vo.setFamilyName(family.getFamilyName());
                }
            }
            
            // 查询职级名称
            if (position.getLevelId() != null) {
                JobLevel level = jobLevelMapper.selectById(position.getLevelId());
                if (level != null) {
                    vo.setLevelName(level.getLevelName());
                }
            }
            
            // 查询岗位名称（调用Auth服务）
            if (position.getPostId() != null) {
                try {
                    R<PostVO> postResult = authServiceClient.getPostById(position.getPostId());
                    if (postResult != null && postResult.isSuccess() && postResult.getData() != null) {
                        vo.setPostName(postResult.getData().getPostName());
                    }
                } catch (Exception e) {
                    log.error("调用Auth服务查询岗位名称失败，postId: {}", position.getPostId(), e);
                    // 不抛出异常，允许返回部分信息
                }
            }
            
            return vo;
        }).collect(Collectors.toList());
        
        log.info("职位列表查询成功，共 {} 条记录", voList.size());
        return voList;
    }
    
    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deletePosition(Long id) {
        log.info("删除职位，职位ID：{}", id);
        
        // 1. 检查职位是否存在
        Position position = positionMapper.selectById(id);
        if (position == null) {
            throw new HrBusinessException("POSITION_NOT_FOUND", 
                    String.format("职位 ID [%d] 不存在", id));
        }
        
        // 2. 检查职位是否有在职员工
        int employeeCount = positionMapper.countEmployeesByPositionId(id);
        if (employeeCount > 0) {
            throw HrBusinessException.positionHasEmployee(id, position.getPositionName(), employeeCount);
        }
        
        // 3. 删除职位
        positionMapper.deleteById(id);
        
        log.info("职位删除成功，职位ID：{}", id);
    }
}
