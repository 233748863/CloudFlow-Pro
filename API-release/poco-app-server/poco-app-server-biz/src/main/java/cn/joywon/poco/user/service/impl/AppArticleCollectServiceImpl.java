package cn.joywon.poco.user.service.impl;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.user.api.entity.AppArticleCollectEntity;
import cn.joywon.poco.user.mapper.AppArticleCollectMapper;
import cn.joywon.poco.user.service.AppArticleCollectService;
import cn.joywon.poco.common.security.util.SecurityUtils;
import org.springframework.stereotype.Service;

/**
 * 文章收藏表
 *
 * @author pig
 * @date 2023-06-16 14:33:41
 */
@Service
public class AppArticleCollectServiceImpl extends ServiceImpl<AppArticleCollectMapper, AppArticleCollectEntity>
        implements AppArticleCollectService {

    @Override
    public Boolean saveArticleCollect(AppArticleCollectEntity appArticleCollect) {
        Long id = SecurityUtils.getUser().getId();
        appArticleCollect.setUserId(id);

        if (baseMapper.exists(Wrappers.<AppArticleCollectEntity>lambdaQuery()
                .eq(AppArticleCollectEntity::getUserId, id)
                .eq(AppArticleCollectEntity::getArticleId, appArticleCollect.getArticleId()))) {
            return Boolean.FALSE;
        }

        return this.save(appArticleCollect);

    }

}
