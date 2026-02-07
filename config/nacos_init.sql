/*
 * Nacos Config Initialization Script for CloudFlow Pro
 * 
 * Instructions:
 * 1. Execute this script in your Nacos database (usually named 'nacos_config').
 * 2. Restart your microservices with active profile 'dev'.
 */

-- 1. cloudflow-common.yaml (Shared Configuration: Redis, Datasource, JWT, Profile)
INSERT INTO config_info (data_id, group_id, content, md5, gmt_create, gmt_modified, src_user, src_ip, app_name, tenant_id, c_desc, c_use, effect, type, c_schema) 
VALUES ('cloudflow-common.yaml', 'DEFAULT_GROUP', 'spring:
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
      lettuce:
        pool:
          max-active: 20
          max-wait: -1
          max-idle: 8
          min-idle: 0
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://localhost:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=true&serverTimezone=GMT%2B8
    username: root
    password: password

cloudflow:
  profile: C:/Users/Administrator/cloudflow/uploadPath
  security:
    jwt:
      secret: a-very-secure-random-secret-key-generated-for-production-environment-2026
    token:
      expiration: 30
      refresh-time: 20', MD5('spring:
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
      lettuce:
        pool:
          max-active: 20
          max-wait: -1
          max-idle: 8
          min-idle: 0
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://localhost:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=true&serverTimezone=GMT%2B8
    username: root
    password: password

cloudflow:
  profile: C:/Users/Administrator/cloudflow/uploadPath
  security:
    jwt:
      secret: a-very-secure-random-secret-key-generated-for-production-environment-2026
    token:
      expiration: 30
      refresh-time: 20'), NOW(), NOW(), 'nacos', '127.0.0.1', 'cloudflow', '', 'Common Configuration', 'Normal', NULL, 'yaml', NULL);

-- 2. cloudflow-gateway-dev.yaml
INSERT INTO config_info (data_id, group_id, content, md5, gmt_create, gmt_modified, src_user, src_ip, app_name, tenant_id, c_desc, c_use, effect, type, c_schema) 
VALUES ('cloudflow-gateway-dev.yaml', 'DEFAULT_GROUP', 'spring:
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
  cloud:
    gateway:
      discovery:
        locator:
          enabled: true
      routes:
        - id: auth-service
          uri: lb://cloudflow-auth
          predicates:
            - Path=/auth/**, /system/**
          filters:
            - StripPrefix=0
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@ipKeyResolver}"
                redis-rate-limiter.replenishRate: 20
                redis-rate-limiter.burstCapacity: 40
        - id: workflow-service
          uri: lb://cloudflow-service-workflow
          predicates:
            - Path=/workflow/**
          filters:
            - StripPrefix=0
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@userKeyResolver}"
                redis-rate-limiter.replenishRate: 50
                redis-rate-limiter.burstCapacity: 100
      globalcors:
        cors-configurations:
          ''[/**]'':
            allowedOrigins: "*"
            allowedMethods: "*"
            allowedHeaders: "*"
', MD5('spring:
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
  cloud:
    gateway:
      discovery:
        locator:
          enabled: true
      routes:
        - id: auth-service
          uri: lb://cloudflow-auth
          predicates:
            - Path=/auth/**, /system/**
          filters:
            - StripPrefix=0
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@ipKeyResolver}"
                redis-rate-limiter.replenishRate: 20
                redis-rate-limiter.burstCapacity: 40
        - id: workflow-service
          uri: lb://cloudflow-service-workflow
          predicates:
            - Path=/workflow/**
          filters:
            - StripPrefix=0
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@userKeyResolver}"
                redis-rate-limiter.replenishRate: 50
                redis-rate-limiter.burstCapacity: 100
      globalcors:
        cors-configurations:
          ''[/**]'':
            allowedOrigins: "*"
            allowedMethods: "*"
            allowedHeaders: "*"
'), NOW(), NOW(), 'nacos', '127.0.0.1', 'cloudflow-gateway', '', 'Gateway Routes', 'Normal', NULL, 'yaml', NULL);

-- 3. cloudflow-auth-dev.yaml (Specific Auth Configs)
INSERT INTO config_info (data_id, group_id, content, md5, gmt_create, gmt_modified, src_user, src_ip, app_name, tenant_id, c_desc, c_use, effect, type, c_schema) 
VALUES ('cloudflow-auth-dev.yaml', 'DEFAULT_GROUP', 'cloudflow:
  captcha:
    tolerance: 5
    ttl: 300
    daily-limit: 100
    pass-token-ttl: 120
', MD5('cloudflow:
  captcha:
    tolerance: 5
    ttl: 300
    daily-limit: 100
    pass-token-ttl: 120
'), NOW(), NOW(), 'nacos', '127.0.0.1', 'cloudflow-auth', '', 'Auth Service Config', 'Normal', NULL, 'yaml', NULL);

-- 4. cloudflow-service-workflow-dev.yaml
INSERT INTO config_info (data_id, group_id, content, md5, gmt_create, gmt_modified, src_user, src_ip, app_name, tenant_id, c_desc, c_use, effect, type, c_schema) 
VALUES ('cloudflow-service-workflow-dev.yaml', 'DEFAULT_GROUP', 'cloudflow:
  workflow:
    stream:
      key: workflow:stream:timeout
      group: group:workflow:engine
', MD5('cloudflow:
  workflow:
    stream:
      key: workflow:stream:timeout
      group: group:workflow:engine
'), NOW(), NOW(), 'nacos', '127.0.0.1', 'cloudflow-service-workflow', '', 'Workflow Service Config', 'Normal', NULL, 'yaml', NULL);
