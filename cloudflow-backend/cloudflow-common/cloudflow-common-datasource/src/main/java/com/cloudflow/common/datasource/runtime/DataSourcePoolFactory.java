package com.cloudflow.common.datasource.runtime;

import com.cloudflow.common.datasource.domain.RuntimeDataSourceConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.Statement;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

@Component
public class DataSourcePoolFactory {
    private final DataSourceRuntimeProperties properties;
    private final DataSourceNetworkPolicy network;
    private final DataSourceSecretCipher cipher;
    private final ObjectProvider<DataSourceReadOnlyVerifier> accountVerifier;

    public DataSourcePoolFactory(DataSourceRuntimeProperties properties, DataSourceNetworkPolicy network,
            DataSourceSecretCipher cipher, ObjectProvider<DataSourceReadOnlyVerifier> accountVerifier) {
        this.properties = properties;
        this.network = network;
        this.cipher = cipher;
        this.accountVerifier = accountVerifier;
    }

    public boolean accountVerificationReady() { return accountVerifier.getIfAvailable() != null; }

    public void testVerified(RuntimeDataSourceConfig config) {
        try (HikariDataSource pool = createVerified(config)) {
            if (pool.isClosed()) throw new DataSourceFailure("CONNECTION_TEST_FAILED", "数据库连接测试失败", 503);
        }
    }

    public HikariDataSource createVerified(RuntimeDataSourceConfig config) {
        if (!properties.configured()) throw DataSourceFailure.disabled();
        DataSourceReadOnlyVerifier verifier = accountVerifier.getIfAvailable();
        if (verifier == null) throw new DataSourceFailure("ACCOUNT_VERIFICATION_UNAVAILABLE",
                "只读账号权限核验尚未启用，数据源连接操作已停用", 503);
        if (config == null || !"com.mysql.cj.jdbc.Driver".equals(config.getDriverClass())
                || !Integer.valueOf(0).equals(config.getInitSize()) || config.getMaxActive() == null
                || config.getMaxActive() < 1 || config.getMaxActive() > 20) {
            throw new DataSourceFailure("INVALID_POOL_CONFIG", "数据源驱动或连接池配置不符合安全约束", 400);
        }
        DataSourceNetworkPolicy.Endpoint endpoint = network.validate(config.getUrl(), config.getUsername());
        String password = cipher.decrypt(config.getPasswordEncrypted());
        HikariDataSource pool = new HikariDataSource();
        pool.setPoolName("runtime-ds-" + config.getConfigId() + "-v" + config.getVersion());
        pool.setDriverClassName("com.mysql.cj.jdbc.Driver");
        pool.setJdbcUrl(endpoint.pinnedUrl());
        pool.setUsername(config.getUsername());
        pool.setPassword(password);
        pool.setMinimumIdle(0);
        pool.setMaximumPoolSize(config.getMaxActive());
        pool.setInitializationFailTimeout(-1);
        pool.setConnectionTimeout(5000);
        pool.setValidationTimeout(5000);
        pool.setIdleTimeout(60000);
        pool.setMaxLifetime(1800000);
        pool.setReadOnly(true);
        pool.setRegisterMbeans(false);
        pool.addDataSourceProperty("connectTimeout", "5000");
        pool.addDataSourceProperty("socketTimeout", "5000");
        pool.addDataSourceProperty("allowLoadLocalInfile", "false");
        pool.addDataSourceProperty("allowUrlInLocalInfile", "false");
        pool.addDataSourceProperty("allowMultiQueries", "false");
        pool.addDataSourceProperty("autoDeserialize", "false");
        pool.addDataSourceProperty("allowPublicKeyRetrieval", "false");
        pool.addDataSourceProperty("paranoid", "true");
        try (Connection connection = pool.getConnection()) {
            verifier.verify(connection, endpoint.database());
            try (Statement statement = connection.createStatement()) {
                statement.setQueryTimeout(5);
                try (ResultSet result = statement.executeQuery("SELECT 1")) {
                    if (!result.next() || result.getInt(1) != 1 || result.next()) {
                        throw new DataSourceFailure("CONNECTION_TEST_FAILED", "数据库固定连接测试失败", 503);
                    }
                }
            }
            return pool;
        } catch (DataSourceFailure failure) {
            pool.close();
            throw failure;
        } catch (SQLException failure) {
            pool.close();
            if (failure instanceof SQLTimeoutException) throw new DataSourceFailure("CONNECTION_TIMEOUT", "数据库连接测试超时", 503);
            throw new DataSourceFailure("CONNECTION_FAILED", "数据库连接测试失败，请检查网络及专用账号", 503);
        } catch (RuntimeException failure) {
            pool.close();
            throw new DataSourceFailure("CONNECTION_TEST_FAILED", "数据库连接测试失败", 503);
        }
    }
}
