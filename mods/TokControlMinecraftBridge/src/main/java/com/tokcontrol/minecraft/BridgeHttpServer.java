package com.tokcontrol.minecraft;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.bukkit.Bukkit;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class BridgeHttpServer {

    private final TokControlPlugin plugin;
    private final BlockActionService actions;
    private final String bridgeToken;
    private HttpServer server;
    private static final AtomicInteger pendingWinDelta = new AtomicInteger(0);

    public static void queueWinDelta(int delta) {
        if (delta == 0) return;
        pendingWinDelta.addAndGet(delta);
    }

    public static int consumeWinDelta() {
        return pendingWinDelta.getAndSet(0);
    }

    public static int peekWinDelta() {
        return pendingWinDelta.get();
    }

    public BridgeHttpServer(TokControlPlugin plugin, int port, BlockActionService actions, String bridgeToken) {
        this.plugin = plugin;
        this.actions = actions;
        this.bridgeToken = bridgeToken == null ? "" : bridgeToken.trim();
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
            server.setExecutor(Executors.newCachedThreadPool());
            server.createContext("/health", this::handleHealth);
            server.createContext("/win-delta", this::handleWinDelta);
            server.createContext("/", this::handleCommand);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public void start() {
        server.start();
        if (bridgeToken.isEmpty()) {
            plugin.getLogger().warning("bridge-token ว่าง — POST / และ /win-delta จะถูกปฏิเสธ (ตั้งใน config.yml)");
        } else {
            plugin.getLogger().info("HTTP bridge auth enabled (X-TokControl-Token)");
        }
    }

    public void stop() {
        if (server != null) server.stop(0);
    }

    /** health = อ่านสถานะได้อย่างเดียว ไม่ต้องมี token */
    private void handleHealth(HttpExchange ex) throws IOException {
        addCors(ex);
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return;
        }
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            send(ex, 405, "{\"success\":false}");
            return;
        }
        // Peek only — fish-status polls must not eat win deltas. Use /win-delta to consume.
        int winDelta = peekWinDelta();
        String tower = "";
        String fish = "";
        try {
            if (plugin.isTowerMode() && plugin.getTowerWarsService() != null && plugin.getTowerWarsService().isActive()) {
                String json = plugin.getTowerWarsService().statusJson();
                if (json.startsWith("{") && json.endsWith("}")) {
                    tower = ",\"tower\":" + json;
                }
            }
        } catch (Exception ignored) {}
        try {
            boolean fishActive = plugin.isFishMode();
            if (!fishActive && !Bukkit.getWorlds().isEmpty()) {
                fishActive = FishPierBuilder.isFishWorld(Bukkit.getWorlds().get(0));
            }
            if (fishActive && plugin.getFishControlService() != null) {
                String json = plugin.getFishControlService().statusJson();
                if (json.startsWith("{") && json.endsWith("}")) {
                    fish = ",\"fish\":" + json;
                }
            }
        } catch (Exception ignored) {}
        send(ex, 200, "{\"ok\":true,\"success\":true,\"mod\":\"TokControl_Minecraft\",\"pendingWinDelta\":" + winDelta + tower + fish + "}");
    }

    private void handleWinDelta(HttpExchange ex) throws IOException {
        addCors(ex);
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return;
        }
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            send(ex, 405, "{\"success\":false}");
            return;
        }
        if (!authorize(ex)) {
            send(ex, 401, "{\"success\":false,\"message\":\"unauthorized\"}");
            return;
        }
        int winDelta = consumeWinDelta();
        send(ex, 200, "{\"ok\":true,\"success\":true,\"mod\":\"TokControl_Minecraft\",\"pendingWinDelta\":" + winDelta + "}");
    }

    private void handleCommand(HttpExchange ex) throws IOException {
        addCors(ex);
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return;
        }
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            send(ex, 405, "{\"success\":false,\"message\":\"POST only\"}");
            return;
        }
        if (!authorize(ex)) {
            send(ex, 401, "{\"success\":false,\"message\":\"unauthorized\"}");
            return;
        }
        String body = readBody(ex.getRequestBody());
        JsonObject json;
        try {
            json = JsonParser.parseString(body).getAsJsonObject();
        } catch (Exception e) {
            send(ex, 400, "{\"success\":false,\"message\":\"invalid json\"}");
            return;
        }

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> payload = new AtomicReference<>("{\"success\":false,\"message\":\"timeout\"}");
        AtomicInteger status = new AtomicInteger(500);

        Bukkit.getScheduler().runTask(plugin, () -> {
            try {
                String msg = actions.handleSync(json);
                int winDelta = consumeWinDelta();
                payload.set("{\"success\":true,\"message\":\"" + escape(msg) + "\",\"pendingWinDelta\":" + winDelta + "}");
                status.set(200);
            } catch (Exception e) {
                int winDelta = consumeWinDelta();
                payload.set("{\"success\":false,\"message\":\"" + escape(e.getMessage()) + "\",\"pendingWinDelta\":" + winDelta + "}");
                status.set(500);
            } finally {
                latch.countDown();
            }
        });

        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        send(ex, status.get(), payload.get());
    }

    private boolean authorize(HttpExchange ex) {
        if (bridgeToken.isEmpty()) return false;
        String header = ex.getRequestHeaders().getFirst("X-TokControl-Token");
        if (header == null || header.isBlank()) {
            String auth = ex.getRequestHeaders().getFirst("Authorization");
            if (auth != null && auth.regionMatches(true, 0, "Bearer ", 0, 7)) {
                header = auth.substring(7).trim();
            }
        }
        return bridgeToken.equals(header == null ? "" : header.trim());
    }

    private static String readBody(InputStream in) throws IOException {
        return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void addCors(HttpExchange ex) {
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-TokControl-Token");
    }

    private static void send(HttpExchange ex, int code, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        addCors(ex);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
