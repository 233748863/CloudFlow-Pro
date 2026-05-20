package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfCallbackDeadLetter;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface WfCallbackDeadLetterMapper extends BaseMapper<WfCallbackDeadLetter> {
}
