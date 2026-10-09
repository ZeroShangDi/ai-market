package cn.iocoder.yudao.module.callphone.controller.admin.outbound.vo;

import cn.idev.excel.annotation.ExcelProperty;
import java.time.LocalDateTime;
import lombok.Data;

/** Export contains only the masked phone number and non-sensitive call metadata. */
@Data
public class CallRecordExportExcelVO {

    @ExcelProperty("通话编号")
    private String id;

    @ExcelProperty("脱敏号码")
    private String phoneDisplay;

    @ExcelProperty("方向")
    private String direction;

    @ExcelProperty("负责人")
    private String ownerName;

    @ExcelProperty("设备")
    private String deviceName;

    @ExcelProperty("状态")
    private String status;

    @ExcelProperty("通话结果")
    private String resultCode;

    @ExcelProperty("开始时间")
    private LocalDateTime startedAt;

    @ExcelProperty("结束时间")
    private LocalDateTime endedAt;

    @ExcelProperty("通话时长（秒）")
    private Integer durationSeconds;

    @ExcelProperty("录音状态")
    private String recordingState;

    @ExcelProperty("摘要状态")
    private String summaryState;

    @ExcelProperty("创建时间")
    private LocalDateTime createTime;

}
