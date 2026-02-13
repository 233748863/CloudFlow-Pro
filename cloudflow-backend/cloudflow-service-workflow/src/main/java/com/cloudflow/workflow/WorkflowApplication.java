package com.cloudflow.workflow;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication(scanBasePackages = "com.cloudflow", exclude = DataSourceAutoConfiguration.class)
@EnableAsync
@EnableScheduling
@MapperScan("com.cloudflow.workflow.mapper")
public class WorkflowApplication {
    public static void main(String[] args) {
        SpringApplication.run(WorkflowApplication.class, args);
        System.out.println("\n" +
            "  ╔═══════════════════════════════════════════════════════╗\n" +
            "  ║                                                       ║\n" +
            "  ║   ٩(◕‿◕｡)۶  Workflow 工作流服务启动成功!                  ║\n" +
            "  ║                                                       ║\n" +
            "  ║   ⚙ 流程引擎已启动，智能调度蓄势待发 ⚙                      ║\n" +
            "  ║                                                       ║\n" +
            "  ╚═══════════════════════════════════════════════════════╝\n");
    }
}
