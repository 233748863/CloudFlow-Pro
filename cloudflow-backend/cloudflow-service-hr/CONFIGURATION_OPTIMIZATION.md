# HR服务配置优化建议

## 一、数据库连接池优化

### 当前配置
```yaml
hikari:
  minimum-idle: 5
  maximum-pool-size: 20
  auto-commit: true
  idle-timeout: 30000
  pool-name: HRHikariCP
  max-lifetime: 1800000
  connection-timeout: 30000
  connection-test-query: SELECT 1
```

### 优化建议

#### 1. 生产环境配置
```yaml
hikari:
  minimum-idle: 10                    # 最小空闲连接数（建议：CPU核心数 * 2）
  maximum-pool-size: 50               # 最大连接数（建议：根据并发量调整）
  auto-commit: true                   # 自动提交
  idle-timeout: 600000                # 空闲超时：10分钟
  pool-name: HRHikariCP
  max-lifetime: 1800000               # 连接最大生命周期：30分钟
  connection-timeout: 30000           # 连接超时：30秒
  connection-test-query: SELECT 1     # 连接测试查询
  leak-detection-threshold: 60000     # 连接泄漏检测阈值：60秒
```

#### 2. 高并发场景配置
```yaml
hikari:
  minimum-idle: 20
  maximum-pool-size: 100
  connection-timeout: 10000           # 缩短连接超时时间
  validation-timeout: 5000            # 连接验证超时
```

---

## 二、Redis 配置优化

### 当前配置
```yaml
data:
  redis:
    host: 192.168.1.173
    port: 6379
    password: ${REDIS_PASSWORD:}
    database: 0
    timeout: 10s
    lettuce:
      pool:
        max-active: 200
        max-idle: 20
        min-idle: 5
        max-wait: -1ms
```

### 优化建议

#### 1. 连接池优化
```yaml
lettuce:
  pool:
    max-active: 200                   # 最大活跃连接数
    max-idle: 50                      # 最大空闲连接数（建议增加）
    min-idle: 10                      # 最小空闲连接数（建议增加）
    max-wait: 3000ms                  # 最大等待时间（建议设置具体值）
  shutdown-timeout: 100ms             # 关闭超时
```

#### 2. 序列化配置
建议在代码中配置 Redis 序列化方式：
```java
@Bean
public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
    RedisTemplate<String, Object> template = new RedisTemplate<>();
    template.setConnectionFactory(factory);
    
    // 使用 Jackson2JsonRedisSerializer 替代默认的 JdkSerializationRedisSerializer
    Jackson2JsonRedisSerializer<Object> serializer = new Jackson2JsonRedisSerializer<>(Object.class);
    
    template.setKeySerializer(new StringRedisSerializer());
    template.setValueSerializer(serializer);
    template.setHashKeySerializer(new StringRedisSerializer());
    template.setHashValueSerializer(serializer);
    
    return template;
}
```

---

## 三、RabbitMQ 配置优化

### 当前配置
```yaml
rabbitmq:
  listener:
    simple:
      acknowledge-mode: manual
      concurrency: 5
      max-concurrency: 10
      prefetch: 1
      default-requeue-rejected: true
```

### 优化建议

#### 1. 高吞吐量场景
```yaml
rabbitmq:
  listener:
    simple:
      acknowledge-mode: manual
      concurrency: 10                 # 增加并发消费者
      max-concurrency: 20             # 增加最大并发数
      prefetch: 5                     # 增加预取数量
      default-requeue-rejected: false # 失败消息不重新入队（避免死循环）
      retry:
        enabled: true                 # 启用重试
        max-attempts: 3               # 最大重试次数
        initial-interval: 1000        # 初始重试间隔
        multiplier: 2.0               # 重试间隔倍数
        max-interval: 10000           # 最大重试间隔
```

#### 2. 死信队列配置
建议配置死信队列处理失败消息：
```java
@Bean
public Queue deadLetterQueue() {
    return new Queue("hr.dead.letter.queue", true);
}

@Bean
public DirectExchange deadLetterExchange() {
    return new DirectExchange("hr.dead.letter.exchange");
}

@Bean
public Binding deadLetterBinding() {
    return BindingBuilder.bind(deadLetterQueue())
        .to(deadLetterExchange())
        .with("dead.letter");
}
```

---

## 四、MyBatis-Plus 配置优化

### 当前配置
```yaml
mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
    cache-enabled: false
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
```

### 优化建议

#### 1. 生产环境配置
```yaml
mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
    cache-enabled: true               # 启用二级缓存（谨慎使用）
    lazy-loading-enabled: true        # 启用延迟加载
    aggressive-lazy-loading: false    # 禁用侵入式延迟加载
    # log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl  # 生产环境使用 SLF4J
  global-config:
    db-config:
      id-type: ASSIGN_ID
      logic-delete-field: deleted
      logic-delete-value: 1
      logic-not-delete-value: 0
    banner: false
```

#### 2. 性能监控插件
```java
@Bean
public MybatisPlusInterceptor performanceInterceptor() {
    MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
    
    // SQL 性能分析插件（仅开发环境）
    if (isDev) {
        PerformanceInterceptor performanceInterceptor = new PerformanceInterceptor();
        performanceInterceptor.setMaxTime(1000); // SQL 执行超过 1 秒告警
        performanceInterceptor.setFormat(true);
        interceptor.addInnerInterceptor(performanceInterceptor);
    }
    
    return interceptor;
}
```

---

## 五、Feign 配置优化

### 当前配置
```yaml
feign:
  client:
    config:
      default:
        connect-timeout: 5000
        read-timeout: 10000
        logger-level: BASIC
```

### 优化建议

#### 1. 启用 OkHttp 客户端（性能更好）
```yaml
feign:
  okhttp:
    enabled: true                     # 启用 OkHttp
  httpclient:
    enabled: false                    # 禁用 HttpClient
  client:
    config:
      default:
        connect-timeout: 3000         # 缩短连接超时
        read-timeout: 10000
        logger-level: BASIC
        # 请求拦截器
        request-interceptors:
          - com.cloudflow.hr.config.FeignRequestInterceptor
```

#### 2. 添加 OkHttp 依赖
```xml
<dependency>
    <groupId>io.github.openfeign</groupId>
    <artifactId>feign-okhttp</artifactId>
</dependency>
```

#### 3. 配置 OkHttp 连接池
```java
@Bean
public okhttp3.OkHttpClient okHttpClient() {
    return new okhttp3.OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .connectionPool(new ConnectionPool(200, 5, TimeUnit.MINUTES))
        .build();
}
```

---

## 六、日志配置优化

### 当前配置
```yaml
logging:
  level:
    root: INFO
    com.cloudflow.hr: DEBUG
    com.cloudflow.hr.mapper: DEBUG
    com.baomidou.mybatisplus: DEBUG
```

### 优化建议

#### 1. 生产环境配置
```yaml
logging:
  level:
    root: WARN                        # 生产环境使用 WARN 级别
    com.cloudflow.hr: INFO            # 业务日志使用 INFO
    com.cloudflow.hr.mapper: WARN    # Mapper 日志使用 WARN
    com.baomidou.mybatisplus: WARN   # MyBatis-Plus 日志使用 WARN
  pattern:
    console: '%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n'
    file: '%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n'
  file:
    name: logs/hr-service.log
    max-size: 100MB
    max-history: 30
    total-size-cap: 10GB              # 总日志大小限制
```

#### 2. 使用 Logback 异步日志
```xml
<!-- logback-spring.xml -->
<configuration>
    <appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
        <queueSize>512</queueSize>
        <discardingThreshold>0</discardingThreshold>
        <appender-ref ref="FILE"/>
    </appender>
    
    <root level="INFO">
        <appender-ref ref="ASYNC"/>
    </root>
</configuration>
```

---

## 七、JVM 参数优化

### 推荐 JVM 参数（4核8G服务器）

```bash
java -jar hr-service.jar \
  -Xms4g \                            # 初始堆大小
  -Xmx4g \                            # 最大堆大小
  -Xmn2g \                            # 年轻代大小
  -XX:MetaspaceSize=256m \            # 元空间初始大小
  -XX:MaxMetaspaceSize=512m \         # 元空间最大大小
  -XX:+UseG1GC \                      # 使用 G1 垃圾回收器
  -XX:MaxGCPauseMillis=200 \          # 最大 GC 停顿时间
  -XX:+HeapDumpOnOutOfMemoryError \   # OOM 时生成堆转储
  -XX:HeapDumpPath=/data/logs/hr-service-heapdump.hprof \
  -XX:+PrintGCDetails \               # 打印 GC 详情
  -XX:+PrintGCDateStamps \            # 打印 GC 时间戳
  -Xloggc:/data/logs/hr-service-gc.log \
  -Dspring.profiles.active=prod
```

---

## 八、线程池配置优化

### 建议配置异步任务线程池

```java
@Configuration
@EnableAsync
public class AsyncConfig implements AsyncConfigurer {
    
    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        
        // 核心线程数（建议：CPU核心数 * 2）
        executor.setCorePoolSize(8);
        
        // 最大线程数
        executor.setMaxPoolSize(20);
        
        // 队列容量
        executor.setQueueCapacity(500);
        
        // 线程名称前缀
        executor.setThreadNamePrefix("hr-async-");
        
        // 拒绝策略：由调用线程执行
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        
        // 等待所有任务完成后关闭线程池
        executor.setWaitForTasksToCompleteOnShutdown(true);
        
        // 等待时间
        executor.setAwaitTerminationSeconds(60);
        
        executor.initialize();
        return executor;
    }
}
```

---

## 九、缓存配置建议

### 1. Spring Cache 配置

```java
@Configuration
@EnableCaching
public class CacheConfig {
    
    @Bean
    public CacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofHours(1))                    // 默认过期时间：1小时
            .serializeKeysWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new StringRedisSerializer()))
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()))
            .disableCachingNullValues();                      // 不缓存 null 值
        
        // 针对不同缓存设置不同的过期时间
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();
        
        // 部门信息缓存：1小时
        cacheConfigurations.put("dept", config.entryTtl(Duration.ofHours(1)));
        
        // 岗位信息缓存：1小时
        cacheConfigurations.put("post", config.entryTtl(Duration.ofHours(1)));
        
        // 职位族和职级缓存：1天
        cacheConfigurations.put("position-family", config.entryTtl(Duration.ofDays(1)));
        cacheConfigurations.put("job-level", config.entryTtl(Duration.ofDays(1)));
        
        // 班次信息缓存：1天
        cacheConfigurations.put("shift", config.entryTtl(Duration.ofDays(1)));
        
        // 假期类型缓存：1天
        cacheConfigurations.put("leave-type", config.entryTtl(Duration.ofDays(1)));
        
        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withInitialCacheConfigurations(cacheConfigurations)
            .transactionAware()
            .build();
    }
}
```

### 2. 缓存使用示例

```java
@Service
public class DeptPostSyncService {
    
    @Cacheable(value = "dept", key = "#deptId", unless = "#result == null")
    public DeptVO getCachedDept(Long deptId) {
        // 从 Auth 服务查询部门信息
        return authServiceClient.getDeptById(deptId);
    }
    
    @CacheEvict(value = "dept", key = "#deptId")
    public void evictDeptCache(Long deptId) {
        // 清除部门缓存
    }
}
```

---

## 十、监控和告警配置

### 1. Actuator 端点配置

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus,threaddump,heapdump
  endpoint:
    health:
      show-details: when-authorized
      probes:
        enabled: true
  metrics:
    export:
      prometheus:
        enabled: true
    tags:
      application: ${spring.application.name}
      environment: ${spring.profiles.active}
```

### 2. 自定义监控指标

```java
@Component
public class CustomMetrics {
    
    private final MeterRegistry meterRegistry;
    
    public CustomMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }
    
    // 记录打卡次数
    public void recordCheckIn() {
        meterRegistry.counter("hr.attendance.checkin.count").increment();
    }
    
    // 记录请假申请次数
    public void recordLeaveApplication() {
        meterRegistry.counter("hr.leave.application.count").increment();
    }
    
    // 记录假期额度不足次数
    public void recordInsufficientQuota() {
        meterRegistry.counter("hr.leave.insufficient.quota.count").increment();
    }
}
```

---

## 总结

以上配置优化建议涵盖了数据库连接池、Redis、RabbitMQ、MyBatis-Plus、Feign、日志、JVM、线程池、缓存和监控等方面。

建议根据实际业务场景和服务器资源进行调整，并在测试环境充分验证后再应用到生产环境。
