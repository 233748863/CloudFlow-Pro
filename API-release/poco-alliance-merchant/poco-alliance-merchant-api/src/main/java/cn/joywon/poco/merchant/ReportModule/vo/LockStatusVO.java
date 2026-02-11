package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 锁状态信息VO
 * 用于查询和展示分布式锁的当前状态
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "锁状态信息VO")
public class LockStatusVO implements Serializable {

    /**
     * 锁的Key
     */
    @Schema(description = "锁的Key")
    private String lockKey;

    /**
     * 是否被锁定
     */
    @Schema(description = "是否被锁定")
    private boolean locked;

    /**
     * 持有锁的线程ID（如果可获取）
     */
    @Schema(description = "持有锁的线程ID")
    private String holderId;

    /**
     * 剩余持有时间（毫秒），-1表示无限期，-2表示锁不存在
     */
    @Schema(description = "剩余持有时间（毫秒）")
    private long remainLeaseTime;

    /**
     * 锁定时间
     */
    @Schema(description = "锁定时间")
    private LocalDateTime lockTime;
}
