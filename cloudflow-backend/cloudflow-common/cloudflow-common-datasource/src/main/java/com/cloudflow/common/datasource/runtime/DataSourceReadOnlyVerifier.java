package com.cloudflow.common.datasource.runtime;

import java.sql.Connection;
import java.sql.SQLException;

public interface DataSourceReadOnlyVerifier {
    void verify(Connection connection, String database) throws SQLException;
}
