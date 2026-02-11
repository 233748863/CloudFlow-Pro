package cn.joywon.poco.user.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.user.api.entity.AppArticleEntity;

public interface AppArticleService extends IService<AppArticleEntity> {

	/**
	 * 获取文章并使阅读数+1
	 * @param id id
	 * @return
	 */
	AppArticleEntity getArticleAndIncrById(Long id, Long userId);

	/**
	 * 分页查询文章列表 包含分类名称
	 * @param page 分页参数
	 * @param appArticle 文章查询条件
	 * @return
	 */
	Page pageAndCname(Page page, AppArticleEntity appArticle);

	/**
	 * 通过分类ID和文章ID获取文章详情
	 * @param categoryId 分类ID
	 * @param id 文章ID
	 * @return
	 */
	AppArticleEntity getArticleByCategoryAndId(Long categoryId, Long id);

}
