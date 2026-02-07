package com.cloudflow.workflow.listener;

import org.springframework.stereotype.Component;
import org.springframework.context.event.EventListener;

@Component
public class TaskEventListener {

    // 这里可以监听任务创建、完成等事件，进行通知发送等后续处理
    // 目前仅作为占位符，后续可扩展
    
    public void onTaskCreated(String taskId) {
        System.out.println("任务已创建: " + taskId);
    }

    public void onTaskCompleted(String taskId) {
        System.out.println("任务已完成: " + taskId);
    }
}
