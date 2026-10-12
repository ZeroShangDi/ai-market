package cn.callphone.ai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AiSettings.class)
public class AiApplication {
    public static void main(String[] args) { SpringApplication.run(AiApplication.class, args); }
}
