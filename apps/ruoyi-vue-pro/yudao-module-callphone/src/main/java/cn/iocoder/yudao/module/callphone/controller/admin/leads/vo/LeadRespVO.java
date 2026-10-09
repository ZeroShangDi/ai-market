package cn.iocoder.yudao.module.callphone.controller.admin.leads.vo;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class LeadRespVO {
    private Long id;
    private String name;
    private String phoneDisplay;
    private String sourceCode;
    private Integer score;
    private Long ownerUserId;
    private String ownerName;
    private String status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
