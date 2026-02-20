package com.cloudflow.common.seata.config;

import org.springframework.boot.autoconfigure.AutoConfiguration;

/**
 * Seata 分布式事务配置类
 * 当前为预留模块，暂不启用
 * 后续需要分布式事务时，引入此模块并配置 Seata Server 即可
 *
 * 启用步骤：
 * 1. 在业务服务的 pom.xml 中引入 cloudflow-common-seata 依赖
 * 2. 配置 Seata Server 地址（seata.tx-service-group 等）
 * 3. 在需要分布式事务的方法上添加 @GlobalTransactional 注解
 *
 * @author CloudFlow
 */
@AutoConfiguration
public class SeataConfiguration {

    // 预留配置，暂不启用
    // 后续可在此处配置 Seata 的 RestTemplate 拦截器、Web 拦截器等
}
