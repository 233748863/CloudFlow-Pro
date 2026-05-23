package com.cloudflow.hr.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cloudflow.hr.domain.entity.HrAttendanceRecord;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.Map;

public interface HrAttendanceRecordMapper extends BaseMapper<HrAttendanceRecord> {

    /**
     * 按 id+租户 取整行原始字段为 Map（含 snake_case 列名），用于审计 before 快照。
     * 找不到返回 null。
     */
    Map<String, Object> selectRowAsMap(@Param("id") Long id, @Param("tenantId") Long tenantId);

    /**
     * 申诉通过后改写考勤记录的 check_in / check_out（仅当传入非空时覆盖），并清空 exception_type、
     * 在 remark 后追加 [APPEAL_REWRITE id=xxx] 痕迹，写入 update_by。
     *
     * @return 受影响行数
     */
    int rewriteForAppeal(@Param("id") Long id,
                         @Param("tenantId") Long tenantId,
                         @Param("checkIn") LocalDateTime checkIn,
                         @Param("checkOut") LocalDateTime checkOut,
                         @Param("remarkSuffix") String remarkSuffix,
                         @Param("updateBy") String updateBy);
}
