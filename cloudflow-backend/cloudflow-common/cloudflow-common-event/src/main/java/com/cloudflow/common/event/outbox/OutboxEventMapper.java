package com.cloudflow.common.event.outbox;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Outbox 事件表 Mapper。
 */
@Mapper
public interface OutboxEventMapper extends BaseMapper<OutboxEvent> {

    /**
     * 查询待发布事件（status=PENDING 且 nextRetryAt <= now）。
     * 按 createdAt 升序，保证 FIFO。
     */
    List<OutboxEvent> selectPendingEvents(@Param("now") LocalDateTime now, @Param("limit") int limit);
}
