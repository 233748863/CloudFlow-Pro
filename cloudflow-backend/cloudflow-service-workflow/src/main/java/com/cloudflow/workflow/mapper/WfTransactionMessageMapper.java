package com.cloudflow.workflow.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.workflow.domain.WfTransactionMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 本地消息表 Mapper
 * 
 * @author CloudFlow
 */
@Mapper
public interface WfTransactionMessageMapper extends BaseMapper<WfTransactionMessage> {
    List<WfTransactionMessage> selectRetryCandidates(@Param("afterId") String afterId,
            @Param("observedAt") LocalDateTime observedAt, @Param("limit") int limit);

    WfTransactionMessage selectForRetry(@Param("tenantId") Long tenantId, @Param("messageId") String messageId);
}
