package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.AcquisitionChannelSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.AcquisitionChannelDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.AcquisitionChannelMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import jakarta.annotation.Resource;
import java.util.List;
import java.util.Objects;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class AcquisitionChannelServiceImpl implements AcquisitionChannelService {

    private static final List<String> PLATFORMS = List.of("wechat", "douyin", "website", "offline");

    @Resource private AcquisitionChannelMapper channelMapper;
    @Resource private AdminUserApi adminUserApi;

    @Override
    public PageResult<AcquisitionChannelDO> getPage(AcquisitionChannelPageReqVO reqVO) {
        return channelMapper.selectPage(reqVO);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long save(AcquisitionChannelSaveReqVO reqVO) {
        if (!PLATFORMS.contains(reqVO.getPlatform())) {
            throw new ServiceException(ErrorCodeConstants.ACQUISITION_CHANNEL_PLATFORM_INVALID);
        }
        if (reqVO.getOwnerUserId() != null) adminUserApi.validateUser(reqVO.getOwnerUserId());
        AcquisitionChannelDO row;
        if (reqVO.getId() == null) {
            if (channelMapper.selectByChannelCode(reqVO.getChannelCode()) != null) {
                throw new ServiceException(ErrorCodeConstants.ACQUISITION_CHANNEL_CODE_DUPLICATED);
            }
            row = new AcquisitionChannelDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setStatus("active");
        } else {
            row = channelMapper.selectById(reqVO.getId());
            if (row == null) throw new ServiceException(ErrorCodeConstants.ACQUISITION_CHANNEL_NOT_FOUND);
            if (!Objects.equals(row.getChannelCode(), reqVO.getChannelCode())) {
                throw new ServiceException(ErrorCodeConstants.ACQUISITION_CHANNEL_CODE_IMMUTABLE);
            }
        }
        row.setName(reqVO.getName().trim());
        row.setPlatform(reqVO.getPlatform());
        row.setOwnerUserId(reqVO.getOwnerUserId());
        row.setAttributionWindowDays(reqVO.getAttributionWindowDays());
        if (reqVO.getId() == null) {
            row.setChannelCode(reqVO.getChannelCode());
            try {
                channelMapper.insert(row);
            } catch (DuplicateKeyException conflict) {
                // The unique index is the final guard when two requests pass the pre-check together.
                if (channelMapper.selectByChannelCode(reqVO.getChannelCode()) != null) {
                    throw new ServiceException(ErrorCodeConstants.ACQUISITION_CHANNEL_CODE_DUPLICATED);
                }
                throw conflict;
            }
        } else {
            channelMapper.updateById(row);
        }
        return row.getId();
    }

    @Override
    public boolean setStatus(Long id, String status) {
        if (!List.of("active", "disabled").contains(status)) return false;
        AcquisitionChannelDO row = channelMapper.selectById(id);
        if (row == null) return false;
        row.setStatus(status);
        return channelMapper.updateById(row) > 0;
    }
}
