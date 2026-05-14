package com.cloudflow.workflow.service;

import com.cloudflow.workflow.config.GroovySandboxConfig;
import com.cloudflow.workflow.exception.WorkflowException;
import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 脚本执行服务
 * 支持执行 Groovy 脚本
 */
@Service
public class ScriptExecutionService {
    
    private static final Logger log = LoggerFactory.getLogger(ScriptExecutionService.class);

    private final ScriptExecutionPolicy scriptExecutionPolicy;
    private final GroovySandboxConfig groovySandboxConfig;

    public ScriptExecutionService(ScriptExecutionPolicy scriptExecutionPolicy, GroovySandboxConfig groovySandboxConfig) {
        this.scriptExecutionPolicy = scriptExecutionPolicy;
        this.groovySandboxConfig = groovySandboxConfig;
    }
    
    /**
     * 执行 Groovy 脚本
     * 
     * @param scriptContent 脚本内容
     * @param variables 变量上下文
     * @return 脚本执行结果
     */
    public Object executeGroovyScript(String scriptContent, Map<String, Object> variables) {
        try {
            scriptExecutionPolicy.assertInProcessScriptAllowed("GROOVY");
            log.info("[executeGroovyScript] 开始执行 Groovy 脚本");
            
            // 创建绑定上下文
            Binding binding = new Binding();
            if (variables != null) {
                variables.forEach(binding::setVariable);
            }
            
            CompilerConfiguration configuration = groovySandboxConfig.buildCompilerConfiguration();
            GroovyShell shell = new GroovyShell(binding, configuration);
            
            // 执行脚本
            Object result = shell.evaluate(scriptContent);
            
            log.info("[executeGroovyScript] Groovy 脚本执行成功");
            return result;
            
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            if (e instanceof java.util.concurrent.TimeoutException
                    || e.getCause() instanceof java.util.concurrent.TimeoutException) {
                log.warn("[executeGroovyScript] Groovy 脚本执行超时: {}", e.getMessage(), e);
                throw scriptExecutionPolicy.buildTimeoutException(e);
            }
            log.error("[executeGroovyScript] Groovy 脚本执行失败: {}", e.getMessage(), e);
            throw new WorkflowException("SCRIPT_EXECUTION_FAILED", "Groovy 脚本执行失败: " + e.getMessage(), e);
        }
    }
    
    /**
     * 执行 JavaScript 脚本（使用 Nashorn 或 GraalVM）
     * 注意：Java 15+ 已移除 Nashorn，建议使用 GraalVM
     * 
     * @param scriptContent 脚本内容
     * @param variables 变量上下文
     * @return 脚本执行结果
     */
    public Object executeJavaScript(String scriptContent, Map<String, Object> variables) {
        try {
            scriptExecutionPolicy.assertInProcessScriptAllowed("JAVASCRIPT");
            log.info("[executeJavaScript] JavaScript 执行暂未实现");
            log.warn("[executeJavaScript] 建议使用 GraalVM 或外部 Node.js 进程执行 JavaScript");
            throw new UnsupportedOperationException("JavaScript 执行暂未实现，建议使用 Groovy 或 API 调用");
            
        } catch (WorkflowException e) {
            throw e;
        } catch (Exception e) {
            log.error("[executeJavaScript] JavaScript 执行失败: {}", e.getMessage(), e);
            throw new WorkflowException("SCRIPT_EXECUTION_FAILED", "JavaScript 执行失败: " + e.getMessage(), e);
        }
    }
}
