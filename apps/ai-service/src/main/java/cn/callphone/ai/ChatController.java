package cn.callphone.ai;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import reactor.core.publisher.Flux;
import java.util.Map;
import static cn.callphone.ai.Protocol.*;
import static cn.callphone.ai.InternalAuthentication.actor;

@RestController
@RequestMapping("/internal/v1/ai")
public final class ChatController {
    private final ChatService service;
    public ChatController(ChatService service) {this.service=service;}
    private static Map<String,Object> data(Object value) {return Map.of("data",value);}
    @PostMapping("/conversations") public Map<String,Object> create(HttpServletRequest request,@RequestHeader("Idempotency-Key") String key) {
        return data(service.create(actor(request),key));
    }
    @GetMapping("/conversations") public Map<String,Object> list(HttpServletRequest request,@RequestParam(required=false) String cursor,@RequestParam(defaultValue="20") int limit) {
        return data(service.list(actor(request),cursor,limit));
    }
    @GetMapping("/conversations/{id}/messages") public Map<String,Object> messages(HttpServletRequest request,@PathVariable String id,
        @RequestParam(required=false) String cursor,@RequestParam(defaultValue="50") int limit) {
        return data(service.messages(actor(request),id,cursor,limit));
    }
    @PostMapping("/conversations/{id}/transcripts") public Map<String,Object> transcript(HttpServletRequest request,
        @PathVariable String id, @RequestBody @Valid Transcript input, @RequestHeader("Idempotency-Key") String key) {
        return data(service.transcript(actor(request),id,input,key));
    }
    @DeleteMapping("/conversations/{id}") public Map<String,Object> delete(HttpServletRequest request,@PathVariable String id) {
        return data(service.delete(actor(request),id));
    }
    @PostMapping(value="/messages/stream",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<Map<String,Object>>> send(HttpServletRequest request,HttpServletResponse response,
        @RequestBody @Valid Send input,@RequestHeader("Idempotency-Key") String key) {
        response.setHeader("X-Accel-Buffering","no");
        return service.send(actor(request),input,key);
    }
    @GetMapping("/requests/{id}") public Map<String,Object> status(HttpServletRequest request,@PathVariable String id) {
        return data(service.status(actor(request),id));
    }
    @PostMapping("/requests/{id}/cancel") public Map<String,Object> cancel(HttpServletRequest request,@PathVariable String id,@RequestHeader("Idempotency-Key") String key) {
        return data(service.cancel(actor(request),id,key));
    }
}

@RestControllerAdvice
class ChatErrors {
    @ExceptionHandler(Problem.class) ResponseEntity<?> problem(Problem e) {return ResponseEntity.status(e.status).body(error(e.code,e.getMessage()));}
    @ExceptionHandler({MethodArgumentNotValidException.class,HttpMessageNotReadableException.class,
        org.springframework.web.bind.MissingRequestHeaderException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ResponseEntity<?> invalid() {return ResponseEntity.badRequest().body(error("VALIDATION_ERROR","请求格式不正确"));}
    @ExceptionHandler(Exception.class) ResponseEntity<?> unavailable() {return ResponseEntity.status(503).body(error("AI_UNAVAILABLE","AI 服务暂时不可用"));}
}
