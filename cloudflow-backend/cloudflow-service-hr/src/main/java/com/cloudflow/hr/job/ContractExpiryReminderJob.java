package com.cloudflow.hr.job;

import com.cloudflow.hr.domain.vo.EmployeeContractVO;
import com.cloudflow.hr.service.EmployeeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 合同到期提醒定时任务
 * 每天凌晨1点执行，检查30天内到期的合同并发送提醒
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ContractExpiryReminderJob {
    
    private final EmployeeService employeeService;
    
    /**
     * 合同到期提醒任务
     * 每天凌晨1点执行
     */
    @Scheduled(cron = "0 0 1 * * ?")
    public void checkExpiringContracts() {
        log.info("开始执行合同到期提醒任务");
        
        try {
            // 查询30天内到期的合同
            List<EmployeeContractVO> expiringContracts = employeeService.listExpiringContracts(30);
            
            if (expiringContracts.isEmpty()) {
                log.info("没有即将到期的合同");
                return;
            }
            
            log.info("发现 {} 份即将到期的合同", expiringContracts.size());
            
            // 遍历合同，发送提醒
            for (EmployeeContractVO contract : expiringContracts) {
                try {
                    sendExpiryReminder(contract);
                } catch (Exception e) {
                    log.error("发送合同到期提醒失败，合同ID：{}，员工：{}", 
                            contract.getId(), contract.getEmployeeName(), e);
                }
            }
            
            log.info("合同到期提醒任务执行完成，共处理 {} 份合同", expiringContracts.size());
            
        } catch (Exception e) {
            log.error("合同到期提醒任务执行失败", e);
        }
    }
    
    /**
     * 发送合同到期提醒
     * 
     * @param contract 合同信息
     */
    private void sendExpiryReminder(EmployeeContractVO contract) {
        log.info("发送合同到期提醒 - 员工：{}，工号：{}，合同编号：{}，到期日期：{}，剩余天数：{}", 
                contract.getEmployeeName(), 
                contract.getEmployeeNo(), 
                contract.getContractNo(), 
                contract.getEndDate(), 
                contract.getRemainingDays());
        
        // TODO: 实现具体的提醒逻辑
        // 1. 发送站内消息
        // 2. 发送邮件通知
        // 3. 发送企业微信/钉钉通知
        // 4. 记录提醒日志
        
        // 示例：构建提醒消息
        String message = String.format(
                "【合同到期提醒】员工 %s（工号：%s）的合同将于 %s 到期（剩余 %d 天），请及时办理续签手续。合同编号：%s",
                contract.getEmployeeName(),
                contract.getEmployeeNo(),
                contract.getEndDate(),
                contract.getRemainingDays(),
                contract.getContractNo()
        );
        
        log.info("提醒消息：{}", message);
        
        // 这里可以调用消息服务发送通知
        // messageService.sendNotification(contract.getEmployeeId(), message);
    }
}
