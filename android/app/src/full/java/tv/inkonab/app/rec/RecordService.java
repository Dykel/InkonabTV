package tv.inkonab.app.rec;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Saves live streams to the USB drive while recordings are due. Each recording copies the
 * channel's MPEG-TS stream into a .ts file until its end (or Stop); a dropped stream is joined
 * again and the file carries on. The service stops when nothing is left to record.
 */
public class RecordService extends Service {
    private static final String TAG = "InkonabRec", CHANNEL = "recordings";
    private final Set<String> running = new HashSet<>();

    public static void start(Context c) {
        Intent i = new Intent(c, RecordService.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception e) { Log.w(TAG, "can't start", e); }
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        foreground();
        pickUp();
        return START_STICKY;
    }

    private void foreground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Recordings", NotificationManager.IMPORTANCE_LOW));
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        Notification n = b.setContentTitle("InkonabTV+ is recording").setContentText("Saving to the USB drive")
                .setSmallIcon(android.R.drawable.presence_video_online).setOngoing(true).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(7302, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(7302, n);
    }

    /** Starts every recording whose time has come and isn't running yet. */
    private synchronized void pickUp() {
        long now = System.currentTimeMillis();
        JSONArray a = Recorder.list(this);
        for (int i = 0; i < a.length(); i++) {
            JSONObject j = a.optJSONObject(i);
            if (j == null) continue;
            String id = j.optString("id"), st = j.optString("status");
            if (running.contains(id)) continue;
            if ("scheduled".equals(st) && j.optLong("start") <= now + 90000 && j.optLong("end") > now) {
                running.add(id);
                new Thread(() -> record(id), "rec-" + id).start();
            }
        }
        if (running.isEmpty()) stopSelf();
    }

    private static String fetchText(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestProperty("User-Agent", "InkonabTV");
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
        try (InputStream in = con.getInputStream()) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16 * 1024];
            for (int n; (n = in.read(buf)) > 0; ) { b.write(buf, 0, n); if (b.size() > 2 * 1024 * 1024) break; }
            return b.toString("UTF-8");
        } finally { con.disconnect(); }
    }

    private static long copy(String url, FileOutputStream out) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestProperty("User-Agent", "InkonabTV");
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        long n = 0;
        try (InputStream in = con.getInputStream()) {
            byte[] buf = new byte[64 * 1024];
            for (int k; (k = in.read(buf)) > 0; ) { out.write(buf, 0, k); n += k; }
        } finally { con.disconnect(); }
        return n;
    }

    private static byte[] fetchBytes(String url) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestProperty("User-Agent", "InkonabTV");
        con.setConnectTimeout(15000);
        con.setReadTimeout(30000);
        try (InputStream in = con.getInputStream()) {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            for (int k; (k = in.read(buf)) > 0; ) b.write(buf, 0, k);
            return b.toByteArray();
        } finally { con.disconnect(); }
    }

    private static byte[] hex(String h) {
        h = h.startsWith("0x") || h.startsWith("0X") ? h.substring(2) : h;
        while (h.length() < 32) h = "0" + h;
        byte[] out = new byte[16];
        for (int i = 0; i < 16; i++) out[i] = (byte) Integer.parseInt(h.substring(i * 2, i * 2 + 2), 16);
        return out;
    }

    /** Encrypted HLS (#EXT-X-KEY METHOD=AES-128): IV given, or the piece's number. */
    private static byte[] decrypt(byte[] data, byte[] key, String ivHex, long seq) throws Exception {
        byte[] iv = new byte[16];
        if (ivHex != null) iv = hex(ivHex);
        else for (int i = 0; i < 8; i++) iv[15 - i] = (byte) (seq >>> (8 * i));
        javax.crypto.Cipher c = javax.crypto.Cipher.getInstance("AES/CBC/PKCS5Padding");
        c.init(javax.crypto.Cipher.DECRYPT_MODE, new javax.crypto.spec.SecretKeySpec(key, "AES"), new javax.crypto.spec.IvParameterSpec(iv));
        return c.doFinal(data);
    }

    /** Records an HLS stream: the best quality, each new piece in turn, until the end time. */
    private long recordHls(String id, String url, long end, FileOutputStream out) throws InterruptedException {
        long bytes = 0, lastSeq = -1, lastSave = 0;
        boolean initDone = false;
        int failures = 0;
        String media = null;
        java.util.Map<String, byte[]> keys = new java.util.HashMap<>();
        while (System.currentTimeMillis() < end) {
            JSONObject cur = Recorder.find(this, id);
            if (cur == null || cur.optBoolean("stop")) break;
            long wait = 4000;
            try {
                if (media == null) {
                    String text = fetchText(url);
                    media = url;
                    if (text.contains("#EXT-X-STREAM-INF")) {
                        // A list of qualities: the highest.
                        long best = -1;
                        String[] lines = text.split("\r?\n");
                        for (int i = 0; i < lines.length - 1; i++) {
                            if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
                            java.util.regex.Matcher m = java.util.regex.Pattern.compile("BANDWIDTH=(\\d+)").matcher(lines[i]);
                            long bw = m.find() ? Long.parseLong(m.group(1)) : 0;
                            String next = lines[i + 1].trim();
                            if (!next.isEmpty() && !next.startsWith("#") && bw > best) { best = bw; media = new URL(new URL(url), next).toString(); }
                        }
                    }
                }
                String pl = fetchText(media);
                long seq = 0;
                java.util.List<String> segs = new java.util.ArrayList<>();
                java.util.List<String[]> segKey = new java.util.ArrayList<>(); // [key uri, iv] per piece, or null
                String[] curKey = null;
                for (String line : pl.split("\r?\n")) {
                    line = line.trim();
                    if (line.startsWith("#EXT-X-KEY:")) {
                        if (line.contains("METHOD=NONE")) curKey = null;
                        else if (line.contains("METHOD=AES-128")) {
                            java.util.regex.Matcher u = java.util.regex.Pattern.compile("URI=\"([^\"]+)\"").matcher(line);
                            java.util.regex.Matcher v = java.util.regex.Pattern.compile("IV=(0[xX][0-9a-fA-F]+)").matcher(line);
                            curKey = u.find() ? new String[]{ new URL(new URL(media), u.group(1)).toString(), v.find() ? v.group(1) : null } : null;
                        } else throw new IllegalStateException("protected stream");
                        continue;
                    }
                    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) seq = Long.parseLong(line.substring(22).trim());
                    else if (line.startsWith("#EXT-X-TARGETDURATION:")) wait = Math.max(2000, Math.min(10000, (long) (Double.parseDouble(line.substring(22).trim()) * 500)));
                    else if (line.startsWith("#EXT-X-MAP:") && !initDone) {
                        java.util.regex.Matcher m = java.util.regex.Pattern.compile("URI=\"([^\"]+)\"").matcher(line);
                        if (m.find()) { bytes += copy(new URL(new URL(media), m.group(1)).toString(), out); initDone = true; }
                    } else if (!line.isEmpty() && !line.startsWith("#")) { segs.add(line); segKey.add(curKey); }
                }
                // The first time: from the live edge (the last two pieces), not the whole window.
                if (lastSeq < 0) lastSeq = seq + Math.max(0, segs.size() - 2) - 1;
                for (int i = 0; i < segs.size(); i++) {
                    long n = seq + i;
                    if (n <= lastSeq) continue;
                    String segUrl = new URL(new URL(media), segs.get(i)).toString();
                    String[] k = segKey.get(i);
                    if (k == null) bytes += copy(segUrl, out);
                    else {
                        byte[] key = keys.get(k[0]);
                        if (key == null) { key = fetchBytes(k[0]); keys.put(k[0], key); }
                        byte[] plain = decrypt(fetchBytes(segUrl), key, k[1], n);
                        out.write(plain);
                        bytes += plain.length;
                    }
                    lastSeq = n;
                    if (System.currentTimeMillis() >= end) break;
                }
                failures = 0;
                if (pl.contains("#EXT-X-ENDLIST")) break;
                long t = System.currentTimeMillis();
                if (t - lastSave > 5000) {
                    lastSave = t;
                    JSONObject now = Recorder.find(this, id);
                    if (now != null) { now.put("bytes", bytes); Recorder.update(this, now); }
                }
            } catch (Exception e) {
                failures++;
                Log.w(TAG, "HLS piece failed (" + failures + "): " + e.getClass().getSimpleName());
                if (failures > 3) media = null; // ask for the playlist again from the top
                wait = Math.min(15000, 2000L * failures);
            }
            Thread.sleep(wait);
        }
        return bytes;
    }

    private static String safe(String s) { return s.replaceAll("[\\\\/:*?\"<>|]+", " ").replaceAll("\\s+", " ").trim(); }

    private void record(String id) {
        JSONObject job = Recorder.find(this, id);
        try {
            File dir = Recorder.folder(this);
            if (job == null) return;
            if (dir == null) { job.put("status", "failed"); job.put("why", "No USB drive"); Recorder.update(this, job); return; }
            // Waits for its start (it's set off a minute early).
            while (System.currentTimeMillis() < job.optLong("start") - 5000) {
                Thread.sleep(2000);
                JSONObject cur = Recorder.find(this, id);
                if (cur == null || cur.optBoolean("stop") || "stopped".equals(cur.optString("status"))) return;
            }
            String stamp = new SimpleDateFormat("yyyy-MM-dd HH.mm", Locale.US).format(new Date(job.optLong("start")));
            String name = safe(job.optString("ch") + " - " + job.optString("title") + " - " + stamp);
            if (name.length() > 120) name = name.substring(0, 120);
            File f = new File(dir, name + ".ts");
            job.put("file", f.getAbsolutePath());
            job.put("status", "recording");
            Recorder.update(this, job);
            long bytes = 0, end = job.optLong("end");
            int failures = 0;
            try (FileOutputStream out = new FileOutputStream(f, true)) {
                byte[] buf = new byte[64 * 1024];
                // HLS (.m3u8): the playlist lists short video pieces; each new one is added to the file.
                if (job.optString("url").contains(".m3u8")) bytes = recordHls(id, job.optString("url"), end, out);
                while (!job.optString("url").contains(".m3u8") && System.currentTimeMillis() < end) {
                    JSONObject cur = Recorder.find(this, id);
                    if (cur == null || cur.optBoolean("stop")) break;
                    HttpURLConnection con = null;
                    try {
                        con = (HttpURLConnection) new URL(job.optString("url")).openConnection();
                        con.setRequestProperty("User-Agent", "InkonabTV");
                        con.setConnectTimeout(15000);
                        con.setReadTimeout(20000);
                        con.setInstanceFollowRedirects(true);
                        try (InputStream in = con.getInputStream()) {
                            long lastSave = 0;
                            for (int n; (n = in.read(buf)) > 0; ) {
                                out.write(buf, 0, n);
                                bytes += n;
                                failures = 0;
                                long t = System.currentTimeMillis();
                                if (t >= end) break;
                                if (t - lastSave > 5000) {
                                    lastSave = t;
                                    JSONObject now = Recorder.find(this, id);
                                    if (now == null || now.optBoolean("stop")) break;
                                    now.put("bytes", bytes);
                                    Recorder.update(this, now);
                                }
                            }
                        }
                    } catch (Exception e) {
                        failures++;
                        Log.w(TAG, "stream dropped (" + failures + "): " + e.getClass().getSimpleName());
                        Thread.sleep(Math.min(15000, 2000L * failures));
                    } finally {
                        if (con != null) con.disconnect();
                    }
                }
            }
            JSONObject done = Recorder.find(this, id);
            if (done != null) {
                done.put("bytes", bytes);
                done.put("status", bytes > 0 ? (done.optBoolean("stop") ? "stopped" : "done") : "failed");
                done.remove("stop");
                Recorder.update(this, done);
                if (bytes == 0) f.delete();
            }
        } catch (Exception e) {
            Log.w(TAG, "recording failed", e);
            try { JSONObject j = Recorder.find(this, id); if (j != null) { j.put("status", "failed"); Recorder.update(this, j); } } catch (Exception ignored) {}
        } finally {
            synchronized (this) { running.remove(id); }
            pickUp();
        }
    }
}
