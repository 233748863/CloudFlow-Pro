package cn.joywon.poco.user.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.joywon.poco.user.api.dto.AppUserAddressDTO;
import cn.joywon.poco.user.api.entity.AppUserAddress;
import cn.joywon.poco.user.api.vo.AppUserAddressVO;
import cn.joywon.poco.user.mapper.AppUserAddressMapper;
import cn.joywon.poco.user.service.AppUserAddressService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@AllArgsConstructor
public class AppUserAddressServiceImpl extends ServiceImpl<AppUserAddressMapper, AppUserAddress> implements AppUserAddressService {
    @Override
    public List<AppUserAddressVO> listAddress(Long userId) {
        QueryWrapper<AppUserAddress> queryWrapper = new QueryWrapper<>();
        queryWrapper.eq("user_id", userId);
        List<AppUserAddress> addressList = baseMapper.selectList(queryWrapper);

        return addressList.stream().map(item -> {
            AppUserAddressVO appUserAddressVO = new AppUserAddressVO();
            BeanUtil.copyProperties(item, appUserAddressVO);

            return appUserAddressVO;
        }).toList();
    }

    @Override
    public void add(AppUserAddressDTO input) {
        baseMapper.insert(input);
    }

    @Override
    public void edit(AppUserAddressDTO input) {
        LambdaQueryWrapper<AppUserAddress> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(AppUserAddress::getAddressId, input.getAddressId());

        AppUserAddress address = baseMapper.selectOne(queryWrapper);
        BeanUtil.copyProperties(input, address);

        if (input.getIsDefault()) {
            clearDefault(input.getUserId());
        }

        this.updateById(address);
    }

    @Override
    @Transactional
    public void setDefault(AppUserAddressDTO input, Long userId) {
        LambdaQueryWrapper<AppUserAddress> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(AppUserAddress::getAddressId, input.getAddressId()).eq(AppUserAddress::getUserId, userId);
        AppUserAddress address = baseMapper.selectOne(queryWrapper);
        if (address == null) {
            throw new IllegalArgumentException("地址不存在");
        }

        clearDefault(userId); // 清理原默认地址

        address.setIsDefault(Boolean.TRUE);

        this.updateById(address);
    }

    private void clearDefault(Long userId) {
        LambdaUpdateWrapper<AppUserAddress> updateWrapper = new LambdaUpdateWrapper<>();
        updateWrapper.eq(AppUserAddress::getUserId, userId).eq(AppUserAddress::getIsDefault, Boolean.TRUE);
        AppUserAddress currentDefaultAddress = baseMapper.selectOne(updateWrapper);
        if (currentDefaultAddress != null) {
            currentDefaultAddress.setIsDefault(Boolean.FALSE);
            this.updateById(currentDefaultAddress);
        }
    }

    @Override
    public void removeAddress(Long id, Long userId) {
        LambdaQueryWrapper<AppUserAddress> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(AppUserAddress::getAddressId, id).eq(AppUserAddress::getUserId, userId);
        AppUserAddress address = baseMapper.selectOne(queryWrapper);
        if (address == null) {
            throw new IllegalArgumentException("地址不存在，无需删除");
        }

        this.removeById(id);
    }

    @Override
    public AppUserAddressVO getDefault(Long userId) {
        LambdaQueryWrapper<AppUserAddress> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(AppUserAddress::getUserId, userId);
        queryWrapper.eq(AppUserAddress::getIsDefault, Boolean.TRUE);
        AppUserAddress address = baseMapper.selectOne(queryWrapper);

        return BeanUtil.copyProperties(address, AppUserAddressVO.class);
    }
}
