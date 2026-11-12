package tv.inkonab.app.rec;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;

/**
 * Google Play version: no recording (it needs a background service Google asks apps to
 * justify). Same API as the InkonabTV+ Recorder (src/full), so the player and plugin are shared.
 */
public final class Recorder {
    public static final boolean AVAILABLE = false;

    private Recorder() {}

    public static File folder(Context c) { return null; }
    public static JSONArray list(Context c) { return new JSONArray(); }
    public static String add(Context c, JSONObject job) { return "Recording isn't available in this version"; }
    public static void stop(Context c, String id) {}
    public static void remove(Context c, String id) {}
    public static void reschedule(Context c) {}
    public static boolean usb(Context c) { return false; }
}
