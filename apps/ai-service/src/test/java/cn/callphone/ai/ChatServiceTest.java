package cn.callphone.ai;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.flywaydb.core.Flyway;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Sinks;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static cn.callphone.ai.Protocol.*;
import static org.junit.jupiter.api.Assertions.*;

class ChatServiceTest {
    ChatService service; JdbcTemplate db; ContentCipher cipher;
    final Actor actor=new Actor("1","7","10");
    final AtomicInteger calls=new AtomicInteger();
    Flux<ModelGateway.Chunk> output;
    boolean available=true;
    List<ModelGateway.Turn> turns;
    boolean webRequested;
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
        Flyway.configure().dataSource(ds).load().migrate(); db=new JdbcTemplate(ds);
        var settings=new AiSettings("i".repeat(32),Base64.getEncoder().encodeToString(new byte[32]),"key","https://example.test","model","/v1/chat/completions",1024,12,12000,32000,8,100,180,true,"");
        cipher=new ContentCipher(settings);
        output=Flux.just(new ModelGateway.Chunk("你好",10,3));
        var model=new ModelGateway() {
            public void checkAvailable() {if(!available) throw new Problem("AI_UNAVAILABLE","未配置",503);}
            public Flux<Chunk> stream(List<Turn> history) {calls.incrementAndGet();turns=history;return output;}
            public Flux<Chunk> stream(List<Turn> history,boolean web,Actor identity) { assertEquals(actor,identity); webRequested=web; return stream(history); }
        };
        service=new ChatService(db,new TransactionTemplate(new DataSourceTransactionManager(ds)),cipher,model,settings); service.recover();
    }
    @AfterEach void close() {service.shutdown();}
    String conversation() {return (String)service.create(actor,UUID.randomUUID().toString()).get("id");}
    Send input(String conv,String content) {return new Send(UUID.randomUUID().toString(),conv,content,null);}
    List<Map<String,Object>> finish(Send input) {return service.send(actor,input,input.request_id()).map(e->e.data()).filter(Objects::nonNull).collectList().block(Duration.ofSeconds(5));}
    @Test void voiceTranscriptsAreEncryptedIdempotentOwnedAndDoNotGenerate() {
        String conv=conversation(), key=UUID.randomUUID().toString();
        var input=new Transcript(key,"user","语音测试内容");
        service.transcript(actor,conv,input,key); service.transcript(actor,conv,input,key);
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM messages",Integer.class));
        assertEquals(0,calls.get());
        assertFalse(db.queryForObject("SELECT content_cipher FROM messages",String.class).contains("语音测试内容"));
        assertEquals("语音：语音测试内容",((List<Map<String,Object>>)service.list(actor,null,20).get("items")).getFirst().get("title"));
        assertThrows(Problem.class,()->service.transcript(new Actor("1","8","11"),conv,input,key));
        assertThrows(Problem.class,()->service.transcript(actor,conv,new Transcript(key,"user","不同内容"),key));
        String reply=UUID.randomUUID().toString();
        service.transcript(actor,conv,new Transcript(reply,"assistant","语音回复"),reply);
        assertEquals(2,((List<?>)service.messages(actor,conv,null,20).get("items")).size());
        service.delete(actor,conv);
        assertThrows(Problem.class,()->service.transcript(actor,conv,input,key));
    }
    @Test void webModeIsIdempotentAndSearchProgressNeverPollutesPersistedAnswer() {
        output=Flux.just(new ModelGateway.Chunk("",0,0,"searching"),new ModelGateway.Chunk("联网回答及来源",2,3));
        var input=new Send(UUID.randomUUID().toString(),conversation(),"联网查询",null,true);
        var events=finish(input); assertTrue(webRequested);
        assertEquals(List.of("started","activity","delta","completed"),events.stream().map(e->e.get("type")).toList());
        assertEquals("联网回答及来源",events.getLast().get("content")); finish(input); assertEquals(1,calls.get());
        assertThrows(Problem.class,()->finish(new Send(input.request_id(),input.conversation_id(),input.content(),null,false)));
    }
    @Test void duplicateGenerationUsesOneProviderCallAndConflictsAreRejected() {
        var input=input(conversation(),"问题"); var events=finish(input);
        assertEquals(List.of("started","delta","completed"),events.stream().map(e->e.get("type")).toList());
        finish(input); assertEquals(1,calls.get());
        var changed=new Send(input.request_id(),input.conversation_id(),"其他问题",null);
        assertEquals("IDEMPOTENCY_CONFLICT",assertThrows(Problem.class,()->finish(changed)).code);
        assertEquals("complete",service.status(actor,input.request_id()).get("status"));
        assertEquals(10,db.queryForObject("SELECT input_tokens FROM requests",Integer.class));
    }
    @Test void concurrentDuplicateSubscribesToExistingRunAndBusyRejectsNewAttempt() throws Exception {
        var sink=Sinks.many().unicast().<ModelGateway.Chunk>onBackpressureBuffer(); output=sink.asFlux();
        var input=input(conversation(),"问题"); var first=service.send(actor,input,input.request_id());
        var second=service.send(actor,input,input.request_id());
        for(int i=0;i<100 && calls.get()==0;i++) Thread.sleep(5);
        assertEquals(1,calls.get());
        var next=input(input.conversation_id(),"另一个问题");
        assertEquals("CHAT_BUSY",assertThrows(Problem.class,()->service.send(actor,next,next.request_id())).code);
        var one=first.filter(e->e.data()!=null).collectList().toFuture();var two=second.filter(e->e.data()!=null).collectList().toFuture();
        sink.tryEmitNext(new ModelGateway.Chunk("部分",1,1));sink.tryEmitComplete();
        assertEquals(one.get().size(),two.get().size());assertEquals(1,calls.get());
    }
    @Test void cancelIsPersistentIdempotentAndKeepsPartialText() throws Exception {
        var sink=Sinks.many().unicast().<ModelGateway.Chunk>onBackpressureBuffer(); output=sink.asFlux();
        var received=new java.util.concurrent.CountDownLatch(1);
        var input=input(conversation(),"问题");var events=service.send(actor,input,input.request_id()).filter(e->e.data()!=null)
            .doOnNext(e -> {if("delta".equals(e.data().get("type"))) received.countDown();}).collectList().toFuture();
        for(int i=0;i<100 && calls.get()==0;i++) Thread.sleep(5);
        sink.tryEmitNext(new ModelGateway.Chunk("部分回答",1,1));
        assertTrue(received.await(5,java.util.concurrent.TimeUnit.SECONDS));
        service.cancel(actor,input.request_id(),UUID.randomUUID().toString());
        assertEquals("cancelled",service.cancel(actor,input.request_id(),UUID.randomUUID().toString()).get("status"));
        assertEquals("cancelled",events.get().getLast().data().get("finish_reason"));
        assertEquals("部分回答",cipher.decrypt(db.queryForObject("SELECT content_cipher FROM messages WHERE role='assistant'",String.class)));
        assertTrue(sink.currentSubscriberCount()==0);
    }
    @Test void regenerationReplacesLastAnswerWithoutDuplicatingTheUserTurn() {
        var first=input(conversation(),"问题");finish(first);
        String answer=(String)service.status(actor,first.request_id()).get("assistant_message_id");
        var retry=new Send(UUID.randomUUID().toString(),first.conversation_id(),"问题",answer); finish(retry);
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM messages",Integer.class));
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM requests",Integer.class));
        assertEquals(List.of("system","user"),turns.stream().map(ModelGateway.Turn::role).toList());
        assertThrows(Problem.class,()->finish(first));
        finish(input(first.conversation_id(),"继续"));
        assertThrows(Problem.class,()->service.send(actor,new Send(UUID.randomUUID().toString(),first.conversation_id(),"问题",answer),UUID.randomUUID().toString()));
    }
    @Test void tenantsUsersAndDevicesCannotAccessOthersState() {
        var first=input(conversation(),"私有问题");finish(first);
        for(Actor other:List.of(new Actor("2","7","10"),new Actor("1","8","10"))) {
            assertThrows(Problem.class,()->service.messages(other,first.conversation_id(),null,50));
            assertThrows(Problem.class,()->service.delete(other,first.conversation_id()));
        }
        assertThrows(Problem.class,()->service.status(new Actor("1","7","11"),first.request_id()));
        assertThrows(Problem.class,()->service.cancel(new Actor("1","7","11"),first.request_id(),UUID.randomUUID().toString()));
    }
    @Test void encryptedStorageAndCreateReplaySurviveServiceReconstruction() {
        String key=UUID.randomUUID().toString();var conv=service.create(actor,key);var input=input((String)conv.get("id"),"客户私密文字");finish(input);
        assertEquals(conv.get("id"),service.create(actor,key).get("id"));
        String stored=db.queryForObject("SELECT content_cipher FROM messages WHERE role='user'",String.class);
        assertFalse(stored.contains("客户私密文字"));assertEquals("客户私密文字",cipher.decrypt(stored));
        service.recover();assertEquals("complete",service.status(actor,input.request_id()).get("status"));
        assertEquals(conv.get("id"),service.create(actor,key).get("id"));
    }
    @Test void missingProviderConfigDoesNotCreateMessagesOrRequests() {
        available=false;var input=input(conversation(),"问题");assertThrows(Problem.class,()->finish(input));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM messages",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM requests",Integer.class));
    }
    @Test void upstreamFailureAndRestartKeepPartialReplyAndNeverLookSuccessful() {
        output=Flux.concat(Flux.just(new ModelGateway.Chunk("部分",0,0)),Flux.error(new IllegalStateException("provider secret")));
        var first=input(conversation(),"问题");var events=finish(first);
        assertEquals("failed",events.getLast().get("type"));assertFalse(events.toString().contains("provider secret"));
        assertEquals("部分",((Map<?,?>)((List<?>)service.messages(actor,first.conversation_id(),null,50).get("items")).getLast()).get("content"));
        db.update("UPDATE requests SET status='running'");db.update("UPDATE messages SET status='streaming' WHERE role='assistant'");service.recover();
        assertEquals("failed",service.status(actor,first.request_id()).get("status"));
        assertEquals("AI_INTERRUPTED",finish(first).getLast().get("code"));
    }
    @Test void paginationAndDeleteRemainScopedAndStable() {
        String conv=conversation();for(int i=0;i<4;i++) finish(input(conv,"问题"+i));
        var page=service.messages(actor,conv,null,3);var older=service.messages(actor,conv,(String)page.get("next_cursor"),3);
        assertEquals(3,((List<?>)page.get("items")).size());assertNotEquals(page.get("items"),older.get("items"));
        for(int i=0;i<4;i++) conversation();var list=service.list(actor,null,2);
        assertNotNull(list.get("next_cursor"));assertEquals(2,((List<?>)service.list(actor,(String)list.get("next_cursor"),2).get("items")).size());
        service.delete(actor,conv);assertEquals(Map.of("deleted",true),service.delete(actor,conv));
        assertThrows(Problem.class,()->service.messages(actor,conv,null,50));
    }
    @Test void unicodeLimitsAndHeaderMismatchRejectBeforeGeneration() {
        var conv=conversation();var over=input(conv,"😀".repeat(2001));assertThrows(Problem.class,()->finish(over));
        var input=input(conv,"你好");assertThrows(Problem.class,()->service.send(actor,input,UUID.randomUUID().toString()));
        assertEquals(0,calls.get());
    }

    @Test void otherDeviceSeesBusyConversationWithoutGainingCancellationRights() throws Exception {
        output=Flux.never();var first=input(conversation(),"问题");service.send(actor,first,first.request_id());
        var view=service.messages(new Actor("1","7","11"),first.conversation_id(),null,50);
        assertEquals(true,view.get("busy"));assertNull(view.get("active_request_id"));
        service.cancel(actor,first.request_id(),UUID.randomUUID().toString());
    }
    @Test void replyLimitAndUserConcurrencyBoundProviderWork() throws Exception {
        output=Flux.never();var one=input(conversation(),"一");var two=input(conversation(),"二");var three=input(conversation(),"三");
        service.send(actor,one,one.request_id());service.send(actor,two,two.request_id());
        assertEquals("RATE_LIMITED",assertThrows(Problem.class,()->service.send(actor,three,three.request_id())).code);
        service.cancel(actor,one.request_id(),UUID.randomUUID().toString());service.cancel(actor,two.request_id(),UUID.randomUUID().toString());
        output=Flux.just(new ModelGateway.Chunk("x".repeat(32001),0,0));var events=finish(three);
        assertEquals("OUTPUT_LIMIT",events.getLast().get("code"));assertEquals("failed",service.status(actor,three.request_id()).get("status"));
    }
}
