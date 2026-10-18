package com.cloudflow.common.datasource.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.AutoConfiguration;

@AutoConfiguration(afterName = "com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration")
@MapperScan("com.cloudflow.common.datasource.mapper")
public class RuntimeDataSourceConfiguration { }
