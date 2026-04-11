package com.cloudflow.hr.service.impl;
import com.cloudflow.common.core.utils.SecurityUtils;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.hr.client.AuthServiceClient;
import com.cloudflow.hr.client.vo.DeptVO;
import com.cloudflow.hr.client.vo.PostVO;
import com.cloudflow.hr.domain.dto.HeadcountQueryDTO;
import com.cloudflow.hr.domain.dto.HeadcountSetDTO;
import com.cloudflow.hr.domain.entity.Headcount;
import com.cloudflow.hr.domain.vo.HeadcountStatisticsVO;
import com.cloudflow.hr.domain.vo.HeadcountVO;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.exception.HrSystemException;
import com.cloudflow.hr.mapper.HeadcountMapper;
import com.cloudflow.hr.service.HeadcountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 编制管理服务实现类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HeadcountServiceImpl implements HeadcountService {

    private final HeadcountMapper headcountMapper;
    private final AuthServiceClient authServiceClient;
    private final com.cloudflow.hr.service.DeptPostSyncService deptPostSyncService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void setHeadcount(HeadcountSetDTO dto) {
        log.info("设置编制，目标类型：{}，目标ID：{}，核定编制数：{}", 
                dto.getTargetType(), dto.getTargetId(), dto.getApprovedCount());

        // 验证目标类型
        validateTargetType(dto.getTargetType());
        validateDateRange(dto.getEffectiveDate(), dto.getExpiryDate());

        // 验证目标是否存在
        validateTarget(dto.getTargetType(), dto.getTargetId());

        Long tenantId = SecurityUtils.getTenantId();

        // 查询是否已存在有效的编制记录
        LambdaQueryWrapper<Headcount> queryWrapper = Wrappers.lambdaQuery();
        queryWrapper.eq(Headcount::getTenantId, tenantId)
                .eq(Headcount::getTargetType, dto.getTargetType())
                .eq(Headcount::getTargetId, dto.getTargetId())
                .and(wrapper -> wrapper
                        .isNull(Headcount::getExpiryDate)
                        .or()
                        .ge(Headcount::getExpiryDate, LocalDate.now())
                );

        Headcount existingHeadcount = headcountMapper.selectOne(queryWrapper);

        if (existingHeadcount != null) {
            // 更新现有编制
            LambdaUpdateWrapper<Headcount> updateWrapper = Wrappers.lambdaUpdate();
            updateWrapper.eq(Headcount::getId, existingHeadcount.getId())
                    .set(Headcount::getApprovedCount, dto.getApprovedCount())
                    .set(Headcount::getVacancyCount, dto.getApprovedCount() - existingHeadcount.getActualCount())
                    .set(dto.getEffectiveDate() != null, Headcount::getEffectiveDate, dto.getEffectiveDate())
                    // 显式允许写入 NULL，支持清空到期日
                    .set(Headcount::getExpiryDate, dto.getExpiryDate())
                    .set(Headcount::getUpdateTime, LocalDateTime.now());
            headcountMapper.update(null, updateWrapper);
            log.info("更新编制成功，编制ID：{}", existingHeadcount.getId());
        } else {
            // 创建新编制
            Headcount headcount = new Headcount();
            headcount.setTenantId(tenantId);
            headcount.setTargetType(dto.getTargetType());
            headcount.setTargetId(dto.getTargetId());
            headcount.setApprovedCount(dto.getApprovedCount());
            headcount.setActualCount(0);
            headcount.setVacancyCount(dto.getApprovedCount());
            headcount.setEffectiveDate(dto.getEffectiveDate() != null ? dto.getEffectiveDate() : LocalDate.now());
            headcount.setExpiryDate(dto.getExpiryDate());

            headcountMapper.insert(headcount);
            log.info("创建编制成功，编制ID：{}", headcount.getId());
        }
    }

    @Override
    public HeadcountStatisticsVO getHeadcountStatistics(String targetType, Long targetId) {
        log.info("获取编制统计，目标类型：{}，目标ID：{}", targetType, targetId);

        Long tenantId = SecurityUtils.getTenantId();

        // 查询有效的编制记录
        LambdaQueryWrapper<Headcount> queryWrapper = Wrappers.lambdaQuery();
        queryWrapper.eq(Headcount::getTenantId, tenantId)
                .eq(Headcount::getTargetType, targetType)
                .eq(Headcount::getTargetId, targetId)
                .and(wrapper -> wrapper
                        .isNull(Headcount::getExpiryDate)
                        .or()
                        .ge(Headcount::getExpiryDate, LocalDate.now())
                );

        Headcount headcount = headcountMapper.selectOne(queryWrapper);

        if (headcount == null) {
            throw new HrBusinessException("未找到编制信息");
        }

        // 构建统计VO
        HeadcountStatisticsVO statisticsVO = new HeadcountStatisticsVO();
        statisticsVO.setTargetType(headcount.getTargetType());
        statisticsVO.setTargetId(headcount.getTargetId());
        statisticsVO.setApprovedCount(headcount.getApprovedCount());
        statisticsVO.setActualCount(headcount.getActualCount());
        statisticsVO.setVacancyCount(headcount.getVacancyCount());

        // 获取目标名称
        String targetName = getTargetName(headcount.getTargetType(), headcount.getTargetId());
        statisticsVO.setTargetName(targetName);

        // 计算编制使用率
        if (headcount.getApprovedCount() > 0) {
            BigDecimal utilizationRate = BigDecimal.valueOf(headcount.getActualCount())
                    .divide(BigDecimal.valueOf(headcount.getApprovedCount()), 4, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100));
            statisticsVO.setUtilizationRate(utilizationRate);
        } else {
            statisticsVO.setUtilizationRate(BigDecimal.ZERO);
        }

        // 判断是否超编
        statisticsVO.setIsOverstaffed(headcount.getActualCount() > headcount.getApprovedCount());

        return statisticsVO;
    }

    @Override
    public List<HeadcountVO> listHeadcounts(HeadcountQueryDTO query) {
        log.info("查询编制列表，查询条件：{}", query);

        Long tenantId = SecurityUtils.getTenantId();

        LambdaQueryWrapper<Headcount> queryWrapper = Wrappers.lambdaQuery();
        queryWrapper.eq(Headcount::getTenantId, tenantId);

        // 目标类型过滤
        if (query.getTargetType() != null) {
            queryWrapper.eq(Headcount::getTargetType, query.getTargetType());
        }

        // 目标ID过滤
        if (query.getTargetId() != null) {
            queryWrapper.eq(Headcount::getTargetId, query.getTargetId());
        }

        // 是否包含已过期的编制
        if (query.getIncludeExpired() == null || !query.getIncludeExpired()) {
            queryWrapper.and(wrapper -> wrapper
                    .isNull(Headcount::getExpiryDate)
                    .or()
                    .ge(Headcount::getExpiryDate, LocalDate.now())
            );
        }

        queryWrapper.orderByDesc(Headcount::getCreateTime);

        List<Headcount> headcounts = headcountMapper.selectList(queryWrapper);

        // 转换为VO
        return headcounts.stream().map(headcount -> {
            HeadcountVO vo = new HeadcountVO();
            BeanUtils.copyProperties(headcount, vo);

            // 获取目标名称
            String targetName = getTargetName(headcount.getTargetType(), headcount.getTargetId());
            vo.setTargetName(targetName);

            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void updateActualCount(String targetType, Long targetId, Integer actualCount) {
        log.info("更新实际在职人数，目标类型：{}，目标ID：{}，实际人数：{}", 
                targetType, targetId, actualCount);

        Long tenantId = SecurityUtils.getTenantId();
        validateTargetType(targetType);
        validateActualCount(actualCount);
        validateTarget(targetType, targetId);

        // 查询有效的编制记录
        LambdaQueryWrapper<Headcount> queryWrapper = Wrappers.lambdaQuery();
        queryWrapper.eq(Headcount::getTenantId, tenantId)
                .eq(Headcount::getTargetType, targetType)
                .eq(Headcount::getTargetId, targetId)
                .and(wrapper -> wrapper
                        .isNull(Headcount::getExpiryDate)
                        .or()
                        .ge(Headcount::getExpiryDate, LocalDate.now())
                );

        Headcount headcount = headcountMapper.selectOne(queryWrapper);

        if (headcount != null) {
            headcount.setActualCount(actualCount);
            headcount.setVacancyCount(headcount.getApprovedCount() - actualCount);
            headcount.setUpdateTime(LocalDateTime.now());
            headcountMapper.updateById(headcount);
            log.info("更新实际在职人数成功");
        } else {
            throw new HrBusinessException("HEADCOUNT_NOT_FOUND", "未找到有效的编制记录");
        }
    }

    private void validateTargetType(String targetType) {
        if (!"DEPT".equals(targetType) && !"POST".equals(targetType)) {
            throw new HrBusinessException("目标类型只能是DEPT或POST");
        }
    }

    private void validateDateRange(LocalDate effectiveDate, LocalDate expiryDate) {
        LocalDate baseDate = effectiveDate != null ? effectiveDate : LocalDate.now();
        if (expiryDate != null && expiryDate.isBefore(baseDate)) {
            throw new HrBusinessException("INVALID_HEADCOUNT_DATE", "失效日期不能早于生效日期");
        }
    }

    private void validateActualCount(Integer actualCount) {
        if (actualCount == null || actualCount < 0) {
            throw new HrBusinessException("INVALID_ACTUAL_COUNT", "实际在职人数不能小于0");
        }
    }

    /**
     * 验证目标是否存在
     */
    private void validateTarget(String targetType, Long targetId) {
        if ("DEPT".equals(targetType)) {
            // 验证部门是否存在
            try {
                R<DeptVO> result = authServiceClient.getDeptById(targetId);
                if (result == null) {
                    throw new HrSystemException("VALIDATE_DEPT_FAILED", "校验部门编制目标失败：Auth 服务无响应");
                }
                DeptVO dept = result.getData();
                if (dept == null) {
                    throw new HrBusinessException("部门不存在");
                }
            } catch (HrBusinessException | HrSystemException e) {
                throw e;
            } catch (Exception e) {
                log.error("验证部门失败", e);
                throw new HrBusinessException("验证部门失败：" + e.getMessage());
            }
        } else if ("POST".equals(targetType)) {
            // 验证岗位是否存在
            try {
                R<PostVO> result = authServiceClient.getPostById(targetId);
                if (result == null) {
                    throw new HrSystemException("VALIDATE_POST_FAILED", "校验岗位编制目标失败：Auth 服务无响应");
                }
                PostVO post = result.getData();
                if (post == null) {
                    throw new HrBusinessException("岗位不存在");
                }
            } catch (HrBusinessException | HrSystemException e) {
                throw e;
            } catch (Exception e) {
                log.error("验证岗位失败", e);
                throw new HrBusinessException("验证岗位失败：" + e.getMessage());
            }
        }
    }

    /**
     * 获取目标名称
     */
    private String getTargetName(String targetType, Long targetId) {
        try {
            if ("DEPT".equals(targetType)) {
                // 优先从缓存获取
                DeptVO dept = deptPostSyncService.getCachedDept(targetId);
                if (dept == null) {
                    // 缓存未命中，从Auth服务获取
                    R<DeptVO> result = authServiceClient.getDeptById(targetId);
                    if (result != null && result.isSuccess()) {
                        dept = result.getData();
                    }
                }
                return dept != null ? dept.getDeptName() : "未知部门";
            } else if ("POST".equals(targetType)) {
                // 优先从缓存获取
                PostVO post = deptPostSyncService.getCachedPost(targetId);
                if (post == null) {
                    // 缓存未命中，从Auth服务获取
                    R<PostVO> result = authServiceClient.getPostById(targetId);
                    if (result != null && result.isSuccess()) {
                        post = result.getData();
                    }
                }
                return post != null ? post.getPostName() : "未知岗位";
            }
        } catch (Exception e) {
            log.error("获取目标名称失败", e);
        }
        return "未知";
    }
}
