package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class KnowledgeBaseRespVO {
    private Long id;
    private String name;
    private String description;
    private String visibility;
    private List<Long> visibleDepartmentIds;
    private String status;
    private Integer documentCount;
    private Integer chunkCount;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
