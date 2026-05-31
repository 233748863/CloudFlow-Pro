package com.cloudflow.archunit;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;

/**
 * M0-7: ArchUnit 架构规则测试。
 * <p>
 * 规则 1：Controller 写接口必须 @RepeatSubmit 或显式豁免。
 * 规则 2：ServiceImpl update*/delete* 必须 @Auditable。
 */
class CloudFlowArchitectureTest {

    private static JavaClasses classes;

    @BeforeAll
    static void setup() {
        // 扫描所有业务模块（排除测试类）
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("com.cloudflow");
    }

    @Test
    void controllerWriteMethodsShouldHaveRepeatSubmit() {
        ArchRule rule = methods()
                .that().areDeclaredInClassesThat().haveSimpleNameEndingWith("Controller")
                .and().areAnnotatedWith("org.springframework.web.bind.annotation.PostMapping")
                .and().haveNameMatching("(add|submit|approve|reject|publish|cancel|convert|receive|handover).*")
                .should().beAnnotatedWith("com.cloudflow.common.idempotent.annotation.RepeatSubmit")
                .orShould().beAnnotatedWith("com.cloudflow.common.idempotent.annotation.RepeatSubmit.Disabled")
                .because("写接口必须防重复提交（M0-7 规则 1）");

        rule.check(classes);
    }

    @Test
    void serviceImplUpdateDeleteMethodsShouldHaveAuditable() {
        ArchRule rule = methods()
                .that().areDeclaredInClassesThat().haveSimpleNameEndingWith("ServiceImpl")
                .and().haveNameMatching("(update|delete).*")
                .and().arePublic()
                .should().beAnnotatedWith("com.cloudflow.common.audit.annotation.Audit")
                .because("ServiceImpl update*/delete* 必须落审计（M0-7 规则 2）");

        rule.check(classes);
    }
}
