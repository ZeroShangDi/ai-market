package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.time.LocalDateTime;
import java.util.List;
import lombok.Data;

@Data
public class AiScriptRespVO {
    private Long id;
    private String templateKey;
    private Integer version;
    private String name;
    private String stageCode;
    private String channel;
    private List<String> tags;
    private String content;
    private List<String> variables;
    private String status;
    private Integer usageCount;
    private Integer copyCount;
    private Long createdBy;
    private String creatorName;
    private LocalDateTime publishedAt;
    private LocalDateTime lastUsedAt;
    private LocalDateTime createTime;
}
