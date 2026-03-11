package com.cloudflow.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * CloudFlow 数据库迁移入口。
 *
 * 设计说明：
 * 1. 当前项目的 auth / workflow / oa 共享同一个 MySQL 库；
 * 2. Flyway 不能分别挂在三个服务里，否则会出现迁移脚本可见性不一致；
 * 3. 因此这里采用独立迁移模块，专门负责接管未来增量 SQL。
 *
 * 使用示例：
 * mvn -pl cloudflow-db-migration exec:java -Ddb.url=jdbc:mysql://127.0.0.1:3306/cloud_flow_db -Ddb.username=root -Ddb.password=123456
 */
public final class FlywayMigrationRunner {

    private static final String DEFAULT_DB_URL =
        "jdbc:mysql://127.0.0.1:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=false&serverTimezone=GMT%2B8&allowPublicKeyRetrieval=true";
    private static final String DEFAULT_DB_USERNAME = "root";
    private static final String DEFAULT_DB_PASSWORD = "";
    private static final String DEFAULT_BASELINE_VERSION = "1";

    private FlywayMigrationRunner() {
    }

    public static void main(String[] args) {
        String dbUrl = readSetting("db.url", "DB_URL", DEFAULT_DB_URL);
        String dbUsername = readSetting("db.username", "DB_USERNAME", DEFAULT_DB_USERNAME);
        String dbPassword = readSetting("db.password", "DB_PASSWORD", DEFAULT_DB_PASSWORD);
        String locations = readSetting("flyway.locations", "FLYWAY_LOCATIONS", resolveMigrationLocation());
        String baselineVersion = readSetting("flyway.baselineVersion", "FLYWAY_BASELINE_VERSION", DEFAULT_BASELINE_VERSION);

        System.out.println("[Flyway] 开始执行数据库迁移");
        System.out.println("[Flyway] 数据源: " + dbUrl);
        System.out.println("[Flyway] 脚本位置: " + locations);

        Flyway flyway = Flyway.configure()
            .dataSource(dbUrl, dbUsername, dbPassword)
            .locations(locations)
            .table("flyway_schema_history")
            .baselineOnMigrate(true)
            .baselineVersion(baselineVersion)
            .baselineDescription("CloudFlow legacy schema baseline")
            .load();

        MigrateResult result = flyway.migrate();

        System.out.println("[Flyway] 迁移完成，执行脚本数: " + result.migrationsExecuted);
        System.out.println("[Flyway] 当前版本: " + (result.targetSchemaVersion == null ? "<none>" : result.targetSchemaVersion));
    }

    private static String readSetting(String propertyKey, String envKey, String defaultValue) {
        String systemValue = System.getProperty(propertyKey);
        if (systemValue != null && !systemValue.isBlank()) {
            return systemValue.trim();
        }

        String envValue = System.getenv(envKey);
        if (envValue != null && !envValue.isBlank()) {
            return envValue.trim();
        }

        return defaultValue;
    }

    private static String resolveMigrationLocation() {
        Path currentDir = Paths.get("").toAbsolutePath().normalize();

        // 兼容从 backend 根目录和 migration 模块目录两种运行方式。
        Path[] candidates = new Path[] {
            currentDir.resolve("DB").resolve("migration"),
            currentDir.resolve("..").resolve("DB").resolve("migration").normalize()
        };

        for (Path candidate : candidates) {
            if (Files.exists(candidate)) {
                return "filesystem:" + candidate;
            }
        }

        return "filesystem:" + candidates[0];
    }
}
