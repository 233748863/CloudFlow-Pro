package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.RecruitmentRequest;
import org.apache.ibatis.annotations.Mapper;

/**
 * 招聘需求Mapper接口
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface RecruitmentRequestMapper extends BaseMapper<RecruitmentRequest> {
}
