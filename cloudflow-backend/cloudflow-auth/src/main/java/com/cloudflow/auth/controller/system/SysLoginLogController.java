package com.cloudflow.auth.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.service.LoginLogService;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.mapper.SysLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 登录日志控制器。
 * <p>
 * 基于 sys_log 表中 requestUri=/login 的记录进行查询，
 * 用于独立展示登录日志列表、详情和趋势统计。
 */
@RestController
@RequestMapping("/system/login-log")
@RequiredArgsConstructor
public class SysLoginLogController {

    private final SysLogMapper sysLogMapper;
    private final LoginLogService loginLogService;

    @GetMapping("/page")
    public R page(
        @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
        @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize,
        @RequestParam(value = "logType", required = false) String logType,
        @RequestParam(value = "createBy", required = false) String createBy,
        @RequestParam(value = "remoteAddr", required = false) String remoteAddr,
        @RequestParam(value = "startTime", required = false) String startTime,
        @RequestParam(value = "endTime", required = false) String endTime) {

        LambdaQueryWrapper<SysLogEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysLogEntity::getRequestUri, "/login");

        if (StringUtils.hasText(logType)) {
            wrapper.eq(SysLogEntity::getLogType, logType);
        }
        if (StringUtils.hasText(createBy)) {
            wrapper.like(SysLogEntity::getCreateBy, createBy);
        }
        if (StringUtils.hasText(remoteAddr)) {
            wrapper.like(SysLogEntity::getRemoteAddr, remoteAddr);
        }
        if (StringUtils.hasText(startTime)) {
            wrapper.ge(SysLogEntity::getCreateTime, LocalDate.parse(startTime).atStartOfDay());
        }
        if (StringUtils.hasText(endTime)) {
            wrapper.le(SysLogEntity::getCreateTime, LocalDate.parse(endTime).atTime(LocalTime.MAX));
        }

        wrapper.orderByDesc(SysLogEntity::getCreateTime);
        IPage<SysLogEntity> page = sysLogMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
        return R.ok(page);
    }

    @GetMapping("/{id}")
    public R getById(@PathVariable("id") Long id) {
        SysLogEntity log = sysLogMapper.selectById(id);
        if (!loginLogService.isLoginLog(log)) {
            return R.fail("登录日志不存在");
        }
        return R.ok(log);
    }

    @DeleteMapping
    public R delete(@RequestBody List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.fail("请选择要删除的登录日志");
        }
        LambdaQueryWrapper<SysLogEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.in(SysLogEntity::getLogId, ids)
            .eq(SysLogEntity::getRequestUri, "/login");
        sysLogMapper.delete(wrapper);
        return R.ok("删除成功");
    }

    @GetMapping("/trend")
    public R trend() {
        LocalDateTime startTime = LocalDate.now().minusDays(30).atStartOfDay();
        LambdaQueryWrapper<SysLogEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SysLogEntity::getRequestUri, "/login")
            .ge(SysLogEntity::getCreateTime, startTime)
            .select(SysLogEntity::getLogType, SysLogEntity::getCreateTime);

        List<SysLogEntity> logs = sysLogMapper.selectList(wrapper);
        Map<String, Map<String, Long>> grouped = new LinkedHashMap<>();

        for (int i = 29; i >= 0; i--) {
            String dateStr = LocalDate.now().minusDays(i).toString();
            Map<String, Long> counts = new HashMap<>();
            counts.put("success", 0L);
            counts.put("fail", 0L);
            grouped.put(dateStr, counts);
        }

        for (SysLogEntity log : logs) {
            if (log.getCreateTime() == null) {
                continue;
            }
            String dateStr = log.getCreateTime().toLocalDate().toString();
            Map<String, Long> counts = grouped.get(dateStr);
            if (counts == null) {
                continue;
            }
            if ("9".equals(log.getLogType())) {
                counts.put("fail", counts.get("fail") + 1);
            } else {
                counts.put("success", counts.get("success") + 1);
            }
        }

        List<Map<String, Object>> result = grouped.entrySet().stream()
            .map(entry -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("date", entry.getKey());
                item.put("success", entry.getValue().get("success"));
                item.put("fail", entry.getValue().get("fail"));
                return item;
            })
            .collect(Collectors.toList());

        return R.ok(result);
    }
}
