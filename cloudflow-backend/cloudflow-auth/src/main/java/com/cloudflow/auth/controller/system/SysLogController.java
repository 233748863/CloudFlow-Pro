package com.cloudflow.auth.controller.system;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.mapper.SysLogMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 操作日志查询控制器
 * <p>
 * 提供操作日志的分页查询、详情查看、删除、趋势统计等接口。
 * 归属于系统管理模块，由 auth 服务承载。
 * </p>
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/system/log")
public class SysLogController {

    @Autowired
    private SysLogMapper sysLogMapper;

    /**
     * 分页查询操作日志
     *
     * @param pageNum   页码，默认1
     * @param pageSize  每页条数，默认10
     * @param logType   日志类型（0正常 9错误）
     * @param title     操作描述关键词
     * @param createBy  操作人
     * @param startTime 开始时间（yyyy-MM-dd）
     * @param endTime   结束时间（yyyy-MM-dd）
     */
    @GetMapping("/page")
    public R page(
            @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
            @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize,
            @RequestParam(value = "logType", required = false) String logType,
            @RequestParam(value = "title", required = false) String title,
            @RequestParam(value = "createBy", required = false) String createBy,
            @RequestParam(value = "startTime", required = false) String startTime,
            @RequestParam(value = "endTime", required = false) String endTime) {

        LambdaQueryWrapper<SysLogEntity> wrapper = new LambdaQueryWrapper<>();

        // 按日志类型筛选
        if (StringUtils.hasText(logType)) {
            wrapper.eq(SysLogEntity::getLogType, logType);
        }
        // 按操作描述模糊搜索
        if (StringUtils.hasText(title)) {
            wrapper.like(SysLogEntity::getTitle, title);
        }
        // 按操作人筛选
        if (StringUtils.hasText(createBy)) {
            wrapper.like(SysLogEntity::getCreateBy, createBy);
        }
        // 按时间范围筛选
        if (StringUtils.hasText(startTime)) {
            LocalDateTime start = LocalDate.parse(startTime).atStartOfDay();
            wrapper.ge(SysLogEntity::getCreateTime, start);
        }
        if (StringUtils.hasText(endTime)) {
            LocalDateTime end = LocalDate.parse(endTime).atTime(LocalTime.MAX);
            wrapper.le(SysLogEntity::getCreateTime, end);
        }

        // 按创建时间倒序
        wrapper.orderByDesc(SysLogEntity::getCreateTime);

        IPage<SysLogEntity> page = sysLogMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
        return R.ok(page);
    }

    /**
     * 获取操作日志详情
     */
    @GetMapping("/{id}")
    public R getById(@PathVariable("id") Long id) {
        SysLogEntity log = sysLogMapper.selectById(id);
        if (log == null) {
            return R.fail("日志不存在");
        }
        return R.ok(log);
    }

    /**
     * 删除操作日志（支持批量）
     *
     * @param ids 日志ID列表
     */
    @DeleteMapping
    public R delete(@RequestBody List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.fail("请选择要删除的日志");
        }
        sysLogMapper.deleteBatchIds(ids);
        return R.ok("删除成功");
    }

    /**
     * 操作日志趋势统计（最近30天，按天分组，区分成功/失败）
     * <p>
     * 返回格式：[{date: "2026-01-20", success: 120, fail: 3}, ...]
     * </p>
     */
    @GetMapping("/trend")
    public R<List<DynamicMapVO>> trend() {
        // 查询最近30天的日志
        LocalDateTime startTime = LocalDate.now().minusDays(30).atStartOfDay();
        LambdaQueryWrapper<SysLogEntity> wrapper = new LambdaQueryWrapper<>();
        wrapper.ge(SysLogEntity::getCreateTime, startTime)
               .select(SysLogEntity::getLogType, SysLogEntity::getCreateTime);

        List<SysLogEntity> logs = sysLogMapper.selectList(wrapper);

        // 按日期分组统计
        Map<String, Map<String, Long>> grouped = new LinkedHashMap<>();

        // 初始化最近30天的日期
        for (int i = 29; i >= 0; i--) {
            String dateStr = LocalDate.now().minusDays(i).toString();
            Map<String, Long> counts = new HashMap<>();
            counts.put("success", 0L);
            counts.put("fail", 0L);
            grouped.put(dateStr, counts);
        }

        // 统计每天的成功/失败数量
        for (SysLogEntity log : logs) {
            if (log.getCreateTime() == null) continue;
            String dateStr = log.getCreateTime().toLocalDate().toString();
            Map<String, Long> counts = grouped.get(dateStr);
            if (counts != null) {
                // logType: 0=正常, 9=错误
                if ("9".equals(log.getLogType())) {
                    counts.put("fail", counts.get("fail") + 1);
                } else {
                    counts.put("success", counts.get("success") + 1);
                }
            }
        }

        // 转换为列表格式
        List<DynamicMapVO> result = grouped.entrySet().stream()
                .map(entry -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("date", entry.getKey());
                    item.put("success", entry.getValue().get("success"));
                    item.put("fail", entry.getValue().get("fail"));
                    return DynamicMapVO.from(item);
                })
                .collect(Collectors.toList());

        return R.ok(result);
    }
}
