package cn.joywon.poco.admin.api.vo;

import cn.joywon.poco.common.sensitive.annotation.Sensitive;
import cn.joywon.poco.common.sensitive.core.SensitiveTypeEnum;
import lombok.Data;

/**
 * 系统短信配置
 *
 * @author poco
 * @date 2024/7/14
 */
@Data
public class SysSystemSmsConfigVO {

    /**
     * 配置标识
     */
    private String configId;

    /**
     * 厂商标识
     */
    private String supplier;

    /**
     * accessKey
     */
    private String accessKeyId;

    /**
     * accessKeySecret
     */
    @Sensitive(type = SensitiveTypeEnum.KEY)
    private String accessKeySecret;

    /**
     * 短信签名
     */
    private String signature;

    /**
     * 模板ID
     */
    private String templateId;

    /**
     * sdkAppId
     */
    private String sdkAppId;

    /**
     * 重试间隔（单位：秒），默认为5秒
     */
    private int retryInterval = 5;


    /**
     * 最大发送数量，默认integer上限
     */
    private int maximum = Integer.MAX_VALUE;
}
