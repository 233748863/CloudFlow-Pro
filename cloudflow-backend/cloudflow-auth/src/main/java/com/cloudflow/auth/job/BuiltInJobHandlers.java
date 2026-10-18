package com.cloudflow.auth.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.service.JobPlatformService;
import com.cloudflow.auth.service.HolidayYearlyReminderService;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** 批次 A 新增的 auth 内置任务。 */
@Component
@RequiredArgsConstructor
public class BuiltInJobHandlers {
    private final JobPlatformService jobPlatformService;
    private final SysMessageRecordMapper messageRecordMapper;
    private final HolidayYearlyReminderService holidayYearlyReminderService;

    @JobHandler(value = "jobLogClean", desc = "清理超保留期任务日志")
    public JobResult cleanJobLogs() {
        int count = jobPlatformService.cleanLogs(new com.cloudflow.auth.domain.dto.JobLogCleanDTO());
        return JobResult.success(count, "已清理任务日志 " + count + " 条");
    }

    @JobHandler(value = "jobTimeoutInspect", desc = "巡检回报丢失任务")
    public JobResult inspectJobTimeouts() {
        jobPlatformService.inspectTimeouts();
        return JobResult.success(null, "任务回报巡检完成");
    }

    @JobHandler(value = "messageRecordArchive", desc = "归档消息记录")
    public JobResult archiveMessageRecords() {
        LocalDateTime before = LocalDateTime.now().minusMonths(6);
        int count = messageRecordMapper.delete(new LambdaQueryWrapper<SysMessageRecord>()
                .lt(SysMessageRecord::getCreateTime, before)
                .in(SysMessageRecord::getSendStatus, "SUCCESS", "SKIPPED", "FAILED"));
        return JobResult.success(count, "已归档消息记录 " + count + " 条");
    }

    @JobHandler(value = "holidayYearlyRemind", desc = "提醒维护次年节假日")
    public JobResult remindHolidayCalendar() {
        return holidayYearlyReminderService.remind();
    }
}
