package com.cloudflow.common.datasource.runtime;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;

@Component
public final class MysqlDataSourceReadOnlyVerifier implements DataSourceReadOnlyVerifier {
    private static final int MAX_GRANTS = 256;
    private static final int MAX_GRANT_LENGTH = 16384;
    private static final int MAX_ROLES = 64;

    @Override
    public void verify(Connection connection, String database) throws SQLException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        try {
            if (connection == null || database == null || !database.matches("[A-Za-z0-9_]{1,64}")
                    || !"MySQL".equals(connection.getMetaData().getDatabaseProductName())
                    || connection.getMetaData().getDatabaseMajorVersion() < 8) {
                throw unverified();
            }
            String principal;
            boolean roleMetadataPresent;
            try (Statement statement = connection.createStatement()) {
                statement.setQueryTimeout(remainingSeconds(deadline));
                statement.setMaxRows(2);
                try (ResultSet result = statement.executeQuery("SELECT DATABASE(), CURRENT_USER(), CURRENT_ROLE(), @@GLOBAL.mandatory_roles")) {
                    if (!result.next() || !database.equals(result.getString(1))) throw unverified();
                    principal = result.getString(2);
                    String activeRoles = result.getString(3);
                    String mandatoryRoles = result.getString(4);
                    requireAccount(principal, activeRoles, mandatoryRoles);
                    roleMetadataPresent = !"NONE".equals(activeRoles) || !mandatoryRoles.isBlank();
                    if (result.next()) throw unverified();
                }
            }
            GrantSet direct;
            try (Statement statement = connection.createStatement()) {
                statement.setQueryTimeout(remainingSeconds(deadline));
                statement.setMaxRows(MAX_GRANTS + 1);
                try (ResultSet result = statement.executeQuery("SHOW GRANTS FOR CURRENT_USER")) {
                    direct = readGrants(result, principal, deadline);
                }
            }
            if (roleMetadataPresent && direct.roles().isEmpty()) throw rolesUnverified();
            boolean canRead = verifyPrivileges(direct.privileges(), principal);
            for (RoleAccount role : direct.roles()) {
                try (PreparedStatement statement = connection.prepareStatement("SHOW GRANTS FOR CURRENT_USER USING ?@?")) {
                    statement.setQueryTimeout(remainingSeconds(deadline));
                    statement.setMaxRows(MAX_GRANTS + 1);
                    statement.setString(1, role.username());
                    statement.setString(2, role.hostname());
                    try (ResultSet result = statement.executeQuery()) {
                        GrantSet expanded = readGrants(result, principal, deadline);
                        if (!expanded.roles().equals(direct.roles())) throw rolesUnverified();
                        canRead |= verifyPrivileges(expanded.privileges(), principal);
                    }
                }
            }
            remainingSeconds(deadline);
            requireRead(canRead);
        } catch (SQLTimeoutException failure) {
            throw new DataSourceFailure("ACCOUNT_VERIFICATION_TIMEOUT", "只读账号权限核验超时，未启用连接池", 503);
        } catch (SQLException failure) {
            throw new DataSourceFailure("ACCOUNT_VERIFICATION_FAILED", "无法读取完整账号权限清单，未启用连接池", 503);
        }
    }

    static void requireAccount(String principal, String activeRoles, String mandatoryRoles) {
        if (principal == null || !principal.matches("[A-Za-z0-9_-]{1,32}@[^\\r\\n]{1,255}")
                || principal.regionMatches(true, 0, "root@", 0, 5)) throw unverified();
        if (activeRoles == null || activeRoles.isBlank() || mandatoryRoles == null) throw rolesUnverified();
    }

    static void verifyGrants(List<String> grants, String principal) {
        requireRead(verifyPrivileges(grants, principal));
    }

    private static boolean verifyPrivileges(List<String> grants, String principal) {
        if (grants == null || grants.size() > MAX_GRANTS || principal == null) throw unverified();
        boolean canRead = false;
        for (String grant : grants) {
            GrantReader reader = new GrantReader(grant);
            reader.word("GRANT");
            if (reader.quoted()) throw rolesUnverified();
            boolean usage = false;
            boolean columns = false;
            int privilegeCount = 0;
            do {
                privilegeCount++;
                if (reader.takeWord("USAGE")) {
                    usage = true;
                } else if (reader.takeWord("SELECT")) {
                    canRead = true;
                    if (reader.take('(')) {
                        columns = true;
                        do { reader.identifier(); } while (reader.take(','));
                        reader.symbol(')');
                    }
                } else if (reader.takeWord("SHOW")) {
                    reader.word("VIEW");
                } else {
                    throw new DataSourceFailure("ACCOUNT_NOT_READ_ONLY", "数据库账号含写入、执行、转授权或管理权限，拒绝启用", 400);
                }
            } while (reader.take(','));
            reader.word("ON");
            boolean allSchemas = reader.take('*');
            if (!allSchemas) reader.identifier();
            reader.symbol('.');
            boolean allTables = reader.take('*');
            if (!allTables) reader.identifier();
            if (allSchemas && !allTables || usage && (!allSchemas || !allTables || privilegeCount != 1)
                    || columns && (allSchemas || allTables)) throw unverified();
            reader.word("TO");
            String username = reader.identifier();
            reader.symbol('@');
            String hostname = reader.identifier();
            if (!principal.equals(username + "@" + hostname)) throw unverified();
            if (!reader.finished()) {
                throw new DataSourceFailure("ACCOUNT_NOT_READ_ONLY", "账号含额外授权选项或无法确认的权限，拒绝启用", 400);
            }
        }
        return canRead;
    }

    private static void requireRead(boolean canRead) {
        if (!canRead) throw new DataSourceFailure("ACCOUNT_READ_PERMISSION_MISSING", "专用账号缺少明确的读取权限，拒绝启用", 400);
    }

    private static GrantSet readGrants(ResultSet result, String principal, long deadline) throws SQLException {
        List<String> privileges = new ArrayList<>();
        Set<RoleAccount> roles = new LinkedHashSet<>();
        int rows = 0;
        while (result.next()) {
            remainingSeconds(deadline);
            if (++rows > MAX_GRANTS) throw unverified();
            String grant = result.getString(1);
            GrantReader reader = new GrantReader(grant);
            reader.word("GRANT");
            if (!reader.quoted()) {
                privileges.add(grant);
                continue;
            }
            do {
                String username = reader.identifier();
                reader.symbol('@');
                String hostname = reader.identifier();
                if (!roles.add(new RoleAccount(username, hostname)) || roles.size() > MAX_ROLES) throw rolesUnverified();
            } while (reader.take(','));
            reader.word("TO");
            String username = reader.identifier();
            reader.symbol('@');
            String hostname = reader.identifier();
            if (!principal.equals(username + "@" + hostname)) throw unverified();
            if (!reader.finished()) throw new DataSourceFailure("ACCOUNT_NOT_READ_ONLY", "账号具有角色转授权或额外管理选项，拒绝启用", 400);
        }
        if (rows == 0) throw unverified();
        return new GrantSet(privileges, roles);
    }

    private static int remainingSeconds(long deadline) {
        long remaining = deadline - System.nanoTime();
        if (remaining <= 0) throw new DataSourceFailure("ACCOUNT_VERIFICATION_TIMEOUT", "只读账号权限核验超时，未启用连接池", 503);
        return (int) Math.min(5, Math.max(1, (remaining + TimeUnit.SECONDS.toNanos(1) - 1) / TimeUnit.SECONDS.toNanos(1)));
    }

    private static DataSourceFailure unverified() {
        return new DataSourceFailure("ACCOUNT_PERMISSIONS_UNVERIFIED", "无法确认专用MySQL账号的完整只读权限，拒绝启用", 400);
    }

    private static DataSourceFailure rolesUnverified() {
        return new DataSourceFailure("ACCOUNT_ROLE_PERMISSIONS_UNVERIFIED", "无法完整确认账号的继承或强制角色权限，拒绝启用", 400);
    }

    private record RoleAccount(String username, String hostname) { }

    private record GrantSet(List<String> privileges, Set<RoleAccount> roles) { }

    private static final class GrantReader {
        private final String source;
        private int position;

        private GrantReader(String source) {
            if (source == null || source.isBlank() || source.length() > MAX_GRANT_LENGTH) throw unverified();
            this.source = source;
        }

        private boolean takeWord(String expected) {
            spaces();
            int end = position + expected.length();
            if (!source.startsWith(expected, position) || end < source.length()
                    && (Character.isLetterOrDigit(source.charAt(end)) || source.charAt(end) == '_')) return false;
            position = end;
            return true;
        }

        private void word(String expected) {
            if (!takeWord(expected)) throw unverified();
        }

        private boolean take(char symbol) {
            spaces();
            if (position == source.length() || source.charAt(position) != symbol) return false;
            position++;
            return true;
        }

        private void symbol(char symbol) {
            if (!take(symbol)) throw unverified();
        }

        private boolean quoted() {
            spaces();
            return position < source.length() && (source.charAt(position) == '`' || source.charAt(position) == '\'');
        }

        private String identifier() {
            if (!quoted()) throw unverified();
            char delimiter = source.charAt(position++);
            StringBuilder value = new StringBuilder();
            while (position < source.length()) {
                char next = source.charAt(position++);
                if (next != delimiter) {
                    if (Character.isISOControl(next)) throw unverified();
                    value.append(next);
                } else if (position < source.length() && source.charAt(position) == delimiter) {
                    position++;
                    value.append(delimiter);
                } else {
                    if (value.isEmpty()) throw unverified();
                    return value.toString();
                }
            }
            throw unverified();
        }

        private boolean finished() {
            spaces();
            return position == source.length();
        }

        private void spaces() {
            while (position < source.length() && source.charAt(position) == ' ') position++;
        }
    }
}
