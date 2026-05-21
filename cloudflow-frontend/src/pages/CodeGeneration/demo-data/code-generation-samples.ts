
export const BACKEND_SOURCE = {
  sql: `-- ===================================================================
-- CloudFlow Pro V2.0 数据库脚本
-- 集成: RBAC, Workflow, Dynamic Form, Org Structure, Delegation
-- ===================================================================

CREATE DATABASE IF NOT EXISTS cloud_flow_db;
USE cloud_flow_db;

-- 1. 动态表单定义表
CREATE TABLE sys_form_def (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  schema_json JSON NOT NULL COMMENT '表单结构定义',
  version INT DEFAULT 1,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 动态表单实例数据表
CREATE TABLE sys_form_data (
  id VARCHAR(64) PRIMARY KEY,
  form_id VARCHAR(64) NOT NULL,
  instance_id VARCHAR(64) NOT NULL COMMENT '关联流程实例',
  data_json JSON NOT NULL COMMENT '实际填写的业务数据',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 组织架构表
CREATE TABLE sys_dept (
  id BIGINT PRIMARY KEY,
  parent_id BIGINT DEFAULT 0,
  dept_name VARCHAR(100),
  leader_id BIGINT COMMENT '部门负责人ID',
  ancestors VARCHAR(200) COMMENT '祖级列表'
);

-- 4. 任务委托表 (Delegation)
CREATE TABLE wf_delegation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  owner_id BIGINT NOT NULL COMMENT '原审批人',
  delegate_id BIGINT NOT NULL COMMENT '受托人',
  start_time DATETIME NOT NULL,
  end_time DATETIME NOT NULL,
  status INT DEFAULT 1 COMMENT '1有效 0失效'
);

-- 5. 核心任务表 (增加SLA字段)
CREATE TABLE wf_task (
  id VARCHAR(64) PRIMARY KEY,
  instance_id VARCHAR(64) NOT NULL,
  node_name VARCHAR(50),
  assignee_id BIGINT,
  due_date DATETIME COMMENT 'SLA截止时间',
  status VARCHAR(20) DEFAULT 'PENDING'
);
`,

  java_workflow: `package com.cloudflow.service;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import javax.annotation.Resource;
import java.time.LocalDateTime;

// ==========================================
// 1. Redis 事件发布者 (WorkflowService)
// ==========================================
@Service
public class WorkflowServiceImpl {

    @Resource
    private StringRedisTemplate redisTemplate;

    @Resource
    private ChannelTopic taskEventTopic; // Topic: "cloudflow.task.events"

    public void createTask(Task task) {
        // 保存任务到 DB...
        taskRepository.save(task);

        // 如果配置了 SLA，计算超时时间并发布事件
        if (task.getSlaHours() > 0) {
            LocalDateTime dueDate = LocalDateTime.now().plusHours(task.getSlaHours());
            
            // 方式A: 发送 Pub/Sub 消息，由消费者放入延迟队列
            String message = "TASK_CREATED:" + task.getId() + ":" + task.getSlaHours();
            redisTemplate.convertAndSend(taskEventTopic.getTopic(), message);
            
            // 方式B: 直接设置 Redis Key 过期通知 (Shadow Key)
            // redisTemplate.opsForValue().set("monitor:task:" + task.getId(), "", task.getSlaHours(), TimeUnit.HOURS);
        }
    }
}

// ==========================================
// 2. Redis 监听配置
// ==========================================
@Configuration
public class RedisConfig {
    @Bean
    RedisMessageListenerContainer container(RedisConnectionFactory connectionFactory,
                                            MessageListenerAdapter listenerAdapter) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(listenerAdapter, new ChannelTopic("cloudflow.task.events"));
        return container;
    }
}

// ==========================================
// 3. 任务事件监听器 (消费者)
// ==========================================
@Component
public class TaskEventListener {

    public void handleMessage(String message) {
        // 解析消息 "TASK_CREATED:1001:24"
        String[] parts = message.split(":");
        if ("TASK_CREATED".equals(parts[0])) {
             String taskId = parts[1];
             long hours = Long.parseLong(parts[2]);
             
             // 将任务加入 Redis ZSet 延迟队列
             // ZADD task_delays timestamp taskId
             redisTemplate.opsForZSet().add("sys:task:timeouts", taskId, System.currentTimeMillis() + hours * 3600000);
        }
    }
}

// ==========================================
// 4. 超时扫描 Job (处理 SLA)
// ==========================================
@Component
public class SLAMonitorJob {

    @Scheduled(fixedRate = 60000) // 每分钟扫描
    public void checkTimeouts() {
        // 从 ZSet 获取已过期的任务
        Set<String> taskIds = redisTemplate.opsForZSet().rangeByScore("sys:task:timeouts", 0, System.currentTimeMillis());
        
        for (String taskId : taskIds) {
            // 执行自动通过或自动驳回
            workflowService.autoProcessTask(taskId);
            
            // 移除队列
            redisTemplate.opsForZSet().remove("sys:task:timeouts", taskId);
        }
    }
}
`,
  pom: `...`,
  bootstrap: `...`
};
