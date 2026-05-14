package com.cloudflow.workflow.config;

import com.cloudflow.workflow.config.properties.WorkflowProperties;
import groovy.transform.TimedInterrupt;
import org.codehaus.groovy.ast.expr.ClosureExpression;
import org.codehaus.groovy.ast.expr.MethodPointerExpression;
import org.codehaus.groovy.ast.expr.MethodReferenceExpression;
import org.codehaus.groovy.ast.expr.TernaryExpression;
import org.codehaus.groovy.ast.stmt.ForStatement;
import org.codehaus.groovy.ast.stmt.WhileStatement;
import org.codehaus.groovy.control.CompilerConfiguration;
import org.codehaus.groovy.control.customizers.ASTTransformationCustomizer;
import org.codehaus.groovy.control.customizers.ImportCustomizer;
import org.codehaus.groovy.control.customizers.SecureASTCustomizer;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Component
public class GroovySandboxConfig {

    private final WorkflowProperties workflowProperties;

    public GroovySandboxConfig(WorkflowProperties workflowProperties) {
        this.workflowProperties = workflowProperties;
    }

    public CompilerConfiguration buildCompilerConfiguration() {
        SecureASTCustomizer secure = new SecureASTCustomizer();
        secure.setClosuresAllowed(false);
        secure.setMethodDefinitionAllowed(false);
        secure.setPackageAllowed(false);
        secure.setIndirectImportCheckEnabled(true);
        secure.setImportsWhitelist(List.of(
                "java.lang.Math",
                "java.math.BigDecimal",
                "java.time.LocalDate",
                "java.time.LocalDateTime",
                "java.time.LocalTime"
        ));
        secure.setStarImportsWhitelist(Collections.emptyList());
        secure.setStaticImportsWhitelist(Collections.emptyList());
        secure.setStaticStarImportsWhitelist(Collections.emptyList());
        secure.setReceiversBlackList(List.of(
                System.class.getName(),
                Runtime.class.getName(),
                ProcessBuilder.class.getName(),
                Thread.class.getName(),
                ClassLoader.class.getName(),
                File.class.getName()
        ));
        secure.setExpressionsBlacklist(List.of(
                ClosureExpression.class,
                MethodPointerExpression.class,
                MethodReferenceExpression.class,
                TernaryExpression.class
        ));
        secure.setStatementsBlacklist(List.of(
                ForStatement.class,
                WhileStatement.class
        ));

        ImportCustomizer imports = new ImportCustomizer();
        CompilerConfiguration configuration = new CompilerConfiguration();
        configuration.addCompilationCustomizers(
                secure,
                imports,
                new ASTTransformationCustomizer(
                        Map.of(
                                "value", workflowProperties.getScript().getTimeoutMs(),
                                "unit", TimeUnit.MILLISECONDS,
                                "thrown", java.util.concurrent.TimeoutException.class
                        ),
                        TimedInterrupt.class
                )
        );
        return configuration;
    }
}
