package tv.inkonab.app.rec;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Environment;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

/**
 * InkonabTV+ only: recording live channels, on a USB drive or memory stick only (never the TV's
 * own storage). A recording is { id, title, ch, url, start, end, file, status, bytes };
 * status: scheduled, recording, done, failed, stopped. Kept in prefs "rec".
 * RecordService saves the stream; RecordAlarm starts it when a scheduled one is due.
 */
public final class Recorder {
    public static final boolean AVAILABLE = true;
    private static final String PREFS = "rec";

    private Recorder() {}

    /** The app's folder on a USB drive or memory stick (Android/data/<app>/files/Recordings), or null. */
    public static File folder(Context c) {
        for (File d : c.getExternalFilesDirs(null)) {
            if (d == null) continue;
            boolean removable = false;
            try { removable = Environment.isExternalStorageRemovable(d) && Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState(d)); } catch (Exception ignored) {}
            if (removable) {
                File r = new File(d, "Recordings");
                if (r.isDirectory() || r.mkdirs()) return r;
            }
        }
        return null;
    }

    public static synchronized JSONArray list(Context c) {
        try { return new JSONArray(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("list", "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    static synchronized void save(Context c, JSONArray a) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("list", a.toString()).apply();
    }

    static synchronized JSONObject find(Context c, String id) {
        JSONArray a = list(c);
        for (int i = 0; i < a.length(); i++) { JSONObject j = a.optJSONObject(i); if (j != null && id.equals(j.optString("id"))) return j; }
        return null;
    }

    static synchronized void update(Context c, JSONObject job) {
        JSONArray a = list(c), out = new JSONArray();
        boolean put = false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject j = a.optJSONObject(i);
            if (j == null) continue;
            if (j.optString("id").equals(job.optString("id"))) { out.put(job); put = true; } else out.put(j);
        }
        if (!put) out.put(job);
        save(c, out);
    }

    /**
     * Adds a recording { title, ch, url, start, end }. Returns "" when it's set, else why not.
     * It starts now when its start has come, else at its start (an alarm, a minute early).
     */
    public static String add(Context c, JSONObject job) {
        File dir = folder(c);
        if (dir == null) return "Plug in a USB drive or memory stick to record";
        long now = System.currentTimeMillis();
        try {
            if (job.optLong("end") <= now) return "This programme has already ended";
            String id = Long.toString(now, 36) + Integer.toString((int) (Math.random() * 1296), 36);
            job.put("id", id);
            job.put("status", "scheduled");
            job.put("bytes", 0);
            update(c, job);
            if (job.optLong("start") <= now + 60000) RecordService.start(c);
            else schedule(c, job);
            return "";
        } catch (Exception e) {
            return "Can't record this channel";
        }
    }

    static void schedule(Context c, JSONObject job) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = alarmIntent(c, job.optString("id"));
        long at = Math.max(System.currentTimeMillis() + 1000, job.optLong("start") - 60000);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private static PendingIntent alarmIntent(Context c, String id) {
        Intent i = new Intent(c, RecordAlarm.class).setAction("tv.inkonab.app.REC").putExtra("id", id);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Stops a recording that's running, or cancels one that hasn't started. */
    public static void stop(Context c, String id) {
        JSONObject job = find(c, id);
        if (job == null) return;
        try {
            String st = job.optString("status");
            if ("scheduled".equals(st)) {
                ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(alarmIntent(c, id));
                job.put("status", "stopped");
            } else if ("recording".equals(st)) job.put("stop", true);
            update(c, job);
        } catch (Exception ignored) {}
    }

    /** Removes it from the list and deletes its file. */
    public static synchronized void remove(Context c, String id) {
        stop(c, id);
        JSONArray a = list(c), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject j = a.optJSONObject(i);
            if (j == null) continue;
            if (id.equals(j.optString("id"))) {
                String f = j.optString("file");
                if (!f.isEmpty() && !"recording".equals(j.optString("status"))) new File(f).delete();
                continue;
            }
            out.put(j);
        }
        save(c, out);
    }

    /** After a restart: alarms are lost, so scheduled ones are set again. */
    public static void reschedule(Context c) {
        JSONArray a = list(c);
        long now = System.currentTimeMillis();
        boolean due = false;
        for (int i = 0; i < a.length(); i++) {
            JSONObject j = a.optJSONObject(i);
            if (j == null || !"scheduled".equals(j.optString("status")) || j.optLong("end") <= now) continue;
            if (j.optLong("start") <= now + 60000) due = true; else schedule(c, j);
        }
        if (due) RecordService.start(c);
    }

    public static boolean usb(Context c) { return folder(c) != null; }
}
