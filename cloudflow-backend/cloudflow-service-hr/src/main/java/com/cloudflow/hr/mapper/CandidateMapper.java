package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.Candidate;
import org.apache.ibatis.annotations.Mapper;

/**
 * 候选人Mapper接口
 *
 * @author CloudFlow
 * @since 2026-03-20
 */
@Mapper
public interface CandidateMapper extends BaseMapper<Candidate> {
}
