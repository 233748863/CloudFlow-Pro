package com.cloudflow.common.oss.constant;

/**
 * OSS 常量定义
 *
 * @author CloudFlow
 */
public class OssConstant {

    /**
     * 是否使用 HTTPS 的标识值
     */
    public static final String IS_HTTPS = "Y";

    /**
     * 云服务商域名关键字列表
     * 用于判断 endpoint 是否为云服务商（非 MinIO 等私有部署）
     */
    public static final String[] CLOUD_SERVICE = {
            "aliyuncs.com",     // 阿里云 OSS
            "myqcloud.com",     // 腾讯云 COS
            "qiniucs.com",      // 七牛云
            "amazonaws.com",    // AWS S3
            "huaweicloud.com",  // 华为云 OBS
            "baidubce.com"      // 百度云 BOS
    };

    private OssConstant() {
    }
}
