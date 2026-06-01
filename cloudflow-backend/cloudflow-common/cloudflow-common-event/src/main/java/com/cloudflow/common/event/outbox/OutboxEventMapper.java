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

    int claimBatch(@Param("owner") String owner,
                   @Param("now") LocalDateTime now,
                   @Param("lockedUntil") LocalDateTime lockedUntil,
                   @Param("limit") int limit);

    List<OutboxEvent> selectClaimedEvents(@Param("owner") String owner, @Param("limit") int limit);

    int markPublished(@Param("id") Long id, @Param("owner") String owner, @Param("publishedAt") LocalDateTime publishedAt);

    int markFailed(@Param("id") Long id,
                   @Param("owner") String owner,
                   @Param("retryCount") int retryCount,
                   @Param("nextRetryAt") LocalDateTime nextRetryAt,
                   @Param("lastError") String lastError,
                   @Param("status") String status);
}
