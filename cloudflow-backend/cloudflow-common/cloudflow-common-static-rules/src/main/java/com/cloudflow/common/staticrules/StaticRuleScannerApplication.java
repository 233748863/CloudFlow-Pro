package com.cloudflow.common.staticrules;

import java.nio.file.Path;

/**
 * 静态规则扫描器入口。
 */
public final class StaticRuleScannerApplication {

    private StaticRuleScannerApplication() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(System.getProperty("cloudflow.staticRules.root", System.getProperty("user.dir")));
        StaticRuleScanner scanner = new StaticRuleScanner(root);
        scanner.scan();
    }
}
