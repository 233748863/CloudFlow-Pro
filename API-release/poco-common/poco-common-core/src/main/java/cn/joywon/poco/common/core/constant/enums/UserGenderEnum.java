package cn.joywon.poco.common.core.constant.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum UserGenderEnum {
    male("male", "男"),
    female("female", "女");

    private final String code;
    private final String desc;
}
