package tv.inkonab.app.vpn;

import android.content.Context;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Free community OpenVPN servers from the VPN Gate academic project (https://www.vpngate.net).
 * The public CSV API lists ~100 volunteer servers with a ready-to-use OpenVPN config each.
 */
public final class VpnGate {
    private static final String API = "https://www.vpngate.net/api/iphone/";
    private static final long FRESH_MS = 30 * 60 * 1000;

    public static final class Server {
        public final String host, ip, country, countryCode, config;
        public final long score, speed;
        public final int ping, sessions;

        Server(String[] f, String config) {
            host = f[0];
            ip = f[1];
            score = parseLong(f[2]);
            ping = (int) parseLong(f[3]);
            speed = parseLong(f[4]);
            country = f[5];
            countryCode = f[6];
            sessions = (int) parseLong(f[7]);
            this.config = config;
        }

        /** A server remembered from an earlier session (it may have left today's list). */
        Server(String host, String ip, String country, String countryCode, String config) {
            this.host = host; this.ip = ip; this.country = country; this.countryCode = countryCode; this.config = config;
            score = 0; speed = 0; ping = 0; sessions = 0;
        }

        public String label() { return shortCountry() + " · " + ip; }

        /** "Korea Republic of" → "Korea", "United States" → "USA"… */
        public String shortCountry() {
            switch (country) {
                case "Korea Republic of": return "Korea";
                case "Viet Nam": return "Vietnam";
                case "United States": return "USA";
                case "United Kingdom": return "UK";
                case "Russian Federation": return "Russia";
                case "Iran Islamic Republic of": return "Iran";
                default: return country.replace(" Republic of", "");
            }
        }
        public String id() { return ip; }
    }

    private static List<Server> cached;
    private static long cachedAt;

    /** Servers best first; optional country code filter ("" = any). Falls back to the last saved list offline. */
    public static synchronized List<Server> servers(Context ctx, String country) throws Exception {
        if (cached == null || System.currentTimeMillis() - cachedAt > FRESH_MS) {
            File saved = new File(ctx.getFilesDir(), "vpngate.csv");
            String csv;
            try {
                csv = download();
                try (FileOutputStream out = new FileOutputStream(saved)) { out.write(csv.getBytes(StandardCharsets.UTF_8)); }
            } catch (Exception e) {
                if (!saved.exists()) throw e;
                csv = new String(Files.readAllBytes(saved.toPath()), StandardCharsets.UTF_8);
            }
            cached = parse(csv);
            cachedAt = System.currentTimeMillis();
        }
        List<Server> out = new ArrayList<>();
        for (Server s : cached) if (country == null || country.isEmpty() || country.equalsIgnoreCase(s.countryCode)) out.add(s);
        if (out.isEmpty()) out.addAll(cached); // no server in that country right now: use any
        return out;
    }

    private static String download() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(API).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "InkonabTV/1.0 (Android)");
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            for (int n; (n = in.read(b)) > 0; ) buf.write(b, 0, n);
            return buf.toString("UTF-8");
        }
    }

    /** CSV: "*vpn_servers", "#HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,…,OpenVPN_ConfigData_Base64", rows, "*". */
    static List<Server> parse(String csv) {
        List<Server> list = new ArrayList<>();
        for (String line : csv.split("\r?\n")) {
            if (line.isEmpty() || line.startsWith("*") || line.startsWith("#")) continue;
            List<String> f = split(line);
            if (f.size() < 15) continue;
            String cfg;
            try {
                cfg = new String(Base64.decode(f.get(f.size() - 1), Base64.DEFAULT), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException e) {
                continue;
            }
            if (!cfg.contains("remote ")) continue;
            list.add(new Server(f.toArray(new String[0]), cfg));
        }
        // VPN Gate's score already blends speed, uptime and load; prefer it, then lower ping.
        Collections.sort(list, (a, b) -> a.score != b.score ? Long.compare(b.score, a.score) : Integer.compare(a.ping, b.ping));
        return list;
    }

    private static List<String> split(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') quoted = !quoted;
            else if (ch == ',' && !quoted) { out.add(cur.toString()); cur.setLength(0); }
            else cur.append(ch);
        }
        out.add(cur.toString());
        return out;
    }

    private static long parseLong(String s) {
        try { return Long.parseLong(s.trim()); } catch (Exception e) { return 0; }
    }
}
