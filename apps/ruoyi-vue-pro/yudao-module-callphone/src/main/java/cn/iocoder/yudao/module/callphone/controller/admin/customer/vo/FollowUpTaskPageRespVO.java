package cn.iocoder.yudao.module.callphone.controller.admin.customer.vo;

import lombok.Data;

import java.util.List;

@Data
public class FollowUpTaskPageRespVO {
    private List<FollowUpTaskRespVO> list;
    private Long total;
    private Long pendingCount;
    private Long overdueCount;
    private Long completedCount;
    private Long cancelledCount;
}
