package com.cloudflow.hr.config;

import com.cloudflow.hr.service.DeptPostSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 部门岗位数据同步初始化器
 * 
 * 在应用启动时执行全量数据同步
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeptPostSyncInitializer implements ApplicationRunner {

    private final DeptPostSyncService deptPostSyncService;

    @Override
    public void run(ApplicationArguments args) {
        log.info("=== HR服务启动：开始初始化部门岗位数据 ===");
        
        try {
            // 同步部门数据
            log.info("正在同步部门数据...");
            deptPostSyncService.syncDepartments();
            log.info("部门数据同步完成");
            
            // 同步岗位数据
            log.info("正在同步岗位数据...");
            deptPostSyncService.syncPosts();
            log.info("岗位数据同步完成");
            
            log.info("=== HR服务启动：部门岗位数据初始化完成 ===");
            
        } catch (Exception e) {
            log.error("=== HR服务启动：部门岗位数据初始化失败 ===", e);
            // 不抛出异常，允许服务继续启动
            // 后续可以通过定时任务重新同步
        }
    }
}
