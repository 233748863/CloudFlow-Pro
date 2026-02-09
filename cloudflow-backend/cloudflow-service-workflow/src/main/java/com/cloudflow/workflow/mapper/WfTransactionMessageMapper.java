package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTransactionMessage;
import org.apache.ibatis.annotations.Mapper;

/**
 * 本地消息表 Mapper
 * 
 * @author CloudFlow
 */
@Mapper
public interface WfTransactionMessageMapper extends BaseMapper<WfTransactionMessage> {
}
