package com.cloudflow.workflow.config.properties;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;

@Component
@RefreshScope
@ConfigurationProperties(prefix = "cloudflow.workflow")
public class WorkflowProperties {

    private Stream stream = new Stream();
    private Engine engine = new Engine();
    private Recall recall = new Recall();

    public Stream getStream() {
        return stream;
    }

    public void setStream(Stream stream) {
        this.stream = stream;
    }

    public Engine getEngine() {
        return engine;
    }

    public void setEngine(Engine engine) {
        this.engine = engine;
    }

    public Recall getRecall() {
        return recall;
    }

    public void setRecall(Recall recall) {
        this.recall = recall;
    }

    /**
     * Redis Stream 配置
     */
    public static class Stream {
        private String key = "workflow:stream:timeout";
        private String group = "group:workflow:engine";

        public String getKey() {
            return key;
        }

        public void setKey(String key) {
            this.key = key;
        }

        public String getGroup() {
            return group;
        }

        public void setGroup(String group) {
            this.group = group;
        }
    }

    /**
     * 流程引擎配置
     */
    public static class Engine {
        /**
         * 流程深度限制，防止循环流程导致堆栈溢出
         * 默认值：500
         */
        private int maxDepth = 500;

        public int getMaxDepth() {
            return maxDepth;
        }

        public void setMaxDepth(int maxDepth) {
            this.maxDepth = maxDepth;
        }
    }

    /**
     * 流程撤回配置
     */
    public static class Recall {
        /**
         * 撤回时间窗口（小时），超过此时间后不允许撤回
         * 默认值：24小时
         * 设置为 0 表示不限制
         */
        private int timeoutHours = 24;

        public int getTimeoutHours() {
            return timeoutHours;
        }

        public void setTimeoutHours(int timeoutHours) {
            this.timeoutHours = timeoutHours;
        }
    }
}
