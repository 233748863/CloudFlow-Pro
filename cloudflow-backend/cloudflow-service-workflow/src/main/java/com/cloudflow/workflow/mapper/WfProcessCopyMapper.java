package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfProcessCopy;
import org.apache.ibatis.annotations.Mapper;

/**
 * 流程抄送记录 Mapper
 */
@Mapper
public interface WfProcessCopyMapper extends BaseMapper<WfProcessCopy> {
}
