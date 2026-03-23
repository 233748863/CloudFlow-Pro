package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.AuditLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 审计日志Mapper接口
 * 
 * @author CloudFlow
 */
@Mapper
public interface AuditLogMapper extends BaseMapper<AuditLog> {
    
    /**
     * 查询需要归档的日志
     * 
     * @param beforeDate 归档截止日期（查询此日期之前的日志）
     * @param limit 限制数量
     * @return 待归档的日志列表
     */
    List<AuditLog> selectLogsForArchive(@Param("beforeDate") LocalDateTime beforeDate, 
                                         @Param("limit") Integer limit);
    
    /**
     * 批量更新日志归档状态
     * 
     * @param ids 日志ID列表
     * @param archiveTime 归档时间
     * @return 更新的记录数
     */
    int batchUpdateArchiveStatus(@Param("ids") List<Long> ids, 
                                  @Param("archiveTime") LocalDateTime archiveTime);
    
    /**
     * 删除已归档的旧日志
     * 
     * @param beforeDate 删除截止日期（删除此日期之前的已归档日志）
     * @return 删除的记录数
     */
    int deleteArchivedLogs(@Param("beforeDate") LocalDateTime beforeDate);
}
