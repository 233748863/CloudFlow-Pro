package cn.joywon.poco.merchant.ReportModule.controller;

import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.common.security.annotation.HasPermission;
import cn.joywon.poco.merchant.ReportModule.service.DistributedLockService;
import cn.joywon.poco.merchant.ReportModule.vo.LockStatusVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 报表锁管理控制器
 * 提供分布式锁状态查询和管理功能
 *
 * @author poco
 * @date 2025-01-06
 */
@RestController
@AllArgsConstructor
@RequestMapping("/report/lock")
@Tag(name = "报表锁管理", description = "分布式锁状态查询与管理接口")
@Slf4j
public class ReportLockController {

    private final DistributedLockService distributedLockService;

    /**
     * 查询所有报表相关锁的状态
     *
     * @return 锁状态列表
     */
    @GetMapping("/status")
    @Operation(summary = "查询所有锁状态", description = "获取所有报表相关分布式锁的当前状态")
    @HasPermission("report_lock_view")
    public R<List<LockStatusVO>> getAllLockStatus() {
        log.info("查询所有报表锁状态");
        List<LockStatusVO> statusList = distributedLockService.getAllReportLockStatus();
        return R.ok(statusList);
    }

    /**
     * 查询指定锁的状态
     *
     * @param lockKey 锁的Key（URL编码）
     * @return 锁状态信息
     */
    @GetMapping("/status/{lockKey}")
    @Operation(summary = "查询指定锁状态", description = "根据锁Key查询指定分布式锁的当前状态")
    @HasPermission("report_lock_view")
    public R<LockStatusVO> getLockStatus(
            @Parameter(description = "锁的Key（URL编码）") @PathVariable String lockKey) {
        // URL解码锁Key，因为锁Key中包含冒号等特殊字符
        String decodedLockKey = URLDecoder.decode(lockKey, StandardCharsets.UTF_8);
        log.info("查询锁状态: {}", decodedLockKey);
        LockStatusVO status = distributedLockService.getLockStatus(decodedLockKey);
        return R.ok(status);
    }

    /**
     * 强制释放锁（仅限管理员）
     *
     * @param lockKey 锁的Key（URL编码）
     * @return 是否释放成功
     */
    @DeleteMapping("/{lockKey}")
    @Operation(summary = "强制释放锁", description = "强制释放指定的分布式锁（仅限管理员，用于处理异常情况）")
    @HasPermission("report_lock_admin")
    public R<Boolean> forceUnlock(
            @Parameter(description = "锁的Key（URL编码）") @PathVariable String lockKey) {
        // URL解码锁Key
        String decodedLockKey = URLDecoder.decode(lockKey, StandardCharsets.UTF_8);
        log.warn("强制释放锁请求: {}", decodedLockKey);
        boolean result = distributedLockService.forceUnlock(decodedLockKey);
        if (result) {
            log.warn("锁已被强制释放: {}", decodedLockKey);
            return R.ok(true, "锁已成功释放");
        } else {
            log.info("锁不存在或已释放: {}", decodedLockKey);
            return R.ok(false, "锁不存在或已释放");
        }
    }
}
