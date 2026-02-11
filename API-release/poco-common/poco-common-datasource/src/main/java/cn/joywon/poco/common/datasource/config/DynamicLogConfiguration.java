package cn.joywon.poco.common.datasource.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;

/**
 * @author poco
 * @date 2022/8/8
 *
 * 注入SQL 格式化的插件
 */
@ConditionalOnClass(name = "cn.joywon.poco.common.data.mybatis.DruidSqlLogFilter")
public class DynamicLogConfiguration {

}
