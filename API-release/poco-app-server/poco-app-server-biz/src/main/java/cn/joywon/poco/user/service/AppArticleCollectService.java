package cn.joywon.poco.user.service;

import com.github.yulichang.base.MPJBaseService;
import cn.joywon.poco.user.api.entity.AppArticleCollectEntity;

public interface AppArticleCollectService extends MPJBaseService<AppArticleCollectEntity> {

	Boolean saveArticleCollect(AppArticleCollectEntity appArticleCollect);

}
