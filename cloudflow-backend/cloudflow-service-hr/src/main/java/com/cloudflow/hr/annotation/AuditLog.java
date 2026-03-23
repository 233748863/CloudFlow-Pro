package com.cloudflow.hr.annotation;

import java.lang.annotation.*;

/**
 * 审计日志注解
 * 用于标记需要记录审计日志的方法
 * 
 * @author CloudFlow
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface AuditLog {
    
    /**
     * 操作类型：CREATE-创建 UPDATE-修改 DELETE-删除
     */
    String operationType();
    
    /**
     * 业务模块：EMPLOYEE-员工管理 ATTENDANCE-考勤管理 SALARY-薪酬管理 RECRUITMENT-招聘管理
     */
    String businessModule();
    
    /**
     * 业务类型：具体的业务实体类型
     */
    String businessType();
    
    /**
     * 操作描述
     */
    String description();
    
    /**
     * 是否记录变更前数据
     */
    boolean recordBefore() default false;
    
    /**
     * 是否记录变更后数据
     */
    boolean recordAfter() default true;
}
