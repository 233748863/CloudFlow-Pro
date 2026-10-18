package com.cloudflow.auth.job;

import com.cloudflow.common.audit.service.AuditLogArchiveService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Actual archive service/job and MySQL transactions; tenant enumeration is controlled in a dedicated disposable schema. */
public final class AuditArchiveDatabaseChecks {
    private static int checks;
    private static HikariDataSource dataSource;
    private static LocalDateTime now;
    private static final List<String> COLUMNS=List.of("audit_id","tenant_id","biz_module","audit_name","audit_field",
            "before_val","after_val","before_json","after_json","diff_json","high_risk","risk_level","create_by","create_time");

    public static void main(String[] args) throws Exception {
        if(args.length!=3)throw new IllegalArgumentException("Owned JDBC, datadir and workspace required");
        String jdbc=args[0];
        if(!jdbc.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.*"))throw new IllegalArgumentException("Owned loopback database required");
        String schema="a3_audit_"+UUID.randomUUID().toString().replace("-","").substring(0,12);
        boolean created=false;
        try(Connection owner=DriverManager.getConnection(jdbc,"root","");Statement statement=owner.createStatement()) {
            try(ResultSet result=statement.executeQuery("SELECT @@datadir")){
                check(result.next()&&Path.of(result.getString(1)).toRealPath().equals(Path.of(args[1]).toRealPath()),"owned database datadir");
            }
            try(ResultSet result=statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db'")){
                check(result.next()&&result.getInt(1)==374,"original approved schema has 374 tables");
            }
            try {
                statement.execute("CREATE DATABASE %s CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci".formatted(schema));created=true;
                HikariConfig config=new HikariConfig();
                config.setJdbcUrl(jdbc.replace("/cloud_flow_db?","/"+schema+"?"));config.setUsername("root");config.setPassword("");
                config.setMaximumPoolSize(1);config.setMinimumIdle(1);config.setPoolName("owned-audit-verification");
                dataSource=new HikariDataSource(config);
                String formal=Files.readString(Path.of(args[2],"cloudflow-backend/DB/01.cloudflow-common.sql"));
                for(String table:List.of("sys_audit_log","sys_audit_archive_policy")){
                    Matcher ddl=Pattern.compile("(?s)CREATE TABLE "+table+" \\(.*?ENGINE=InnoDB.*?;").matcher(formal);
                    check(ddl.find(),"formal table definition "+table);execute(ddl.group());
                }
                for(String operation:List.of("delete","update")){
                    Matcher trigger=Pattern.compile("(?s)CREATE TRIGGER trg_sys_audit_log_no_"+operation+".*?END\\$\\$").matcher(formal);
                    check(trigger.find(),"formal immutable trigger "+operation);execute(trigger.group().replace("$$",""));
                }
                try(Connection connection=dataSource.getConnection();Statement query=connection.createStatement();ResultSet result=query.executeQuery("SELECT CURRENT_TIMESTAMP")){
                    check(result.next(),"database current time");now=result.getTimestamp(1).toLocalDateTime();
                }
                TenantContext.setTenantId(91L);UserContext.setTenantId(92L);
                boundaries(); identicalAndConflictingCopies(); continuation(); batchRollback(); removalFailure(); connectionFailures(); fixedCutoff();
                check(Objects.equals(TenantContext.getTenantId(),91L)&&Objects.equals(UserContext.getTenantId(),92L),"job restores both caller contexts");
                check(queryLong("SELECT COALESCE(@cloudflow_audit_archive_allow_delete,0)")==0,"archive delete exemption never leaks into pooled connection");
                check(queryLong("SELECT COUNT(*) FROM sys_audit_log WHERE audit_id IN (2,3,5,6,7,8)")==6,"excluded tenant module dates and inactive policy remain");
                System.out.println("AUDIT_ARCHIVE_DATABASE: checks="+checks+"; failed=0; real_job_service_mysql=true; tenant_enumeration_controlled=true; batch_rows=501; connection_faults_controlled=true; physical_abort_rollback_verified=true; fixed_cutoff_verified=true; original_schema=374; isolated_schema="+schema);
            } finally {
                TenantContext.clear();UserContext.clear();
                if(dataSource!=null)dataSource.close();
                if(created){
                    if(!schema.matches("a3_audit_[a-f0-9]{12}"))throw new IllegalStateException("Owned schema identity required");
                    statement.execute("DROP DATABASE %s".formatted(schema));
                    try(ResultSet result=statement.executeQuery("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='%s'".formatted(schema))){
                        check(result.next()&&result.getInt(1)==0,"owned schema removed");
                    }
                    System.out.println("AUDIT_ARCHIVE_DATABASE_RESTORED: own_schema_removed=true; original_schema_untouched=true; production_modified=false");
                }
            }
        }
    }

    private static void boundaries() throws Exception {
        policy(1,"one","cold_one","ACTIVE",1);policy(2,"inactive","cold_inactive","INACTIVE",1);policy(3,"zero","cold_zero","ACTIVE",0);
        row(1,10,"one",now.minusDays(2));row(2,10,"one",now);row(3,10,"one",null);row(4,20,"one",now.minusDays(2));
        row(5,30,"one",now.minusDays(2));row(6,10,"other",now.minusDays(2));row(7,10,"inactive",now.minusDays(2));row(8,10,"zero",now.minusDays(2));
        List<String> first=snapshot("sys_audit_log",1);List<String> second=snapshot("sys_audit_log",4);
        AuditLogArchiveService dry=new AuditLogArchiveService(dataSource,true);
        JobResult preview=job(dry,List.of(10L,20L)).archiveExpiredLogs();
        check(preview.getAffectedRows()==0&&preview.getResultMsg().equals("审计归档预演完成：候选2条，实际移出0条"),"dry run reports candidates with zero changes");
        check(queryLong("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")==2,"dry run creates no cold table");
        check(queryLong("SELECT COUNT(*) FROM sys_audit_log")==8,"dry run preserves all source rows");
        caught(dry::archiveExpiredLogsForCurrentTenant,"missing consistent tenant context rejected");
        TenantContext.clear();UserContext.setTenantId(null);caught(dry::archiveExpiredLogsForCurrentTenant,"absent tenant does not mean all tenants");
        TenantContext.setTenantId(91L);UserContext.setTenantId(92L);
        AuditLogArchiveService actual=new AuditLogArchiveService(dataSource,false);
        JobResult result=job(actual,List.of(10L,20L)).archiveExpiredLogs();
        check(result.getAffectedRows()==2&&result.getResultMsg().equals("审计归档完成：候选2条，新增2条，移出2条"),"two tenant real archive counts");
        check(first.equals(snapshot("cold_one",1))&&second.equals(snapshot("cold_one",4)),"all original columns preserved byte for byte including Unicode null and spaces");
        check(snapshot("sys_audit_log",1).isEmpty()&&snapshot("sys_audit_log",4).isEmpty(),"verified originals moved");
        check(job(actual,List.of(10L,20L)).archiveExpiredLogs().getAffectedRows()==0,"repeated archive is empty");
        check(job(dry,List.of()).archiveExpiredLogs().getResultMsg().equals("审计归档预演完成：候选0条，实际移出0条"),"empty tenant preview");
    }

    private static void identicalAndConflictingCopies() throws Exception {
        row(9,10,"one",now.minusDays(2));execute("INSERT INTO cold_one SELECT * FROM sys_audit_log WHERE audit_id=9");
        AuditLogArchiveService.ArchiveResult same=archive(10);
        check(same.getInserted()==0&&same.getDeleted()==1&&same.getCandidates()==1,"existing identical copy safely moves original without inserting duplicate");
        List<String> fields=COLUMNS.subList(1,COLUMNS.size());
        for(int index=0;index<fields.size();index++){
            long id=100+index;String column=fields.get(index);row(id,10,"one",now.minusDays(2));
            List<String> source=snapshot("sys_audit_log",id);
            execute("INSERT INTO cold_one SELECT * FROM sys_audit_log WHERE audit_id=?",id);
            Object changed=switch(column){case "tenant_id"->20L;case "high_risk"->0;case "create_time"->Timestamp.valueOf(now.minusDays(3));default->"conflicting-copy";};
            execute("UPDATE cold_one SET %s=? WHERE audit_id=?".formatted(column),changed,id);
            List<String> conflicting=snapshot("cold_one",id);
            RuntimeException failure=caught(()->archive(10),"conflicting "+column+" prevents source deletion");
            check(contains(failure,"审计归档副本不完整或内容冲突"),"real copy mismatch reported for "+column);
            check(source.equals(snapshot("sys_audit_log",id))&&conflicting.equals(snapshot("cold_one",id)),"source and conflicting copy unchanged for "+column);
            execute("DELETE FROM cold_one WHERE audit_id=?",id);
            check(archive(10).getDeleted()==1&&source.equals(snapshot("cold_one",id)),"repair copies original "+column);
        }
        for(int index=0;index<2;index++){
            long id=150+index;row(id,10,"one",now.minusDays(2));execute("INSERT INTO cold_one SELECT * FROM sys_audit_log WHERE audit_id=?",id);
            execute("UPDATE cold_one SET audit_name=? WHERE audit_id=?",index==0?"case-"+id:"Case-"+id+" ",id);
            caught(()->archive(10),"case or trailing space mismatch is not silently ignored");
            check(!snapshot("sys_audit_log",id).isEmpty(),"binary mismatch retains original");execute("DELETE FROM cold_one WHERE audit_id=?",id);archive(10);
        }
    }

    private static void continuation() throws Exception {
        policy(4,"two","cold_two","ACTIVE",1);
        row(200,10,"one",now.minusDays(2));row(201,10,"two",now.minusDays(2));row(202,20,"one",now.minusDays(2));
        execute("INSERT INTO cold_one SELECT * FROM sys_audit_log WHERE audit_id=200");execute("UPDATE cold_one SET after_val='wrong' WHERE audit_id=200");
        AuditLogArchiveJob job=job(new AuditLogArchiveService(dataSource,false),List.of(10L,20L));
        RuntimeException failure=caught(job::archiveExpiredLogs,"partial tenant failure must fail the overall job");
        check(failure.getSuppressed().length==1&&contains(failure,"审计归档副本不完整或内容冲突"),"job retains original nested policy error");
        check(!snapshot("sys_audit_log",200).isEmpty()&&snapshot("sys_audit_log",201).isEmpty()&&snapshot("sys_audit_log",202).isEmpty(),"later same-tenant policy and other tenant continue");
        check(!snapshot("cold_two",201).isEmpty()&&!snapshot("cold_one",202).isEmpty(),"continued archives actually committed");
        execute("DELETE FROM cold_one WHERE audit_id=200");check(job.archiveExpiredLogs().getAffectedRows()==1,"recovery moves only previously failed log");
        policy(5,"invalid","bad-table","ACTIVE",1);row(203,10,"invalid",now.minusDays(2));row(204,10,"two",now.minusDays(2));
        caught(job::archiveExpiredLogs,"invalid cold table is rejected without unsafe SQL");
        check(!snapshot("sys_audit_log",203).isEmpty()&&snapshot("sys_audit_log",204).isEmpty(),"invalid policy preserves its row while valid policy continues");
        execute("UPDATE sys_audit_archive_policy SET archive_table='cold_invalid' WHERE id=5");check(job.archiveExpiredLogs().getAffectedRows()==1,"fixed policy recovers one row");
    }

    private static void batchRollback() throws Exception {
        for(long id=1000;id<=1500;id++)row(id,10,"one",now.minusDays(2));
        execute("INSERT INTO cold_one SELECT * FROM sys_audit_log WHERE audit_id=1500");execute("UPDATE cold_one SET before_val='late conflict' WHERE audit_id=1500");
        caught(()->archive(10),"second batch conflict rolls back the whole policy");
        check(queryLong("SELECT COUNT(*) FROM sys_audit_log WHERE audit_id BETWEEN 1000 AND 1500")==501,"all 501 original rows survive late failure");
        check(queryLong("SELECT COUNT(*) FROM cold_one WHERE audit_id BETWEEN 1000 AND 1500")==1,"first batch copies rolled back; only preexisting conflicting copy remains");
        execute("DELETE FROM cold_one WHERE audit_id=1500");AuditLogArchiveService.ArchiveResult result=archive(10);
        check(result.getInserted()==501&&result.getDeleted()==501,"recovery archives both batches accurately");
        check(queryLong("SELECT COUNT(*) FROM sys_audit_log WHERE audit_id BETWEEN 1000 AND 1500")==0&&queryLong("SELECT COUNT(*) FROM cold_one WHERE audit_id BETWEEN 1000 AND 1500")==501,"all recovered copies exist exactly once");
    }

    private static void removalFailure() throws Exception {
        row(2000,10,"one",now.minusDays(2));List<String> source=snapshot("sys_audit_log",2000);
        execute("CREATE TRIGGER own_archive_delete_failure BEFORE DELETE ON sys_audit_log FOR EACH ROW BEGIN IF OLD.audit_id=2000 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_DELETE_FAILURE'; END IF; END");
        RuntimeException failure=caught(()->archive(10),"real delete failure rolls back inserted copy");
        check(contains(failure,"OWNED_DELETE_FAILURE"),"real trigger failure retained");
        check(source.equals(snapshot("sys_audit_log",2000))&&snapshot("cold_one",2000).isEmpty(),"source and archive rollback together after delete failure");
        check(queryLong("SELECT COALESCE(@cloudflow_audit_archive_allow_delete,0)")==0,"delete allowance cleared after failure on same pooled connection");
        execute("DROP TRIGGER own_archive_delete_failure");
        try {execute("DELETE FROM sys_audit_log WHERE audit_id=2000");throw new AssertionError("immutable deletion unexpectedly permitted");}
        catch(SQLException exception){check(exception.getMessage().contains("ERR.AUDIT_IMMUTABLE"),"original immutable protection remains active");}
        check(archive(10).getDeleted()==1&&source.equals(snapshot("cold_one",2000)),"real deletion recovery completes one row");
    }

    private static void connectionFailures() throws Exception {
        for(String mode:List.of("reset","rollback")){
            long id=mode.equals("reset")?2100:2101;row(id,10,"one",now.minusDays(2));List<String> source=snapshot("sys_audit_log",id);
            if(mode.equals("rollback"))execute("CREATE TRIGGER own_archive_rollback_failure BEFORE DELETE ON sys_audit_log FOR EACH ROW BEGIN IF OLD.audit_id=2101 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_ROLLBACK_SOURCE_FAILURE'; END IF; END");
            ConnectionFault fault=new ConnectionFault(mode);
            RuntimeException failure=caught(()->TenantBroker.applyAs(10L,ignored->new AuditLogArchiveService(fault.source(),false).archiveExpiredLogsForCurrentTenant()),"connection "+mode+" failure is reported");
            check(fault.fired&&fault.aborted&&fault.unsafeAutoCommit==0,"faulted connection aborted without unsafe commit for "+mode);
            check(contains(failure,"OWNED_"+mode.toUpperCase()+"_FAILURE"),"connection failure retained for "+mode);
            check(source.equals(snapshot("sys_audit_log",id))&&snapshot("cold_one",id).isEmpty(),"physical abort rolls back original deletion and inserted copy for "+mode);
            check(queryLong("SELECT COALESCE(@cloudflow_audit_archive_allow_delete,0)")==0,"replacement connection has no delete exemption for "+mode);
            if(mode.equals("rollback"))execute("DROP TRIGGER own_archive_rollback_failure");
            check(archive(10).getDeleted()==1&&source.equals(snapshot("cold_one",id)),"connection failure recovery for "+mode);
        }
    }

    private static void fixedCutoff() throws Exception {
        LocalDateTime current;
        try(Connection connection=dataSource.getConnection();Statement statement=connection.createStatement();ResultSet result=statement.executeQuery("SELECT CURRENT_TIMESTAMP")){
            if(!result.next())throw new IllegalStateException("Database time required");current=result.getTimestamp(1).toLocalDateTime();
        }
        row(2200,10,"one",current.minusDays(1).plusSeconds(2));
        ConnectionFault delay=new ConnectionFault("delay");
        AuditLogArchiveService.ArchiveResult result=TenantBroker.applyAs(10L,ignored->new AuditLogArchiveService(delay.source(),false).archiveExpiredLogsForCurrentTenant());
        check(delay.fired&&result.getDeleted()==0&&!snapshot("sys_audit_log",2200).isEmpty(),"crossing retention boundary during scan cannot expand the fixed scope");
        check(archive(10).getDeleted()==1,"newly eligible log waits for next scan");
    }

    private static final class ConnectionFault {
        private final String mode;
        private boolean fired;
        private boolean aborted;
        private int unsafeAutoCommit;
        private Connection faultedConnection;
        private ConnectionFault(String mode){this.mode=mode;}
        private DataSource source(){
            return DataSource.class.cast(Proxy.newProxyInstance(DataSource.class.getClassLoader(),new Class<?>[]{DataSource.class},(target,method,args)->{
                Object value=invoke(dataSource,method,args);
                return method.getName().equals("getConnection")?connection(Connection.class.cast(value)):value;
            }));
        }
        private Connection connection(Connection actual){
            return Connection.class.cast(Proxy.newProxyInstance(Connection.class.getClassLoader(),new Class<?>[]{Connection.class},(target,method,args)->{
                if(method.getName().equals("abort"))aborted=true;
                if(actual==faultedConnection&&method.getName().equals("setAutoCommit")&&Boolean.TRUE.equals(args[0]))unsafeAutoCommit++;
                if(mode.equals("rollback")&&!fired&&method.getName().equals("rollback")){fired=true;faultedConnection=actual;throw new SQLException("OWNED_ROLLBACK_FAILURE");}
                Object value=invoke(actual,method,args);
                if(method.getName().equals("createStatement"))return Statement.class.cast(Proxy.newProxyInstance(Statement.class.getClassLoader(),new Class<?>[]{Statement.class},(statement,operation,parameters)->{
                    if(mode.equals("reset")&&!fired&&operation.getName().equals("execute")&&Objects.equals(parameters[0],"SET @cloudflow_audit_archive_allow_delete = NULL")){
                        fired=true;faultedConnection=actual;throw new SQLException("OWNED_RESET_FAILURE");
                    }
                    return invoke(value,operation,parameters);
                }));
                if(mode.equals("delay")&&method.getName().equals("prepareStatement")&&String.valueOf(args[0]).startsWith("SELECT COALESCE(MAX(audit_id)")){
                    return PreparedStatement.class.cast(Proxy.newProxyInstance(PreparedStatement.class.getClassLoader(),new Class<?>[]{PreparedStatement.class},(statement,operation,parameters)->{
                        Object response=invoke(value,operation,parameters);
                        if(!fired&&operation.getName().equals("executeQuery")){fired=true;Thread.sleep(3500);}
                        return response;
                    }));
                }
                return value;
            }));
        }
    }
    private static Object invoke(Object target,Method method,Object[] args)throws Throwable{
        try{return method.invoke(target,args);}catch(InvocationTargetException exception){throw exception.getCause();}
    }

    private static AuditLogArchiveJob job(AuditLogArchiveService service,List<Long> tenants){
        return new AuditLogArchiveJob(new TenantIterator(null){@Override public List<Long> listActiveTenantIds(){return tenants;}},service);
    }
    private static AuditLogArchiveService.ArchiveResult archive(long tenant){return TenantBroker.applyAs(tenant,ignored->new AuditLogArchiveService(dataSource,false).archiveExpiredLogsForCurrentTenant());}
    private static void policy(long id,String module,String table,String status,int days)throws SQLException{
        execute("INSERT INTO sys_audit_archive_policy(id,biz_module,archive_table,status,retain_days) VALUES(?,?,?,?,?)",id,module,table,status,days);
    }
    private static void row(long id,long tenant,String module,LocalDateTime time)throws SQLException{
        execute("INSERT INTO sys_audit_log(audit_id,tenant_id,biz_module,audit_name,audit_field,before_val,after_val,before_json,after_json,diff_json,high_risk,risk_level,create_by,create_time) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                id,tenant,module,"Case-"+id,"金额",null,"中文 👑 value ","{\"before\":null}","{\"after\":\"长内容\"}","[]",1,"HIGH","verifier",time==null?null:Timestamp.valueOf(time));
    }
    private static List<String> snapshot(String table,long id)throws SQLException{
        if(!List.of("sys_audit_log","cold_one","cold_two","cold_invalid").contains(table))throw new IllegalArgumentException("Owned table required");
        try(Connection connection=dataSource.getConnection();PreparedStatement statement=connection.prepareStatement("SELECT * FROM %s WHERE audit_id=?".formatted(table))){
            statement.setLong(1,id);List<String> result=new ArrayList<>();
            try(ResultSet rows=statement.executeQuery()){if(rows.next())for(String column:COLUMNS)result.add(rows.getString(column));}
            return result;
        }
    }
    private static void execute(String sql,Object... parameters)throws SQLException{
        try(Connection connection=dataSource.getConnection();PreparedStatement statement=connection.prepareStatement(sql)){
            for(int index=0;index<parameters.length;index++)statement.setObject(index+1,parameters[index]);statement.execute();
        }
    }
    private static long queryLong(String sql)throws SQLException{
        try(Connection connection=dataSource.getConnection();Statement statement=connection.createStatement();ResultSet result=statement.executeQuery(sql)){
            if(!result.next())throw new IllegalStateException("Scalar result required");return result.getLong(1);
        }
    }
    private static RuntimeException caught(Runnable action,String label){try{action.run();throw new AssertionError(label);}catch(RuntimeException exception){check(true,label);return exception;}}
    private static boolean contains(Throwable error,String text){
        if(error.getMessage()!=null&&error.getMessage().contains(text))return true;
        if(error.getCause()!=null&&contains(error.getCause(),text))return true;
        for(Throwable suppressed:error.getSuppressed())if(contains(suppressed,text))return true;return false;
    }
    private static void check(boolean passed,String label){if(!passed)throw new AssertionError(label);checks++;}
}
