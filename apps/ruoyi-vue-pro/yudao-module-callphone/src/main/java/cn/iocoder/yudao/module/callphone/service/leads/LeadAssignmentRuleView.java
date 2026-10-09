package cn.iocoder.yudao.module.callphone.service.leads;

import java.time.LocalDateTime;
import java.util.List;

public record LeadAssignmentRuleView(Long id, String name, boolean enabled, int cursorIndex, int version,
                                     List<Long> memberIds, List<String> memberNames,
                                     LocalDateTime updateTime) {
}
