package cn.iocoder.yudao.module.callphone.dal.mysql.outbound;

import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.dal.dataobject.outbound.CallRecordingAssetDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CallRecordingAssetMapper extends BaseMapperX<CallRecordingAssetDO> {
    default CallRecordingAssetDO selectByCallRecordId(Long callRecordId) {
        return selectOne(new LambdaQueryWrapperX<CallRecordingAssetDO>()
                .eq(CallRecordingAssetDO::getCallRecordId, callRecordId));
    }

    default CallRecordingAssetDO selectByUploadId(Long deviceId, String uploadId) {
        return selectOne(new LambdaQueryWrapperX<CallRecordingAssetDO>()
                .eq(CallRecordingAssetDO::getDeviceId, deviceId)
                .eq(CallRecordingAssetDO::getUploadId, uploadId));
    }

    default CallRecordingAssetDO selectByUploadIdForUpdate(Long deviceId, String uploadId) {
        return selectOne(new LambdaQueryWrapperX<CallRecordingAssetDO>()
                .eq(CallRecordingAssetDO::getDeviceId, deviceId)
                .eq(CallRecordingAssetDO::getUploadId, uploadId)
                .last("FOR UPDATE"));
    }

    default CallRecordingAssetDO selectByCallRecordIdForUpdate(Long callRecordId) {
        return selectOne(new LambdaQueryWrapperX<CallRecordingAssetDO>()
                .eq(CallRecordingAssetDO::getCallRecordId, callRecordId)
                .last("FOR UPDATE"));
    }
}
