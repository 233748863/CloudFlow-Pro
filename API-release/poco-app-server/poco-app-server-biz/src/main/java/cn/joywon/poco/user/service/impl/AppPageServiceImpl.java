package cn.joywon.poco.user.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.user.api.entity.AppPageEntity;
import cn.joywon.poco.user.mapper.AppPageMapper;
import cn.joywon.poco.user.service.AppPageService;
import org.springframework.stereotype.Service;

/**
 * 页面
 *
 * @author poco
 * @date 2023-06-08 11:19:23
 */
@Service
public class AppPageServiceImpl extends ServiceImpl<AppPageMapper, AppPageEntity> implements AppPageService {

}
