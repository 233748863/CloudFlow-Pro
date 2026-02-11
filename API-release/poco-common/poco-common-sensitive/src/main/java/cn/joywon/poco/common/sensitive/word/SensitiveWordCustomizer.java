package cn.joywon.poco.common.sensitive.word;

import com.github.houbb.sensitive.word.api.IWordAllow;
import com.github.houbb.sensitive.word.api.IWordDeny;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.common.core.util.RetOps;
import cn.joywon.poco.common.sensitive.util.RemoteSensitiveService;
import lombok.RequiredArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * @author poco
 * @date 2024/7/6
 * <p>
 * 敏感词定制
 */
@RequiredArgsConstructor
public class SensitiveWordCustomizer implements IWordAllow, IWordDeny {

    private final RemoteSensitiveService remoteSensitiveService;

    /**
     * 白名单列表
     *
     * @return List
     */
    @Override
    public List<String> allow() {
        return RetOps.of(remoteSensitiveService.list(YesNoEnum.YES.getCode())).getData().orElseGet(ArrayList::new);
    }

    /**
     * 黑名单列表
     *
     * @return List
     */
    @Override
    public List<String> deny() {
        return RetOps.of(remoteSensitiveService.list(YesNoEnum.NO.getCode())).getData().orElseGet(ArrayList::new);

    }
}
