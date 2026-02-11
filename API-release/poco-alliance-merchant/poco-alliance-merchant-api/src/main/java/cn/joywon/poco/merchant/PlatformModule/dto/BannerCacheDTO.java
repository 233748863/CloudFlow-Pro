package cn.joywon.poco.merchant.PlatformModule.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class BannerCacheDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 3815671853096513308L;

    private String id;

    private String imageName;

    private String summary;

    private String targetId;

    private String routePath;

    private String imageUrl;

    private String bgColor;

    private String sortWeight;

}