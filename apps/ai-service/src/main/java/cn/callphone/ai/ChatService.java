package cn.callphone.ai;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.publisher.Sinks;
import reactor.core.scheduler.Schedulers;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static cn.callphone.ai.Protocol.*;

/** Single-instance persistent state owner. No dependencies on CRM tables or Yudao services. */
@Service
public final class ChatService {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ContentCipher cipher;
    private final ModelGateway model;
    private final AiSettings settings;
    private final Map<String,Run> live = new HashMap<>();
    private final Map<String,Deque<Instant>> rate = new HashMap<>();
    private static final String SYSTEM = "你是工作助手。根据用户主动提供的文字回答；没有读取客户系统或待办数据。不要虚构已执行操作或客户事实。";
    private record RequestRow(Actor actor,String id,String conversation,String userMessage,String assistantMessage,
                              String fingerprint,String status,int sequence,String errorCode) {}
    private static final class Run {
        final RequestRow row;
        final Sinks.Many<Map<String,Object>> events=Sinks.many().replay().all();
        final StringBuilder content=new StringBuilder();
        int sequence=1,inputTokens,outputTokens;
        boolean terminal;
        Disposable subscription;
        Run(RequestRow row) { this.row=row; }
    }
    public ChatService(JdbcTemplate db,TransactionTemplate tx,ContentCipher cipher,ModelGateway model,AiSettings settings) {
        this.db=db; this.tx=tx; this.cipher=cipher; this.model=model; this.settings=settings;
    }
    @PostConstruct public synchronized void recover() {
        tx.executeWithoutResult(status -> {
            db.update("UPDATE messages SET status='error',error_code='AI_INTERRUPTED' WHERE status IN ('pending','streaming')");
            db.update("UPDATE requests SET status='failed',error_code='AI_INTERRUPTED',sequence_no=sequence_no+1 WHERE status='running'");
        });
    }
    private static String now() { return new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(Instant.now()); }
    private long nextId() { return db.queryForObject("SELECT NEXT VALUE FOR ai_id",Long.class); }
    private static void uuid(String id) {
        try { if(id==null || !UUID.fromString(id).toString().equalsIgnoreCase(id)) throw invalid("幂等标识必须为 UUID"); }
        catch(IllegalArgumentException e) { throw invalid("幂等标识必须为 UUID"); }
    }
    private static long id(String id) {
        try { long value=Long.parseLong(id); if(value<=0) throw invalid("编号无效"); return value; }
        catch(RuntimeException e) { throw invalid("编号无效"); }
    }
    private List<Map<String,Object>> conversations(Actor actor,String condition,Object... extra) {
        List<Object> args=new ArrayList<>(List.of(actor.tenant(),actor.user())); args.addAll(Arrays.asList(extra));
        return db.query("SELECT * FROM conversations WHERE tenant_id=? AND user_id=? "+condition,
            (rs,n) -> conversation(rs),args.toArray());
    }
    private Map<String,Object> conversation(ResultSet rs) throws SQLException {
        return Map.of("id",rs.getString("id"),"title",cipher.decrypt(rs.getString("title_cipher")),
            "created_at",rs.getString("created_at"),"updated_at",rs.getString("updated_at"));
    }
    private Map<String,Object> owned(Actor actor,String conversation) {
        List<Map<String,Object>> rows=conversations(actor,"AND id=? AND deleted=FALSE",id(conversation));
        if(rows.isEmpty()) throw missing();
        return rows.getFirst();
    }
    public synchronized Map<String,Object> create(Actor actor,String key) {
        uuid(key);
        return tx.execute(status -> {
            List<Long> previous=db.query("SELECT conversation_id FROM conversation_creates WHERE tenant_id=? AND user_id=? AND device_id=? AND request_id=?",
                (rs,n)->rs.getLong(1),actor.tenant(),actor.user(),actor.device(),key);
            if(!previous.isEmpty()) return owned(actor,previous.getFirst().toString());
            long id=nextId(); String time=now();
            db.update("INSERT INTO conversations(id,tenant_id,user_id,title_cipher,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                id,actor.tenant(),actor.user(),cipher.encrypt("新会话"),time,time);
            db.update("INSERT INTO conversation_creates VALUES(?,?,?,?,?)",actor.tenant(),actor.user(),actor.device(),key,id);
            return owned(actor,Long.toString(id));
        });
    }
    public synchronized Map<String,Object> list(Actor actor,String cursor,int limit) {
        limit=Math.clamp(limit,1,100);
        List<Map<String,Object>> rows;
        if(cursor!=null && !cursor.isBlank()) {
            String[] parts;
            try { parts=new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split(",",-1);
                if(parts.length!=2) throw new IllegalArgumentException(); Instant.parse(parts[0]); id(parts[1]);
            } catch(Exception e) { throw invalid("分页游标无效"); }
            rows=conversations(actor,"AND deleted=FALSE AND (updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC,id DESC LIMIT ?",
                parts[0],parts[0],id(parts[1]),limit+1);
        } else rows=conversations(actor,"AND deleted=FALSE ORDER BY updated_at DESC,id DESC LIMIT ?",limit+1);
        String next=null;
        if(rows.size()>limit) {
            rows=new ArrayList<>(rows.subList(0,limit)); var last=rows.getLast();
            next=Base64.getUrlEncoder().withoutPadding().encodeToString((last.get("updated_at")+","+last.get("id")).getBytes(StandardCharsets.UTF_8));
        }
        return page(rows,next);
    }
    private static Map<String,Object> page(List<Map<String,Object>> rows,String next) {
        Map<String,Object> result=new LinkedHashMap<>(); result.put("items",rows); result.put("next_cursor",next); return result;
    }
    private Map<String,Object> message(ResultSet rs) throws SQLException {
        Map<String,Object> result=new LinkedHashMap<>();
        for(String field:List.of("id","role","status","created_at","request_id")) result.put(field,rs.getString(field));
        result.put("content",cipher.decrypt(rs.getString("content_cipher")));
        if(rs.getString("error_code")!=null) result.put("error_message",failureMessage(rs.getString("error_code")));
        return result;
    }
    private List<Map<String,Object>> messageRows(String conversation,long before,int limit) {
        return db.query("SELECT * FROM messages WHERE conversation_id=? AND id<? ORDER BY id DESC LIMIT ?",
            (rs,n)->message(rs),id(conversation),before,limit);
    }
    public synchronized Map<String,Object> messages(Actor actor,String conversation,String cursor,int limit) {
        owned(actor,conversation); limit=Math.clamp(limit,1,100);
        List<Map<String,Object>> rows=messageRows(conversation,cursor==null || cursor.isBlank()?Long.MAX_VALUE:id(cursor),limit+1);
        String next=null;
        if(rows.size()>limit) { rows=new ArrayList<>(rows.subList(0,limit)); next=(String)rows.getLast().get("id"); }
        Collections.reverse(rows);
        var result=page(rows,next);
        List<String> running=db.query("SELECT request_id FROM requests WHERE conversation_id=? AND status='running' AND device_id=?",
            (rs,n)->rs.getString(1),id(conversation),actor.device());
        result.put("active_request_id",running.isEmpty()?null:running.getFirst());
        result.put("busy",db.queryForObject("SELECT COUNT(*) FROM requests WHERE conversation_id=? AND status='running'",Integer.class,id(conversation))>0);
        return result;
    }
    public synchronized Map<String,Object> delete(Actor actor,String conversation) {
        if(conversations(actor,"AND id=?",id(conversation)).isEmpty()) throw missing();
        for(Run run:new ArrayList<>(live.values())) if(run.row.conversation().equals(conversation)) finish(run,"cancelled",null);
        tx.executeWithoutResult(status -> {
            db.update("UPDATE conversations SET deleted=TRUE,title_cipher=? WHERE id=?",cipher.encrypt(""),id(conversation));
            db.update("DELETE FROM messages WHERE conversation_id=?",id(conversation));
        });
        return Map.of("deleted",true);
    }
    private RequestRow row(ResultSet rs) throws SQLException {
        return new RequestRow(new Actor(rs.getString("tenant_id"),rs.getString("user_id"),rs.getString("device_id")),
            rs.getString("request_id"),rs.getString("conversation_id"),rs.getString("user_message_id"),rs.getString("assistant_message_id"),
            rs.getString("fingerprint"),rs.getString("status"),rs.getInt("sequence_no"),rs.getString("error_code"));
    }
    private RequestRow requestRow(Actor actor,String request) {
        List<RequestRow> rows=db.query("SELECT * FROM requests WHERE tenant_id=? AND user_id=? AND device_id=? AND request_id=?",
            (rs,n)->row(rs),actor.tenant(),actor.user(),actor.device(),request);
        return rows.isEmpty()?null:rows.getFirst();
    }
    private static String runKey(Actor actor,String request) { return actor.tenant()+":"+actor.user()+":"+actor.device()+":"+request; }
    public synchronized Map<String,Object> status(Actor actor,String request) {
        RequestRow row=requestRow(actor,request); if(row==null) throw missing(); owned(actor,row.conversation());
        return Map.of("request_id",row.id(),"conversation_id",row.conversation(),"status",row.status(),"assistant_message_id",row.assistantMessage());
    }
    public synchronized Map<String,Object> cancel(Actor actor,String request,String key) {
        uuid(key); RequestRow row=requestRow(actor,request); if(row==null) throw missing(); owned(actor,row.conversation());
        Run run=live.get(runKey(actor,request)); if(run!=null) finish(run,"cancelled",null);
        return status(actor,request);
    }
    private void rateLimit(Actor actor) {
        Instant cutoff=Instant.now().minusSeconds(60);
        rate.values().forEach(queue -> { while(!queue.isEmpty() && queue.getFirst().isBefore(cutoff)) queue.removeFirst(); });
        rate.entrySet().removeIf(entry -> entry.getValue().isEmpty());
        Deque<Instant> queue=rate.computeIfAbsent(actor.tenant()+":"+actor.user(),ignored -> new ArrayDeque<>());
        long own=live.values().stream().filter(r->r.row.actor().tenant().equals(actor.tenant()) && r.row.actor().user().equals(actor.user())).count();
        if(live.size()>=settings.maxConcurrent() || own>=2 || queue.size()>=settings.requestsPerMinute())
            throw new Problem("RATE_LIMITED","请求较多，请稍后再试",429);
        queue.addLast(Instant.now());
    }
    public synchronized Flux<ServerSentEvent<Map<String,Object>>> send(Actor actor,Send input,String key) {
        uuid(key); uuid(input.request_id());
        if(!key.equals(input.request_id())) throw invalid("请求标识与幂等标识不一致");
        String content=input.content().strip();
        if(content.isEmpty() || content.codePointCount(0,content.length())>2000) throw invalid("单条问题需为 1–2000 字");
        owned(actor,input.conversation_id());
        String fingerprint=cipher.fingerprint(input.conversation_id()+"\n"+Objects.toString(input.retry_of(),"")+"\n"+content);
        RequestRow previous=requestRow(actor,key);
        if(previous!=null) {
            if(!previous.fingerprint().equals(fingerprint)) throw new Problem("IDEMPOTENCY_CONFLICT","同一请求标识不能用于不同内容",409);
            Run current=live.get(runKey(actor,key));
            return stream(current==null?snapshot(previous):current.events.asFlux());
        }
        model.checkAvailable();
        if(db.queryForObject("SELECT COUNT(*) FROM requests WHERE conversation_id=? AND status='running'",Integer.class,id(input.conversation_id()))>0)
            throw new Problem("CHAT_BUSY","此会话正在生成回复",409);
        // Validate regeneration before charging the rate limit or resetting an answer.
        List<Map<String,Object>> latest=messageRows(input.conversation_id(),Long.MAX_VALUE,2);
        long userId,assistantId;
        if(input.retry_of()!=null) {
            if(latest.size()!=2 || !input.retry_of().equals(latest.getFirst().get("id"))
                || !"assistant".equals(latest.getFirst().get("role")) || !"user".equals(latest.getLast().get("role"))
                || !content.equals(latest.getLast().get("content"))) throw invalid("只能重新生成最后一轮回复");
            userId=id((String)latest.getLast().get("id")); assistantId=id(input.retry_of());
        } else { userId=nextId(); assistantId=nextId(); }
        List<ModelGateway.Turn> turns=history(input.conversation_id(),input.retry_of(),content);
        rateLimit(actor);
        String time=now();
        RequestRow row=new RequestRow(actor,key,input.conversation_id(),Long.toString(userId),Long.toString(assistantId),fingerprint,"running",1,null);
        tx.executeWithoutResult(status -> {
            if(input.retry_of()==null) {
                db.update("INSERT INTO messages(id,conversation_id,role,content_cipher,status,created_at,request_id) VALUES(?,?,?,?,?,?,?)",
                    userId,id(input.conversation_id()),"user",cipher.encrypt(content),"complete",time,key);
                db.update("INSERT INTO messages(id,conversation_id,role,content_cipher,status,created_at,request_id) VALUES(?,?,?,?,?,?,?)",
                    assistantId,id(input.conversation_id()),"assistant",cipher.encrypt(""),"pending",time,key);
            } else db.update("UPDATE messages SET content_cipher=?,status='pending',request_id=?,error_code=NULL WHERE id=?",cipher.encrypt(""),key,assistantId);
            if(latest.isEmpty()) {
                String title=content.substring(0,content.offsetByCodePoints(0,Math.min(18,content.codePointCount(0,content.length()))));
                db.update("UPDATE conversations SET title_cipher=? WHERE id=?",cipher.encrypt(title),id(input.conversation_id()));
            }
            db.update("UPDATE conversations SET updated_at=? WHERE id=?",time,id(input.conversation_id()));
            db.update("INSERT INTO requests(tenant_id,user_id,device_id,request_id,conversation_id,user_message_id,assistant_message_id,fingerprint,status,sequence_no,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                actor.tenant(),actor.user(),actor.device(),key,id(input.conversation_id()),userId,assistantId,fingerprint,"running",1,time);
        });
        Run run=new Run(row); live.put(runKey(actor,key),run);
        run.events.tryEmitNext(started(row,1));
        run.subscription=Flux.defer(() -> model.stream(turns)).timeout(Duration.ofSeconds(60))
            .takeUntilOther(Mono.delay(Duration.ofSeconds(settings.generationSeconds())).flatMap(v -> Mono.error(new IllegalStateException("generation timeout"))))
            .subscribeOn(Schedulers.boundedElastic()).publishOn(Schedulers.boundedElastic(),1).subscribe(chunk -> delta(run,chunk),failure -> fail(run),() -> complete(run));
        return stream(run.events.asFlux());
    }
    private List<ModelGateway.Turn> history(String conversation,String retry,String content) {
        List<Map<String,Object>> rows=messageRows(conversation,retry==null?Long.MAX_VALUE:id(retry)-1,settings.maxContextMessages());
        List<ModelGateway.Turn> result=new ArrayList<>(); int chars=content.length()+SYSTEM.length();
        for(var message:rows) {
            String text=(String)message.get("content");
            if(text.isEmpty()) continue;
            if(chars+text.length()>settings.maxContextChars()) break;
            result.add(new ModelGateway.Turn((String)message.get("role"),text)); chars+=text.length();
        }
        Collections.reverse(result);
        while(!result.isEmpty() && !result.getFirst().role().equals("user")) result.removeFirst();
        result.addFirst(new ModelGateway.Turn("system",SYSTEM)); result.add(new ModelGateway.Turn("user",content));
        return result;
    }
    private static Map<String,Object> event(RequestRow row,int sequence,String type) {
        Map<String,Object> event=new LinkedHashMap<>(); event.put("type",type); event.put("request_id",row.id());
        event.put("conversation_id",row.conversation()); event.put("sequence",sequence); event.put("assistant_message_id",row.assistantMessage()); return event;
    }
    private static Map<String,Object> started(RequestRow row,int sequence) {
        var event=event(row,sequence,"started"); event.put("user_message_id",row.userMessage()); return event;
    }
    private Flux<Map<String,Object>> snapshot(RequestRow row) {
        String content=db.queryForObject("SELECT content_cipher FROM messages WHERE id=?",String.class,id(row.assistantMessage()));
        // A regenerated answer belongs to a newer request: never replay its text as an older attempt.
        String current=db.queryForObject("SELECT request_id FROM messages WHERE id=?",String.class,id(row.assistantMessage()));
        if(!row.id().equals(current)) throw new Problem("IDEMPOTENCY_CONFLICT","此回复已经重新生成，请刷新会话",409);
        var terminal=event(row,Math.max(2,row.sequence()),row.status().equals("failed")?"failed":"completed");
        if(row.status().equals("failed")) { terminal.put("code",row.errorCode()); terminal.put("message",failureMessage(row.errorCode())); }
        else { terminal.put("content",cipher.decrypt(content)); terminal.put("finish_reason",row.status().equals("cancelled")?"cancelled":"stop"); }
        // Failed replays also expose the persisted partial reply before their failure event.
        var delta=event(row,2,"delta"); delta.put("delta",cipher.decrypt(content));
        terminal.put("sequence",Math.max(3,row.sequence()));
        return Flux.just(started(row,1),delta,terminal);
    }
    private static Flux<ServerSentEvent<Map<String,Object>>> stream(Flux<Map<String,Object>> source) {
        var events=source.map(e -> ServerSentEvent.<Map<String,Object>>builder(e).event((String)e.get("type"))
            .id(e.get("request_id")+":"+e.get("sequence")).build());
        return events.mergeWith(Flux.interval(Duration.ofSeconds(15)).map(t -> ServerSentEvent.<Map<String,Object>>builder().comment("ping").build()))
            .takeUntil(e -> e.data()!=null && Set.of("completed","failed").contains(e.data().get("type")));
    }
    private synchronized void delta(Run run,ModelGateway.Chunk chunk) {
        if(run.terminal) return;
        run.inputTokens=Math.max(run.inputTokens,chunk.inputTokens()); run.outputTokens=Math.max(run.outputTokens,chunk.outputTokens());
        if(chunk.text().isEmpty()) return;
        if(run.content.length()+chunk.text().length()>settings.maxReplyChars()) { finish(run,"failed","OUTPUT_LIMIT"); return; }
        run.content.append(chunk.text());
        ++run.sequence;
        tx.executeWithoutResult(transaction -> {
            db.update("UPDATE messages SET content_cipher=?,status='streaming' WHERE id=?",cipher.encrypt(run.content.toString()),id(run.row.assistantMessage()));
            db.update("UPDATE requests SET sequence_no=? WHERE tenant_id=? AND user_id=? AND device_id=? AND request_id=?",
                run.sequence,run.row.actor().tenant(),run.row.actor().user(),run.row.actor().device(),run.row.id());
        });
        var event=event(run.row,run.sequence,"delta"); event.put("delta",chunk.text()); run.events.tryEmitNext(event);
    }
    private synchronized void complete(Run run) {
        if(!run.terminal) finish(run,run.content.isEmpty()?"failed":"complete",run.content.isEmpty()?"AI_EMPTY_REPLY":null);
    }
    private synchronized void fail(Run run) { if(!run.terminal) finish(run,"failed","AI_UNAVAILABLE"); }
    private void finish(Run run,String status,String errorCode) {
        if(run.terminal) return;
        run.terminal=true; ++run.sequence;
        if(run.subscription!=null) run.subscription.dispose();
        tx.executeWithoutResult(transaction -> {
            db.update("UPDATE messages SET content_cipher=?,status=?,error_code=? WHERE id=?",cipher.encrypt(run.content.toString()),
                status.equals("cancelled")?"stop":status.equals("failed")?"error":"complete",errorCode,id(run.row.assistantMessage()));
            db.update("UPDATE requests SET status=?,sequence_no=?,input_tokens=?,output_tokens=?,error_code=? WHERE tenant_id=? AND user_id=? AND device_id=? AND request_id=?",
                status,run.sequence,run.inputTokens,run.outputTokens,errorCode,run.row.actor().tenant(),run.row.actor().user(),run.row.actor().device(),run.row.id());
            db.update("UPDATE conversations SET updated_at=? WHERE id=?",now(),id(run.row.conversation()));
        });
        var terminal=event(run.row,run.sequence,status.equals("failed")?"failed":"completed");
        if(status.equals("failed")) { terminal.put("code",errorCode); terminal.put("message",failureMessage(errorCode)); }
        else { terminal.put("content",run.content.toString()); terminal.put("finish_reason",status.equals("cancelled")?"cancelled":"stop"); }
        run.events.tryEmitNext(terminal); run.events.tryEmitComplete(); live.remove(runKey(run.row.actor(),run.row.id()));
    }
    private static String failureMessage(String code) {
        return switch(Objects.toString(code,"")) {
            case "AI_INTERRUPTED" -> "服务重启导致生成中断，已保留部分回复";
            case "OUTPUT_LIMIT" -> "回复达到长度上限，已保留生成内容";
            case "AI_EMPTY_REPLY" -> "模型未返回文字，请重试";
            default -> "AI 回复暂时不可用，已保留生成内容";
        };
    }
    @PreDestroy public synchronized void shutdown() {
        for(Run run:new ArrayList<>(live.values())) finish(run,"failed","AI_INTERRUPTED");
    }
}
