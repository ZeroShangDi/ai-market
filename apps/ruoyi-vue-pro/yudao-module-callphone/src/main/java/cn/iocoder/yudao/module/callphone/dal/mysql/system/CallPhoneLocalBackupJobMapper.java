package cn.iocoder.yudao.module.callphone.dal.mysql.system;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.mybatis.core.mapper.BaseMapperX;
import cn.iocoder.yudao.framework.mybatis.core.query.LambdaQueryWrapperX;
import cn.iocoder.yudao.module.callphone.controller.admin.system.vo.CallPhoneLocalBackupPageReqVO;
import cn.iocoder.yudao.module.callphone.dal.dataobject.system.CallPhoneLocalBackupJobDO;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface CallPhoneLocalBackupJobMapper extends BaseMapperX<CallPhoneLocalBackupJobDO> {
    default PageResult<CallPhoneLocalBackupJobDO> selectPage(CallPhoneLocalBackupPageReqVO req) {
        return selectPage(req, new LambdaQueryWrapperX<CallPhoneLocalBackupJobDO>().orderByDesc(CallPhoneLocalBackupJobDO::getCreateTime));
    }
}
