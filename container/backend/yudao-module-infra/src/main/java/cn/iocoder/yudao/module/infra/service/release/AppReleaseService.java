package cn.iocoder.yudao.module.infra.service.release;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.sql.Timestamp;
import java.sql.Statement;
import java.time.*;
import java.util.*;
import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception0;
import static org.springframework.http.HttpStatus.*;

/** 发布控制面与不可变签名清单。线上服务只持公钥，离线CI持私钥。 */
@Service
@RequiredArgsConstructor
public class AppReleaseService {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    @Value("${app-update.storage-root:./data/app-updates}") private String storageRoot;
    @Value("${app-update.allow-http:false}") private boolean allowHttp;
    @Value("${app-update.max-artifact-bytes:268435456}") private long maxArtifactBytes;
    public record Application(Long id,String name,String appId,String packageName,String publicKey,String artifactBaseUrl) { }
    public record PublicManifest(boolean managed,String envelope) { }
    private static void check(boolean valid,String message) { if (!valid) throw exception0(400,message); }
    private Map<String,Object> app(long id) {
        var rows=db.queryForList("SELECT * FROM infra_release_application WHERE id=?",id);
        check(!rows.isEmpty(),"应用不存在");return rows.get(0);
    }
    private static String text(Map<String,Object> map,String key) { return Objects.toString(map.get(key),""); }
    private static PublicKey key(String value) {
        try {
            var result=KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(value)));
            check(result instanceof RSAPublicKey rsa && rsa.getModulus().bitLength()>=2048 && rsa.getModulus().bitLength()<=8192,"签名公钥需为2048位以上RSA公钥");return result;
        } catch (Exception error) { throw exception0(400,"签名公钥格式无效，请使用SPKI DER Base64"); }
    }
    public List<Map<String,Object>> applications() {
        return db.queryForList("SELECT id,name,app_id AS appId,package_name AS packageName,public_key AS publicKey,artifact_base_url AS artifactBaseUrl,create_time AS createTime FROM infra_release_application ORDER BY id DESC");
    }
    @Transactional
    public long saveApplication(Application req,String actor) {
        check(req.name()!=null && !req.name().isBlank() && req.name().length()<=100,"请输入应用名称");
        check(req.appId()!=null && req.appId().matches("[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}"),"应用标识格式无效");
        check(req.packageName()!=null && req.packageName().matches("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+") && req.packageName().length()<=128,"Android包名格式无效");
        key(req.publicKey());
        try {
            URI uri=URI.create(req.artifactBaseUrl());
            check(uri.getHost()!=null && uri.getUserInfo()==null && uri.getQuery()==null && uri.getFragment()==null && !req.artifactBaseUrl().endsWith("/"),"下载根地址格式无效");
            check("https".equals(uri.getScheme()) || allowHttp && "http".equals(uri.getScheme()) && Set.of("127.0.0.1","localhost","[::1]").contains(uri.getHost()),"生产下载地址必须使用HTTPS");
        } catch (IllegalArgumentException error) { throw exception0(400,"下载根地址格式无效"); }
        if (req.id()!=null) {
            var old=app(req.id());
            check(text(old,"app_id").equals(req.appId()) && text(old,"package_name").equals(req.packageName()),"已登记的应用标识和包名不可更换");
            check(db.queryForObject("SELECT COUNT(*) FROM infra_app_release WHERE application_id=?",Long.class,req.id())==0 || text(old,"public_key").equals(req.publicKey()) && text(old,"artifact_base_url").equals(req.artifactBaseUrl()),"已有版本后不可直接替换签名公钥或下载地址");
            db.update("UPDATE infra_release_application SET name=?,public_key=?,artifact_base_url=? WHERE id=?",req.name(),req.publicKey(),req.artifactBaseUrl(),req.id());return req.id();
        }
        return insert("INSERT INTO infra_release_application(name,app_id,package_name,public_key,artifact_base_url,creator) VALUES (?,?,?,?,?,?)",req.name(),req.appId(),req.packageName(),req.publicKey(),req.artifactBaseUrl(),actor);
    }
    private long insert(String sql,Object... values) {
        var holder=new GeneratedKeyHolder();db.update(connection->{var statement=connection.prepareStatement(sql,Statement.RETURN_GENERATED_KEYS);for(int i=0;i<values.length;i++)statement.setObject(i+1,values[i]);return statement;},holder);
        return Objects.requireNonNull(holder.getKey()).longValue();
    }
    public Map<String,Object> get(long id) {
        var rows=db.queryForList("SELECT id,application_id AS applicationId,manifest,state FROM infra_app_release WHERE id=?",id);
        check(!rows.isEmpty(),"版本记录不存在");return rows.get(0);
    }
    public List<Map<String,Object>> releases(long applicationId) {
        app(applicationId);
        return db.queryForList("SELECT id,application_id AS applicationId,architecture,channel,sequence,version_code AS versionCode,version_name AS versionName,notes,state,issued_at AS issuedAt,expires_at AS expiresAt,published_at AS publishedAt,creator,publisher FROM infra_app_release WHERE application_id=? ORDER BY sequence DESC,id DESC LIMIT 500",applicationId);
    }
    public Map<String,Object> targetState(long applicationId,String architecture,String channel) {
        app(applicationId);
        return db.queryForMap("SELECT COALESCE(MAX(sequence),0) AS sequence,COALESCE(MAX(version_code),0) AS versionCode FROM infra_app_release WHERE application_id=? AND architecture=? AND channel=?",applicationId,architecture,channel);
    }
    public cn.iocoder.yudao.framework.common.pojo.PageResult<Map<String,Object>> page(long applicationId,int pageNo,int pageSize,String channel,String architecture) {
        app(applicationId);check(pageNo>0 && pageNo<=100000 && pageSize>0 && pageSize<=100,"分页参数无效");
        String where=" WHERE application_id=?";List<Object> args=new ArrayList<>();args.add(applicationId);
        if(channel!=null && !channel.isBlank()){where+=" AND channel=?";args.add(channel);}
        if(architecture!=null && !architecture.isBlank()){where+=" AND architecture=?";args.add(architecture);}
        Long total=db.queryForObject("SELECT COUNT(*) FROM infra_app_release"+where,Long.class,args.toArray());
        args.add(pageSize);args.add((pageNo-1)*pageSize);
        var list=db.queryForList("SELECT id,application_id AS applicationId,architecture,channel,sequence,version_code AS versionCode,version_name AS versionName,notes,state,issued_at AS issuedAt,expires_at AS expiresAt,published_at AS publishedAt,creator,publisher FROM infra_app_release"+where+" ORDER BY sequence DESC,id DESC LIMIT ? OFFSET ?",args.toArray());
        return new cn.iocoder.yudao.framework.common.pojo.PageResult<>(list,total);
    }
    private Path packageDirectory(String packageName) throws IOException {
        Path root=Path.of(storageRoot).toAbsolutePath().normalize();Files.createDirectories(root);root=root.toRealPath();
        Path result=root.resolve(packageName).resolve("apk");Files.createDirectories(result);result=result.toRealPath();
        check(result.startsWith(root),"发布存储路径无效");return result;
    }
    public Map<String,Object> upload(long applicationId,long versionCode,InputStream stream) throws Exception {
        check(versionCode>0 && versionCode<=2100000000L,"Android版本号需为1到2100000000之间整数");
        var application=app(applicationId);String pkg=text(application,"package_name");Path directory=packageDirectory(pkg);Path temp=Files.createTempFile(directory,".upload-",".tmp");long bytes=0;MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try {
            try(var output=Files.newOutputStream(temp)) {
                byte[] buffer=new byte[65536];int count;
                while((count=stream.read(buffer))!=-1) {bytes+=count;check(bytes<=maxArtifactBytes,"安装包超出发布大小限制");digest.update(buffer,0,count);output.write(buffer,0,count);}
            }
            check(bytes>0,"安装包不能为空");String hash=HexFormat.of().formatHex(digest.digest());String filename=versionCode+"-"+hash+".apk";Path target=directory.resolve(filename);
            if (!Files.exists(target)) {try {Files.move(temp,target,StandardCopyOption.ATOMIC_MOVE);}catch(FileAlreadyExistsException ignored){}}
            check(Files.isRegularFile(target) && !Files.isSymbolicLink(target) && Files.size(target)==bytes && hash.equals(sha256(target)),"同名安装包校验失败");
            return Map.of("type","apk","url",text(application,"artifact_base_url")+"/"+pkg+"/apk/"+filename,"bytes",bytes,"sha256",hash,"packageName",pkg);
        } finally { Files.deleteIfExists(temp); }
    }
    private static String sha256(Path file) throws Exception {
        MessageDigest digest=MessageDigest.getInstance("SHA-256");try(var input=Files.newInputStream(file)){byte[] buffer=new byte[65536];int count;while((count=input.read(buffer))!=-1)digest.update(buffer,0,count);}return HexFormat.of().formatHex(digest.digest());
    }
    @Transactional
    public long importManifest(long applicationId,String payload,String signature,String actor) throws Exception {
        var application=app(applicationId);check(payload!=null && payload.getBytes(StandardCharsets.UTF_8).length<=100000 && signature!=null && signature.length()<=4096,"签名清单格式或大小无效");
        try {var verifier=Signature.getInstance("SHA256withRSA");verifier.initVerify(key(text(application,"public_key")));verifier.update(payload.getBytes(StandardCharsets.UTF_8));check(verifier.verify(Base64.getDecoder().decode(signature)),"签名校验失败");}
        catch(GeneralSecurityException|IllegalArgumentException error){throw exception0(400,"签名校验失败");}
        JsonNode metadata=json.readTree(payload);check(metadata.path("schemaVersion").isIntegralNumber() && metadata.path("schemaVersion").asInt()==2 && metadata.path("sequence").isIntegralNumber() && metadata.path("sequence").canConvertToLong(),"仅接收v2签名发布清单");long sequence=metadata.path("sequence").asLong();check(sequence>0 && sequence<=9007199254740991L,"清单序号无效");
        Instant issued,expires;
        try {issued=Instant.parse(metadata.path("issuedAt").asText());expires=Instant.parse(metadata.path("expiresAt").asText());}catch(Exception error){throw exception0(400,"清单时间格式无效");}
        check(issued.isBefore(Instant.now().plusSeconds(300)) && expires.isAfter(Instant.now()) && expires.isAfter(issued) && Duration.between(issued,expires).compareTo(Duration.ofDays(30))<=0,"清单已过期或有效期超出30天");
        JsonNode target=metadata.path("target");String architecture=target.path("architecture").asText(),channel=target.path("channel").asText();
        check(architecture.matches("[a-z0-9][a-z0-9-]{0,31}") && channel.matches("[a-z0-9][a-z0-9-]{0,31}") && "android".equals(target.path("platform").asText()) && text(application,"app_id").equals(target.path("appId").asText()) && text(application,"package_name").equals(target.path("packageName").asText()),"清单目标与应用不匹配");
        check(metadata.has("release"),"缺少发布内容");JsonNode release=metadata.get("release");Long version=null;String versionName=null,notes="停止提供更新";
        if (!release.isNull()) {
            version=release.path("versionCode").asLong();versionName=release.path("versionName").asText();notes=release.path("notes").asText();
            check(release.path("versionCode").isIntegralNumber() && version>0 && version<=2100000000L && !versionName.isBlank() && versionName.length()<=64 && notes.length()<=1000,"版本字段无效");
            check(release.path("appId").asText().equals(text(application,"app_id")) && release.path("platform").asText().equals("android") && release.path("architecture").asText().equals(architecture) && release.path("channel").asText().equals(channel),"版本目标与清单不一致");
            check(!release.path("id").asText().isBlank() && release.path("mandatory").isBoolean() && release.path("minBaseVersionCode").isIntegralNumber() && release.path("minBaseVersionCode").canConvertToInt() && release.path("minBaseVersionCode").asInt()>=0,"版本策略字段无效");
            try { Instant.parse(release.path("publishedAt").asText()); }catch(Exception error){throw exception0(400,"版本发布时间无效");}
            JsonNode artifact=release.path("artifact");String hash=artifact.path("sha256").asText();check(hash.matches("[a-f0-9]{64}") && artifact.path("bytes").isIntegralNumber() && artifact.path("bytes").canConvertToLong() && "apk".equals(artifact.path("type").asText()) && text(application,"package_name").equals(artifact.path("packageName").asText()),"安装包元数据无效");
            String filename=version+"-"+hash+".apk";String expected=text(application,"artifact_base_url")+"/"+text(application,"package_name")+"/apk/"+filename;
            check(expected.equals(artifact.path("url").asText()),"安装包地址不是该应用已登记的不可变地址");
            Path file=packageDirectory(text(application,"package_name")).resolve(filename);
            check(Files.isRegularFile(file) && !Files.isSymbolicLink(file) && Files.size(file)==artifact.path("bytes").asLong() && hash.equals(sha256(file)),"安装包缺失或哈希/长度不匹配");
        }
        String envelope=json.writeValueAsString(Map.of("payload",payload,"signature",signature));
        return insert("INSERT INTO infra_app_release(application_id,architecture,channel,sequence,version_code,version_name,notes,issued_at,expires_at,manifest,creator) VALUES (?,?,?,?,?,?,?,?,?,?,?)",applicationId,architecture,channel,sequence,version,versionName,notes,issued.toEpochMilli(),expires.toEpochMilli(),envelope,actor);
    }
    @Transactional
    public void publish(long id,String actor) throws Exception {
        var rows=db.queryForList("SELECT * FROM infra_app_release WHERE id=?",id);check(!rows.isEmpty(),"版本记录不存在");var release=rows.get(0);long applicationId=((Number)release.get("application_id")).longValue();
        db.queryForObject("SELECT id FROM infra_release_application WHERE id=? FOR UPDATE",Long.class,applicationId);
        check("DRAFT".equals(release.get("state")),"仅草稿允许发布");
        check(((Number)release.get("expires_at")).longValue()>System.currentTimeMillis(),"清单已过期");
        if (release.get("version_code")!=null) {
            JsonNode metadata=json.readTree(json.readTree(text(release,"manifest")).path("payload").asText());
            JsonNode artifact=metadata.path("release").path("artifact");var application=app(applicationId);
            Path file=packageDirectory(text(application,"package_name")).resolve(release.get("version_code")+"-"+artifact.path("sha256").asText()+".apk");
            check(Files.isRegularFile(file) && !Files.isSymbolicLink(file) && Files.size(file)==artifact.path("bytes").asLong() && artifact.path("sha256").asText().equals(sha256(file)),"发布前安装包复核失败");
        }
        var maxima=db.queryForMap("SELECT COALESCE(MAX(sequence),0) AS sequence,COALESCE(MAX(version_code),0) AS version FROM infra_app_release WHERE application_id=? AND architecture=? AND channel=? AND state<>'DRAFT'",applicationId,release.get("architecture"),release.get("channel"));
        check(((Number)release.get("sequence")).longValue()>((Number)maxima.get("sequence")).longValue(),"清单序号必须高于已发布历史，不能回滚");
        if (release.get("version_code")!=null) {
            long version=((Number)release.get("version_code")).longValue(),highest=((Number)maxima.get("version")).longValue();
            check(version>=highest,"版本号不能低于已发布历史");
            if(version==highest) {
                var previous=db.queryForList("SELECT manifest FROM infra_app_release WHERE application_id=? AND architecture=? AND channel=? AND state<>'DRAFT' AND version_code=? ORDER BY sequence DESC LIMIT 1",applicationId,release.get("architecture"),release.get("channel"),version);
                check(!previous.isEmpty(),"找不到续期版本");
                JsonNode oldData=json.readTree(json.readTree(text(previous.get(0),"manifest")).path("payload").asText()).path("release");
                JsonNode newData=json.readTree(json.readTree(text(release,"manifest")).path("payload").asText()).path("release");
                check(oldData.path("versionName").equals(newData.path("versionName")),"同版本续期不能替换版本名称");
                for(String field:List.of("sha256","bytes","url","packageName","type"))check(oldData.path("artifact").path(field).equals(newData.path("artifact").path(field)),"同版本续期不能替换安装包");
            }
        }
        db.update("UPDATE infra_app_release SET state='SUPERSEDED' WHERE application_id=? AND architecture=? AND channel=? AND state='PUBLISHED'",applicationId,release.get("architecture"),release.get("channel"));
        check(db.update("UPDATE infra_app_release SET state='PUBLISHED',publisher=?,published_at=CURRENT_TIMESTAMP WHERE id=? AND state='DRAFT'",actor,id)==1,"版本状态已变化，请重试");
    }
    public PublicManifest publicManifest(String packageName,String architecture,String channel) {
        var apps=db.queryForList("SELECT id FROM infra_release_application WHERE package_name=?",packageName);if(apps.isEmpty())return new PublicManifest(false,null);
        var rows=db.queryForList("SELECT manifest,expires_at FROM infra_app_release WHERE application_id=? AND architecture=? AND channel=? AND state='PUBLISHED'",apps.get(0).get("id"),architecture,channel);
        if(rows.isEmpty())return new PublicManifest(false,null);
        var release=rows.get(0);if(((Number)release.get("expires_at")).longValue()<=System.currentTimeMillis())throw new ResponseStatusException(GONE,"release metadata expired");
        return new PublicManifest(true,text(release,"manifest"));
    }
}
