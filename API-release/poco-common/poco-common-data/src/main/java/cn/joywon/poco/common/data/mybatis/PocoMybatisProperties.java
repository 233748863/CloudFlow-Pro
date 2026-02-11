package cn.joywon.poco.common.data.mybatis;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;

import java.util.ArrayList;
import java.util.List;

/**
 * Mybatis 配置
 *
 * @author poco
 * @date 2021/6/3
 */
@Data
@RefreshScope
@ConfigurationProperties("poco.mybatis")
public class PocoMybatisProperties {

	/**
	 * 是否打印可执行 sql
	 */
	private boolean showSql = true;

	/**
	 * 跳过表
	 */
	private List<String> skipTable = new ArrayList<>();

}
