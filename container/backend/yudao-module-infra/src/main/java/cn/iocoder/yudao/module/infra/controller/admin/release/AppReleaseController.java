package cn.iocoder.yudao.module.infra.controller.admin.release;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import cn.iocoder.yudao.framework.apilog.core.annotation.ApiAccessLog;
import cn.iocoder.yudao.module.infra.service.release.AppReleaseService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static cn.iocoder.yudao.framework.common.pojo.CommonResult.success;
import static cn.iocoder.yudao.framework.security.core.util.SecurityFrameworkUtils.getLoginUserId;

@RestController
@RequestMapping("/infra/app-release")
@RequiredArgsConstructor
public class AppReleaseController {
    private final AppReleaseService service;
    @GetMapping("/applications") @PreAuthorize("@ss.hasPermission('infra:app-release:query')")
    public CommonResult<List<Map<String,Object>>> applications(){return success(service.applications());}
    @PostMapping("/application/save") @PreAuthorize("@ss.hasPermission('infra:app-release:save')")
    public CommonResult<Long> save(@RequestBody AppReleaseService.Application req){return success(service.saveApplication(req,String.valueOf(getLoginUserId())));}
    @GetMapping("/get") @PreAuthorize("@ss.hasPermission('infra:app-release:query')")
    public CommonResult<Map<String,Object>> get(@RequestParam long id){return success(service.get(id));}
    @GetMapping("/list") @PreAuthorize("@ss.hasPermission('infra:app-release:query')")
    public CommonResult<cn.iocoder.yudao.framework.common.pojo.PageResult<Map<String,Object>>> list(@RequestParam long applicationId,
            @RequestParam(defaultValue="1") int pageNo,@RequestParam(defaultValue="20") int pageSize,
            @RequestParam(required=false) String channel,@RequestParam(required=false) String architecture){return success(service.page(applicationId,pageNo,pageSize,channel,architecture));}
    @GetMapping("/target") @PreAuthorize("@ss.hasPermission('infra:app-release:query')")
    public CommonResult<Map<String,Object>> target(@RequestParam long applicationId,@RequestParam String architecture,@RequestParam String channel){return success(service.targetState(applicationId,architecture,channel));}
    @PostMapping(value="/artifact",consumes="application/octet-stream") @PreAuthorize("@ss.hasPermission('infra:app-release:upload')")
    @ApiAccessLog(requestEnable=false,responseEnable=false)
    public CommonResult<Map<String,Object>> upload(@RequestParam long applicationId,@RequestParam long versionCode,HttpServletRequest request) throws Exception {return success(service.upload(applicationId,versionCode,request.getInputStream()));}
    public record ImportRequest(long applicationId,String payload,String signature) { }
    @PostMapping("/import") @PreAuthorize("@ss.hasPermission('infra:app-release:import')")
    @ApiAccessLog(requestEnable=false,responseEnable=false)
    public CommonResult<Long> importManifest(@RequestBody ImportRequest req) throws Exception {return success(service.importManifest(req.applicationId(),req.payload(),req.signature(),String.valueOf(getLoginUserId())));}
    @PostMapping("/publish") @PreAuthorize("@ss.hasPermission('infra:app-release:publish')")
    public CommonResult<Boolean> publish(@RequestParam long id) throws Exception {service.publish(id,String.valueOf(getLoginUserId()));return success(true);}
}
