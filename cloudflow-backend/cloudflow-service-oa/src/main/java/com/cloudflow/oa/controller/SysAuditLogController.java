package com.cloudflow.oa.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.domain.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * 审计日志查询控制器
 * <p>
 * 提供审计日志的分页查询、详情查看、删除等接口。
 * </p>
 *
 * @author CloudFlow
 */
@RestController
@RequestMapping("/sys/audit-log")
public class SysAuditLogController {

    @Autowired
    private SysAuditLogMapper sysAuditLogMapper;

    /**
     * 分页查询审计日志
     *
     * @param pageNum    页码，默认1
     * @param pageSize   每页条数，默认10
     * @param auditName  审计业务名称关键词
     * @param auditField 变更字段名关键词
     * @param createBy   操作人
     * @param startTime  开始时间（yyyy-MM-dd）
     * @param endTime    结束时间（yyyy-MM-dd）
     */
    @GetMapping("/page")
    public R page(
            @RequestParam(value = "pageNum", defaultValue = "1") Integer pageNum,
            @RequestParam(value = "pageSize", defaultValue = "10") Integer pageSize,
            @RequestParam(value = "auditName", required = false) String auditName,
            @RequestParam(value = "auditField", required = false) String auditField,
            @RequestParam(value = "createBy", required = false) String createBy,
            @RequestParam(value = "startTime", required = false) String startTime,
            @RequestParam(value = "endTime", required = false) String endTime) {

        LambdaQueryWrapper<SysAuditLogEntity> wrapper = new LambdaQueryWrapper<>();

        // 按审计业务名称模糊搜索
        if (StringUtils.hasText(auditName)) {
            wrapper.like(SysAuditLogEntity::getAuditName, auditName);
        }
        // 按变更字段名模糊搜索
        if (StringUtils.hasText(auditField)) {
            wrapper.like(SysAuditLogEntity::getAuditField, auditField);
        }
        // 按操作人筛选
        if (StringUtils.hasText(createBy)) {
            wrapper.like(SysAuditLogEntity::getCreateBy, createBy);
        }
        // 按时间范围筛选
        if (StringUtils.hasText(startTime)) {
            LocalDateTime start = LocalDate.parse(startTime).atStartOfDay();
            wrapper.ge(SysAuditLogEntity::getCreateTime, start);
        }
        if (StringUtils.hasText(endTime)) {
            LocalDateTime end = LocalDate.parse(endTime).atTime(LocalTime.MAX);
            wrapper.le(SysAuditLogEntity::getCreateTime, end);
        }

        // 按创建时间倒序
        wrapper.orderByDesc(SysAuditLogEntity::getCreateTime);

        IPage<SysAuditLogEntity> page = sysAuditLogMapper.selectPage(new Page<>(pageNum, pageSize), wrapper);
        return R.ok(page);
    }

    /**
     * 获取审计日志详情
     */
    @GetMapping("/{id}")
    public R getById(@PathVariable("id") Long id) {
        SysAuditLogEntity log = sysAuditLogMapper.selectById(id);
        if (log == null) {
            return R.fail("审计日志不存在");
        }
        return R.ok(log);
    }

    /**
     * 删除审计日志（支持批量）
     *
     * @param ids 审计日志ID列表
     */
    @DeleteMapping
    public R delete(@RequestBody List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return R.fail("请选择要删除的审计日志");
        }
        sysAuditLogMapper.deleteBatchIds(ids);
        return R.ok("删除成功");
    }
}
