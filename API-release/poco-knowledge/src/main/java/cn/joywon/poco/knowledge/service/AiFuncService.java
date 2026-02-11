package cn.joywon.poco.knowledge.service;

import com.baomidou.mybatisplus.extension.service.IService;
import cn.joywon.poco.common.core.util.R;
import cn.joywon.poco.knowledge.dto.FunctionDTO;
import cn.joywon.poco.knowledge.entity.AiFuncEntity;

/**
 * AI func 服务
 *
 * @author poco
 * @date 2024/08/06
 */
public interface AiFuncService extends IService<AiFuncEntity> {

	/**
	 * 保存 func
	 * @param aiFunc AI 函数
	 * @return {@link Boolean }
	 */
	AiFuncEntity saveOrUpdateFunc(AiFuncEntity aiFunc);

	/**
	 * 删除 Funcs
	 * @param ids id 列表
	 * @return {@link Boolean }
	 */
	Boolean removeFuncs(Long[] ids);

	/**
	 * 检查脚本
	 * @param functionDTO 脚本
	 * @return {@link R }
	 */
	R checkScript(FunctionDTO functionDTO);


    /**
     * list 函数调用
     *
     * @return {@link R }
     */
    R listFunctionCalling();
}
