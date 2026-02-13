package com.cloudflow.common.datasource.constants;

/**
 * 数据源名称常量
 * <p>
 * 在 Mapper 或 Service 上使用 @DS 注解时，推荐引用此常量类，避免硬编码字符串。
 * 数据源名称需要与 Nacos 配置中 spring.datasource.dynamic.datasource 下的 key 一致。
 * </p>
 *
 * <p>使用示例：</p>
 * <pre>
 * {@literal @}DS(DsConstants.MASTER)
 * {@literal @}Mapper
 * public interface UserMapper extends BaseMapper&lt;User&gt; {}
 *
 * {@literal @}DS(DsConstants.REPORT)
 * {@literal @}Mapper
 * public interface ReportMapper extends BaseMapper&lt;Report&gt; {}
 * </pre>
 */
public final class DsConstants {

    private DsConstants() {
        // 工具类，禁止实例化
    }

    /**
     * 主数据源（默认），对应 Nacos 配置中的 master
     */
    public static final String MASTER = "master";

    /**
     * 报表数据源，对应 Nacos 配置中的 report
     */
    public static final String REPORT = "report";

    /**
     * 第三方数据源（按需启用），对应 Nacos 配置中的 thirdparty
     */
    public static final String THIRD_PARTY = "thirdparty";
}
