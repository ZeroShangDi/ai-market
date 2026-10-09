package cn.iocoder.yudao.module.callphone.controller.admin.ai.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class KnowledgeDocumentRespVO {
    private Long id;
    private Long knowledgeBaseId;
    private String sourceName;
    private Long byteSize;
    private String checksum;
    private String parseStatus;
    private Integer chunkCount;
    private Integer retryCount;
    private String errorMessage;
    private LocalDateTime createTime;
}
