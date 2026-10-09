package cn.iocoder.yudao.module.callphone.service.acquisition;

import cn.hutool.core.util.IdUtil;
import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionPageReqVO;
import cn.iocoder.yudao.module.callphone.controller.admin.acquisition.vo.PosterCompositionSaveReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.PosterCompositionDO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.acquisition.TrackingCodeDO;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.PosterCompositionMapper;
import cn.iocoder.yudao.module.callphone.dal.mysql.acquisition.TrackingCodeMapper;
import cn.iocoder.yudao.module.callphone.enums.ErrorCodeConstants;
import jakarta.annotation.Resource;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class PosterCompositionServiceImpl implements PosterCompositionService {

    @Resource private PosterCompositionMapper posterMapper;
    @Resource private TrackingCodeMapper trackingCodeMapper;

    @Override
    public PageResult<PosterCompositionDO> getPage(PosterCompositionPageReqVO reqVO) {
        return posterMapper.selectPage(reqVO);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long save(PosterCompositionSaveReqVO reqVO) {
        TrackingCodeDO code = trackingCodeMapper.selectById(reqVO.getTrackingCodeId());
        if (code == null || !"active".equals(code.getStatus())
                || code.getLandingUrl() == null || code.getLandingUrl().isBlank()) {
            throw new ServiceException(ErrorCodeConstants.POSTER_TRACKING_CODE_INVALID);
        }
        PosterCompositionDO row;
        if (reqVO.getId() == null) {
            row = new PosterCompositionDO();
            row.setId(IdUtil.getSnowflake().nextId());
            row.setStatus("active");
        } else {
            row = posterMapper.selectById(reqVO.getId());
            if (row == null) throw new ServiceException(ErrorCodeConstants.POSTER_NOT_FOUND);
        }
        row.setName(reqVO.getName().trim());
        row.setTitle(reqVO.getTitle().trim());
        row.setTemplateId(reqVO.getTemplateId());
        row.setTrackingCodeId(reqVO.getTrackingCodeId());
        if (reqVO.getId() == null) posterMapper.insert(row);
        else posterMapper.updateById(row);
        return row.getId();
    }

    @Override
    public boolean setStatus(Long id, String status) {
        if (!List.of("active", "disabled").contains(status)) return false;
        PosterCompositionDO row = posterMapper.selectById(id);
        if (row == null) return false;
        row.setStatus(status);
        return posterMapper.updateById(row) > 0;
    }

}
