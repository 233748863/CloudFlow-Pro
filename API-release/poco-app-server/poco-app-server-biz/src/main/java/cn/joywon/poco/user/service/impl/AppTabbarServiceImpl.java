package cn.joywon.poco.user.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import cn.joywon.poco.user.api.entity.AppTabbarEntity;
import cn.joywon.poco.user.mapper.AppTabbarMapper;
import cn.joywon.poco.user.service.AppTabbarService;
import org.springframework.stereotype.Service;

/**
 * 导航栏
 *
 * @author poco
 * @date 2023-06-08 11:18:46
 */
@Service
public class AppTabbarServiceImpl extends ServiceImpl<AppTabbarMapper, AppTabbarEntity> implements AppTabbarService {

}
