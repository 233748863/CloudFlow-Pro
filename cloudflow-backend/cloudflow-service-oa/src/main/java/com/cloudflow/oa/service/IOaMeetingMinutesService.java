package com.cloudflow.oa.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.OaMeetingAttendance;
import com.cloudflow.oa.domain.OaMeetingMinutes;

import java.util.List;
import java.util.Map;

/**
 * OA-P1-2 会议纪要 + 出席记录。
 *
 * <p>纪要确认（CONFIRMED）后，decisions 中的决议项可一键派发为 oa_work_task。
 */
public interface IOaMeetingMinutesService {

    Page<OaMeetingMinutes> page(String keyword, String status, Long meetingId, Integer pageNum, Integer pageSize);

    OaMeetingMinutes getDetail(Long id);

    boolean save(OaMeetingMinutes minutes);

    boolean update(OaMeetingMinutes minutes);

    boolean remove(Long id);

    /** DRAFT → CONFIRMED；写 confirmed_time。 */
    boolean confirm(Long id);

    List<OaMeetingAttendance> listAttendance(Long minutesId);

    boolean upsertAttendance(OaMeetingAttendance attendance);

    boolean removeAttendance(Long id);

    /**
     * 将本次纪要的 decisions 数组一键派发为 oa_work_task。
     * 返回生成的 work_task ID 列表，同时回写 decisions[i].workTaskId 与 status。
     */
    List<Long> dispatchDecisionsToWorkTasks(Long minutesId, List<Map<String, Object>> decisionOverrides);
}
