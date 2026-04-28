package com.cloudflow.common.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "cloudflow")
public class CloudFlowConfig {

    private static String profile;

    public static String getProfile() {
        return profile;
    }

    public void setProfile(String profile) {
        CloudFlowConfig.profile = profile;
    }

    public static String getAvatarPath() {
        return getProfile() + "/avatar";
    }

    public static String getDownloadPath() {
        return getProfile() + "/download/";
    }

    public static String getUploadPath() {
        return getProfile() + "/upload";
    }
}
