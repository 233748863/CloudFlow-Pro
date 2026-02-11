package cn.joywon.poco.user.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.user.api.entity.AppArticleCategoryEntity;
import cn.joywon.poco.user.mapper.AppArticleCategoryMapper;
import cn.joywon.poco.user.service.AppArticleCategoryService;
import org.springframework.stereotype.Service;

/**
 * 文章分类表
 *
 * @author pig
 * @date 2023-06-07 16:28:03
 */
@Service
public class AppArticleCategoryServiceImpl extends ServiceImpl<AppArticleCategoryMapper, AppArticleCategoryEntity>
		implements AppArticleCategoryService {

}
