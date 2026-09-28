package com.example.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        // 强制优先走 IPv4：本机有多块虚拟网卡（VMware 等），IPv6 选路异常时
        // 对外 HTTPS 请求（智谱/OCR）会先卡在 v6 直到超时才回退，导致接口偶发超时
        System.setProperty("java.net.preferIPv4Stack", "true");
        SpringApplication.run(BackendApplication.class, args);
    }
}
