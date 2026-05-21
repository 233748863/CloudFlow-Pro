# cloudflow-common-config-secret

## 模块定位

基于 [jasypt-spring-boot-starter](https://github.com/ulisesbocchio/jasypt-spring-boot)，
为 Nacos/本地 yaml 中的敏感字段（数据库密码、Redis 密码、第三方 API Key 等）提供 `ENC(...)` 占位的密文化能力。

**不要与 `cloudflow-common-encrypt` 混淆**：

| 模块 | 用途 | 时机 |
|------|------|------|
| cloudflow-common-encrypt | 数据库字段级 AES/SM4 加解密（基于 MyBatis 拦截器 + `@EncryptField`） | 运行期，写入/查询单字段 |
| cloudflow-common-config-secret | 启动期 Spring `Environment` 占位解密（基于 `ENC(...)` 包裹） | 启动期，配置项加载 |

## 接入步骤

### 1. 引入依赖

在需要解密配置占位的服务模块 `pom.xml` 增加：

```xml
<dependency>
    <groupId>com.cloudflow</groupId>
    <artifactId>cloudflow-common-config-secret</artifactId>
</dependency>
```

> 本仓库已在 6 个服务模块（auth / gateway / workflow / oa / crm / hr）默认引入。

### 2. 下发主密钥

主密钥通过环境变量 `JASYPT_ENCRYPTOR_PASSWORD` 注入，**不要写入 yaml / 代码 / Nacos**。

- 本地开发：在 `.env` / IDE Run Configuration 中设置
- 容器部署：通过 K8s Secret / Docker Compose `env_file` / CI/CD Secret 注入
- 多环境隔离：dev / staging / prod 各自独立的主密钥，互不通用

如果当前服务不需要密文配置，可不下发 —— 此时 `ENC(...)` 不会出现，env-var 模式（`${DB_PASSWORD}` 等）继续生效。

### 3. 生成密文

使用 jasypt 官方 CLI：

```bash
# 算法需与 yaml 中 jasypt.encryptor.algorithm 保持一致
java -cp jasypt-1.9.3.jar org.jasypt.intf.cli.JasyptPBEStringEncryptionCLI \
    input="MySuperSecret" \
    password="$JASYPT_ENCRYPTOR_PASSWORD" \
    algorithm="PBEWITHHMACSHA512ANDAES_256" \
    ivGeneratorClassName=org.jasypt.iv.RandomIvGenerator
```

或在任意已引入本模块的服务里临时跑一段：

```java
StringEncryptor enc = ctx.getBean(StringEncryptor.class);
System.out.println(enc.encrypt("MySuperSecret"));
```

### 4. yaml 占位

将密文以 `ENC(密文)` 形式直接写入 yaml：

```yaml
spring:
  datasource:
    dynamic:
      datasource:
        master:
          username: cloudflow_app
          password: ENC(xxxxxxxxxxxxxxxxxxxxxx)
```

启动时 Jasypt 的 `EnvironmentPostProcessor` 会先于 `DataSource` 初始化拦截解密。

### 5. 兼容现有 `${DB_PASSWORD}`

Jasypt 仅处理 `ENC(...)` 占位，对 `${...}` 占位无影响。本仓库现有以环境变量形式注入的密码（如 `${DB_PASSWORD}`、`${REDIS_PASSWORD}`）可继续使用，无需立即迁移。建议优先级：

1. 生产环境敏感凭证 → 优先 `ENC(...)`
2. 开发/测试低敏数据 → `${...}` 环境变量足够
3. 不再使用 yaml 直接硬编码密码（无论明文还是默认值）

## 配置参数

`config/cloudflow-common.yaml` 已统一注入：

```yaml
jasypt:
  encryptor:
    password: ${JASYPT_ENCRYPTOR_PASSWORD:}
    algorithm: PBEWITHHMACSHA512ANDAES_256
    iv-generator-classname: org.jasypt.iv.RandomIvGenerator
    pool-size: 1
    string-output-type: base64
```

> 主密钥为空（未下发）时，仅 yaml 内无任何 `ENC(...)` 占位的场景可正常启动；一旦出现 `ENC(...)`，启动会以 `EncryptionOperationNotPossibleException` 失败 —— 即"密钥缺失即拒绝启动"，避免误以为明文。

## 密钥下发与轮换

| 场景 | 操作 |
|------|------|
| 首次部署 | 运维生成 32 位以上随机主密钥，写入 K8s Secret / CI Secret；下发到所有 6 个服务 |
| 轮换 | 1) 用新密钥重新生成所有密文 → 2) 灰度更新 Nacos / yaml → 3) 验证后批量替换 K8s Secret |
| 紧急回滚 | 保留上一代主密钥与对应密文 yaml 备份至少 24h |

## FAQ

**Q：能不能把 ENC() 直接放进 application.properties 里给 Bootstrap 阶段的 Nacos 鉴权用？**
A：可以。Jasypt 的 `EnvironmentPostProcessor` 在 Spring 上下文准备阶段生效，早于 Nacos 配置拉取，覆盖 Bootstrap properties / yaml 都没问题。

**Q：本机开发不想配主密钥怎么办？**
A：保持 yaml 中使用 `${DB_PASSWORD}` / `${REDIS_PASSWORD}` 等环境变量占位即可，不强制走 ENC()。

**Q：和 Vault / Nacos KMS 怎么集成？**
A：方案不冲突。短期用 Jasypt 解决"yaml 不能裸写明文"；长期若引入 KMS，可保留 Jasypt 作为本地 fallback，或迁移到 Nacos 配置加密插件。
