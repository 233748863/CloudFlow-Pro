package com.cloudflow.workflow.config.properties;

import com.cloudflow.common.redis.core.SysConfigHelper;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

/**
 * 工作流模块配置属性
 * <p>
 * 优先从 sys_config 表（通过 Redis 缓存）读取配置值，
 * 读取不到时使用 application.yml 或代码中的默认值。
 * <p>
 * 对应配置键：
 * - sys.workflow.maxDepth（ID 28，全局）：流程最大深度
 * - sys.workflow.recallTimeoutHours（ID 29，租户）：撤回时间窗口
 * - sys.workflow.maxRetryCount（ID 30，全局）：失败最大重试次数
 * - sys.workflow.timerMaxRetry（ID 40，全局）：定时器最大重试次数
 * - sys.workflow.timerRetryInterval（ID 41，全局）：定时器重试间隔（分钟）
 * - sys.workflow.retryBaseInterval（ID 42，全局）：重试基础间隔（秒）
 * - sys.workflow.asyncStatusExpire（ID 43，全局）：异步状态过期时间（分钟）
 * - sys.workflow.nonceExpireMinutes（ID 44，全局）：Nonce 防重放过期时间（分钟）
 * - sys.workflow.stream.key（ID 65，全局）：Redis Stream Key
 * - sys.workflow.stream.group（ID 66，全局）：Redis Stream Group
 *
 * @author CloudFlow
 */
@Slf4j
@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.workflow")
public class WorkflowProperties {

    @Autowired(required = false)
    private SysConfigHelper sysConfigHelper;

    private Stream stream = new Stream();
    private Engine engine = new Engine();
    private Recall recall = new Recall();
    private Timer timer = new Timer();
    private Retry retry = new Retry();
    private Async async = new Async();
    private Nonce nonce = new Nonce();
    private Lock lock = new Lock();
    private Script script = new Script();

    /**
     * 初始化时从 sys_config 加载配置值，覆盖默认值
     */
    @PostConstruct
    public void loadFromSysConfig() {
        if (sysConfigHelper == null) {
            log.warn("SysConfigHelper未注入，工作流配置使用默认值");
            return;
        }

        try {
            // === 全局配置 ===
            // 流程深度限制（防止循环流程堆栈溢出）
            engine.setMaxDepth(
                    sysConfigHelper.getGlobalInt("sys.workflow.maxDepth", engine.getMaxDepth()));
            // 失败最大重试次数
            engine.setMaxRetryCount(
                    sysConfigHelper.getGlobalInt("sys.workflow.maxRetryCount", engine.getMaxRetryCount()));

            // 定时器配置
            timer.setMaxRetry(
                    sysConfigHelper.getGlobalInt("sys.workflow.timerMaxRetry", timer.getMaxRetry()));
            timer.setRetryInterval(
                    sysConfigHelper.getGlobalInt("sys.workflow.timerRetryInterval", timer.getRetryInterval()));

            // 重试配置
            retry.setBaseInterval(
                    sysConfigHelper.getGlobalInt("sys.workflow.retryBaseInterval", retry.getBaseInterval()));

            // 异步状态过期
            async.setStatusExpireMinutes(
                    sysConfigHelper.getGlobalInt("sys.workflow.asyncStatusExpire", async.getStatusExpireMinutes()));

            // Nonce 防重放过期
            nonce.setExpireMinutes(
                    sysConfigHelper.getGlobalInt("sys.workflow.nonceExpireMinutes", nonce.getExpireMinutes()));

            // 分布式锁配置
            lock.setCountersignWait(
                    sysConfigHelper.getGlobalInt("sys.workflow.lock.countersignWait", lock.getCountersignWait()));
            lock.setCountersignLease(
                    sysConfigHelper.getGlobalInt("sys.workflow.lock.countersignLease", lock.getCountersignLease()));
            lock.setDeadlockTimeout(
                    sysConfigHelper.getGlobalInt("sys.workflow.lock.deadlockTimeout", lock.getDeadlockTimeout()));
            lock.setMaxVictimRecords(
                    sysConfigHelper.getGlobalInt("sys.workflow.lock.maxVictimRecords", lock.getMaxVictimRecords()));

            script.setEnabled(
                    sysConfigHelper.getGlobalBoolean("sys.workflow.script.enabled", script.isEnabled()));

            // Redis Stream 配置
            String streamKey = sysConfigHelper.getGlobalValue("sys.workflow.stream.key", null);
            if (streamKey != null) {
                stream.setKey(streamKey);
            }
            String streamGroup = sysConfigHelper.getGlobalValue("sys.workflow.stream.group", null);
            if (streamGroup != null) {
                stream.setGroup(streamGroup);
            }

            // === 租户配置 ===
            // 撤回时间窗口（每个租户可自定义）
            recall.setTimeoutHours(
                    sysConfigHelper.getTenantInt("sys.workflow.recallTimeoutHours", recall.getTimeoutHours()));

            log.info("工作流配置已从 sys_config 加载: maxDepth={}, recallTimeout={}h, timerMaxRetry={}, asyncExpire={}min",
                    engine.getMaxDepth(), recall.getTimeoutHours(), timer.getMaxRetry(), async.getStatusExpireMinutes());
        } catch (Exception e) {
            log.warn("从 sys_config 加载工作流配置失败，使用默认值: {}", e.getMessage());
        }
    }

    // ========== Getter/Setter ==========

    public Stream getStream() { return stream; }
    public void setStream(Stream stream) { this.stream = stream; }

    public Engine getEngine() { return engine; }
    public void setEngine(Engine engine) { this.engine = engine; }

    public Recall getRecall() { return recall; }
    public void setRecall(Recall recall) { this.recall = recall; }

    public Timer getTimer() { return timer; }
    public void setTimer(Timer timer) { this.timer = timer; }

    public Retry getRetry() { return retry; }
    public void setRetry(Retry retry) { this.retry = retry; }

    public Async getAsync() { return async; }
    public void setAsync(Async async) { this.async = async; }

    public Nonce getNonce() { return nonce; }
    public void setNonce(Nonce nonce) { this.nonce = nonce; }

    public Lock getLock() { return lock; }
    public void setLock(Lock lock) { this.lock = lock; }

    public Script getScript() { return script; }
    public void setScript(Script script) { this.script = script; }

    // ========== 内部配置类 ==========

    /** Redis Stream 配置 */
    public static class Stream {
        /** Stream Key，默认 workflow:stream:timeout */
        private String key = "workflow:stream:timeout";
        /** 消费者组名称，默认 group:workflow:engine */
        private String group = "group:workflow:engine";

        public String getKey() { return key; }
        public void setKey(String key) { this.key = key; }
        public String getGroup() { return group; }
        public void setGroup(String group) { this.group = group; }
    }

    /** 流程引擎配置 */
    public static class Engine {
        /** 流程深度限制，防止循环流程导致堆栈溢出，默认 500 */
        private int maxDepth = 500;
        /** 失败最大重试次数，默认 5 */
        private int maxRetryCount = 5;

        public int getMaxDepth() { return maxDepth; }
        public void setMaxDepth(int maxDepth) { this.maxDepth = maxDepth; }
        public int getMaxRetryCount() { return maxRetryCount; }
        public void setMaxRetryCount(int maxRetryCount) { this.maxRetryCount = maxRetryCount; }
    }

    /** 流程撤回配置 */
    public static class Recall {
        /** 撤回时间窗口（小时），超过此时间后不允许撤回，0 表示不限制，默认 24 */
        private int timeoutHours = 24;

        public int getTimeoutHours() { return timeoutHours; }
        public void setTimeoutHours(int timeoutHours) { this.timeoutHours = timeoutHours; }
    }

    /** 定时器配置 */
    public static class Timer {
        /** 定时器最大重试次数，默认 3 */
        private int maxRetry = 3;
        /** 定时器重试间隔（分钟），默认 2 */
        private int retryInterval = 2;

        public int getMaxRetry() { return maxRetry; }
        public void setMaxRetry(int maxRetry) { this.maxRetry = maxRetry; }
        public int getRetryInterval() { return retryInterval; }
        public void setRetryInterval(int retryInterval) { this.retryInterval = retryInterval; }
    }

    /** 重试配置 */
    public static class Retry {
        /** 重试基础间隔（秒），默认 30 */
        private int baseInterval = 30;

        public int getBaseInterval() { return baseInterval; }
        public void setBaseInterval(int baseInterval) { this.baseInterval = baseInterval; }
    }

    /** 异步处理配置 */
    public static class Async {
        /** 异步状态过期时间（分钟），默认 10 */
        private int statusExpireMinutes = 10;

        public int getStatusExpireMinutes() { return statusExpireMinutes; }
        public void setStatusExpireMinutes(int statusExpireMinutes) { this.statusExpireMinutes = statusExpireMinutes; }
    }

    /** 分布式锁配置 */
    public static class Lock {
        /** 会签锁等待时间（秒），默认 10 */
        private int countersignWait = 10;
        /** 会签锁持有时间（秒），默认 30 */
        private int countersignLease = 30;
        /** 死锁检测超时阈值（秒），默认 60 */
        private int deadlockTimeout = 60;
        /** 最大牺牲记录保留数量，默认 100 */
        private int maxVictimRecords = 100;

        public int getCountersignWait() { return countersignWait; }
        public void setCountersignWait(int countersignWait) { this.countersignWait = countersignWait; }
        public int getCountersignLease() { return countersignLease; }
        public void setCountersignLease(int countersignLease) { this.countersignLease = countersignLease; }
        public int getDeadlockTimeout() { return deadlockTimeout; }
        public void setDeadlockTimeout(int deadlockTimeout) { this.deadlockTimeout = deadlockTimeout; }
        public int getMaxVictimRecords() { return maxVictimRecords; }
        public void setMaxVictimRecords(int maxVictimRecords) { this.maxVictimRecords = maxVictimRecords; }
    }

    /** Nonce 防重放配置 */
    public static class Nonce {
        /** Nonce 过期时间（分钟），默认 5 */
        private int expireMinutes = 5;

        public int getExpireMinutes() { return expireMinutes; }
        public void setExpireMinutes(int expireMinutes) { this.expireMinutes = expireMinutes; }
    }

    /** 脚本节点配置 */
    public static class Script {
        /** 是否允许进程内执行 Groovy/JavaScript 脚本，默认关闭 */
        private boolean enabled = false;
        /** 脚本超时（毫秒） */
        private long timeoutMs = 5000;

        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public long getTimeoutMs() { return timeoutMs; }
        public void setTimeoutMs(long timeoutMs) { this.timeoutMs = timeoutMs; }
    }
}
