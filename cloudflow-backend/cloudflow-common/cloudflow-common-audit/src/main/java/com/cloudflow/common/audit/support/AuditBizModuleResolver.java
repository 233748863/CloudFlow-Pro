package com.cloudflow.common.audit.support;

/**
 * Resolves audit business module from the target service class.
 */
public class AuditBizModuleResolver {

    public String resolve(Class<?> sourceClass) {
        if (sourceClass == null) {
            return "system";
        }
        String className = sourceClass.getName();
        if (className.startsWith("com.cloudflow.auth.")) {
            return "auth";
        }
        if (className.startsWith("com.cloudflow.workflow.")) {
            return "workflow";
        }
        if (className.startsWith("com.cloudflow.oa.")) {
            return "oa";
        }
        if (className.startsWith("com.cloudflow.crm.")) {
            return "crm";
        }
        if (className.startsWith("com.cloudflow.hr.")) {
            return "hr";
        }
        return "system";
    }
}
