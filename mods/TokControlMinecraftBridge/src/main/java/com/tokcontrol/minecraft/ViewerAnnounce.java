package com.tokcontrol.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

/**
 * Center-screen announce: who triggered what (TikTok / gift).
 * ไม่ใช้ action bar (บรรทัดล่าง) — รกจอ
 */
public final class ViewerAnnounce {

    private ViewerAnnounce() {}

    public static void show(String user, String action) {
        String name = sanitizeName(user);
        String act = sanitizeAction(action);
        if (name.isEmpty() && act.isEmpty()) return;
        String title = "§e§l" + (name.isEmpty() ? "TikTok" : name);
        String sub = act.isEmpty() ? "" : ("§f" + act);
        for (Player p : Bukkit.getOnlinePlayers()) {
            try {
                p.sendTitle(title, sub, 5, 45, 12);
            } catch (Exception ignored) {}
        }
    }

    public static String sanitizeName(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("§.", "").replace('\n', ' ').trim();
        if (s.startsWith("@")) s = s.substring(1).trim();
        if (s.length() > 24) s = s.substring(0, 24);
        return s;
    }

    public static String sanitizeAction(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("§.", "").replace('\n', ' ').trim();
        if (s.length() > 48) s = s.substring(0, 48);
        return s;
    }
}
