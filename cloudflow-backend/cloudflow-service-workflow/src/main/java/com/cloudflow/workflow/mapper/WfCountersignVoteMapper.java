package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfCountersignVote;
import org.apache.ibatis.annotations.Mapper;

/**
 * 5.I: 会签投票记录 Mapper
 */
@Mapper
public interface WfCountersignVoteMapper extends BaseMapper<WfCountersignVote> {
}
