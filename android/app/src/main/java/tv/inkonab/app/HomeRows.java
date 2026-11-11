package tv.inkonab.app;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.tvprovider.media.tv.Channel;
import androidx.tvprovider.media.tv.ChannelLogoUtils;
import androidx.tvprovider.media.tv.PreviewProgram;
import androidx.tvprovider.media.tv.TvContractCompat;
import androidx.tvprovider.media.tv.WatchNextProgram;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Android TV home screen: one InkonabTV+ row (films and episodes to resume, recent live
 * channels, then new movies and series) and the system's Play Next row (to resume).
 * One row only: Android adds an app's first row by itself, and asks the viewer for any other.
 * Each tile opens the app on that channel, film or series through an inkonabtv:// link
 * (MainActivity → app.js openLink). Google TV shows Play Next only.
 *
 * rows: { live: [tile], movies: [tile], series: [tile], resume: [tile] }
 * tile: { id, title, sub, img, link, pos (ms), dur (ms), at (last watched, ms), episode }
 */
final class HomeRows {
    private static final String TAG = "InkonabHome";
    private static final String PREFS = "homeRows";
    private static final String ROW = "main";
    private static final int MAX_TILES = 25;
    private static final int RESUME = 8, LIVE = 8, NEW = 12; // per kind, in that order on the row

    private HomeRows() {}

    static boolean supported(Context c) {
        return Build.VERSION.SDK_INT >= 26 && c.getPackageManager().hasSystemFeature("android.software.leanback");
    }

    /** Writes the row and Play Next; returns { supported, ask: [] } (empty unless Android didn't add the row by itself). */
    static synchronized JSONObject update(Context c, JSONObject rows) throws JSONException {
        JSONObject out = new JSONObject();
        out.put("supported", supported(c));
        out.put("ask", new JSONArray());
        if (!supported(c)) return out;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        dropOldRows(c, p);
        JSONArray tiles = new JSONArray();
        add(tiles, rows.optJSONArray("resume"), RESUME, "resume");
        add(tiles, rows.optJSONArray("live"), LIVE, "live");
        // New movies and series in turn, so both show near the front.
        JSONArray m = rows.optJSONArray("movies"), se = rows.optJSONArray("series");
        for (int i = 0, n = 0; n < NEW && ((m != null && i < m.length()) || (se != null && i < se.length())); i++) {
            if (m != null && i < m.length() && n < NEW) { put(tiles, m.optJSONObject(i), "movie"); n++; }
            if (se != null && i < se.length() && n < NEW) { put(tiles, se.optJSONObject(i), "series"); n++; }
        }
        if (tiles.length() > 0) {
            long id = channel(c, p, ROW, "InkonabTV+");
            if (id >= 0) {
                fill(c, id, tiles);
                try { TvContractCompat.requestChannelBrowsable(c, id); } catch (Exception ignored) {}
                // Not the app's first row (an older version made others): Android asks, once.
                if (!browsable(c, id) && !p.getBoolean("asked." + ROW, false)) {
                    out.getJSONArray("ask").put(id);
                    p.edit().putBoolean("asked." + ROW, true).apply();
                }
            }
        }
        watchNext(c, rows.optJSONArray("resume"));
        return out;
    }

    private static void add(JSONArray to, JSONArray from, int max, String kind) throws JSONException {
        for (int i = 0; from != null && i < from.length() && i < max; i++) put(to, from.optJSONObject(i), kind);
    }

    private static void put(JSONArray to, JSONObject t, String kind) throws JSONException {
        if (t == null) return;
        String id = t.optString("id");
        for (int i = 0; i < to.length(); i++) if (id.equals(to.getJSONObject(i).optString("id"))) return; // resumed and new: once
        to.put(new JSONObject(t.toString()).put("kind", kind));
    }

    /** Earlier versions had three rows (live, movies, series): the first becomes the one row
     *  (it keeps its place on the home screen), the others go. */
    private static void dropOldRows(Context c, SharedPreferences p) {
        ContentResolver r = c.getContentResolver();
        for (String key : new String[] { "live", "movies", "series" }) {
            long id = p.getLong(key, -1);
            if (id < 0) continue;
            if (p.getLong(ROW, -1) < 0 && exists(r, id)) {
                try {
                    android.content.ContentValues v = new android.content.ContentValues();
                    v.put(TvContractCompat.Channels.COLUMN_DISPLAY_NAME, "InkonabTV+");
                    v.put(TvContractCompat.Channels.COLUMN_APP_LINK_INTENT_URI, "inkonabtv://open");
                    r.update(TvContractCompat.buildChannelUri(id), v, null, null);
                    p.edit().putLong(ROW, id).remove(key).remove("asked." + key).apply();
                    continue;
                } catch (Exception e) { Log.w(TAG, "keep row: " + e); }
            }
            try { r.delete(TvContractCompat.buildChannelUri(id), null, null); } catch (Exception ignored) {}
            p.edit().remove(key).remove("asked." + key).apply();
        }
    }

    private static boolean browsable(Context c, long id) {
        try (Cursor cur = c.getContentResolver().query(TvContractCompat.buildChannelUri(id),
                new String[] { TvContractCompat.Channels.COLUMN_BROWSABLE }, null, null, null)) {
            return cur != null && cur.moveToFirst() && cur.getInt(0) == 1;
        } catch (Exception e) { return true; } // can't tell: don't ask
    }

    // ---------- the app's row ----------

    private static long channel(Context c, SharedPreferences p, String key, String name) {
        ContentResolver r = c.getContentResolver();
        long id = p.getLong(key, -1);
        if (id >= 0 && exists(r, id)) return id;
        Channel ch = new Channel.Builder()
                .setType(TvContractCompat.Channels.TYPE_PREVIEW)
                .setDisplayName(name)
                .setAppLinkIntentUri(Uri.parse("inkonabtv://open"))
                .build();
        try {
            Uri uri = r.insert(TvContractCompat.Channels.CONTENT_URI, ch.toContentValues());
            if (uri == null) return -1;
            id = ContentUris.parseId(uri);
            Bitmap logo = appIcon(c);
            if (logo != null) ChannelLogoUtils.storeChannelLogo(c, id, logo);
            p.edit().putLong(key, id).apply();
            return id;
        } catch (Exception e) {
            Log.w(TAG, "row: " + e);
            return -1;
        }
    }

    private static boolean exists(ContentResolver r, long id) {
        try (Cursor cur = r.query(TvContractCompat.buildChannelUri(id), new String[] { TvContractCompat.Channels._ID }, null, null, null)) {
            return cur != null && cur.moveToFirst();
        } catch (Exception e) { return false; }
    }

    private static void fill(Context c, long channelId, JSONArray tiles) {
        ContentResolver r = c.getContentResolver();
        try { r.delete(TvContractCompat.buildPreviewProgramsUriForChannel(channelId), null, null); } catch (Exception e) { Log.w(TAG, "clear: " + e); }
        for (int i = 0; i < tiles.length() && i < MAX_TILES; i++) {
            JSONObject t = tiles.optJSONObject(i);
            if (t == null) continue;
            String kind = t.optString("kind");
            boolean live = "live".equals(kind);
            boolean episode = t.optBoolean("episode");
            PreviewProgram.Builder b = new PreviewProgram.Builder();
            b.setChannelId(channelId)
                    .setType(live ? TvContractCompat.PreviewPrograms.TYPE_CHANNEL
                            : episode ? TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE
                            : "series".equals(kind) ? TvContractCompat.PreviewPrograms.TYPE_TV_SERIES : TvContractCompat.PreviewPrograms.TYPE_MOVIE)
                    .setTitle(t.optString("title"))
                    .setDescription(t.optString("sub"))
                    .setIntentUri(Uri.parse(t.optString("link")))
                    .setInternalProviderId(kind + ":" + t.optString("id"))
                    .setWeight(MAX_TILES - i)
                    .setPosterArtAspectRatio(live ? TvContractCompat.PreviewPrograms.ASPECT_RATIO_16_9 : TvContractCompat.PreviewPrograms.ASPECT_RATIO_2_3);
            String img = t.optString("img");
            if (!img.isEmpty()) b.setPosterArtUri(Uri.parse(img));
            if (live) b.setLive(true);
            if (t.optLong("pos") > 0 && t.optLong("dur") > 0) {
                b.setLastPlaybackPositionMillis((int) Math.min(Integer.MAX_VALUE, t.optLong("pos")));
                b.setDurationMillis((int) Math.min(Integer.MAX_VALUE, t.optLong("dur")));
            }
            try { r.insert(TvContractCompat.PreviewPrograms.CONTENT_URI, b.build().toContentValues()); }
            catch (Exception e) { Log.w(TAG, "tile: " + e); }
        }
    }

    // ---------- Play Next: films and episodes to resume ----------

    private static void watchNext(Context c, JSONArray tiles) {
        ContentResolver r = c.getContentResolver();
        Map<String, Long> have = new HashMap<>();
        Set<String> removedByViewer = new HashSet<>();
        try (Cursor cur = r.query(TvContractCompat.WatchNextPrograms.CONTENT_URI,
                new String[] { TvContractCompat.WatchNextPrograms._ID, TvContractCompat.WatchNextPrograms.COLUMN_INTERNAL_PROVIDER_ID,
                        TvContractCompat.WatchNextPrograms.COLUMN_BROWSABLE }, null, null, null)) {
            while (cur != null && cur.moveToNext()) {
                String pid = cur.getString(1);
                if (pid == null) continue;
                have.put(pid, cur.getLong(0));
                if (cur.getInt(2) == 0) removedByViewer.add(pid);
            }
        } catch (Exception e) { Log.w(TAG, "play next: " + e); }
        Set<String> keep = new HashSet<>();
        for (int i = 0; tiles != null && i < tiles.length() && i < MAX_TILES; i++) {
            JSONObject t = tiles.optJSONObject(i);
            if (t == null || t.optString("id").isEmpty()) continue;
            String pid = t.optString("id");
            keep.add(pid);
            if (removedByViewer.contains(pid)) continue; // taken off Play Next by the viewer: leave it off
            WatchNextProgram.Builder b = new WatchNextProgram.Builder();
            b.setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                    .setType(t.optBoolean("episode") ? TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE : TvContractCompat.WatchNextPrograms.TYPE_MOVIE)
                    .setTitle(t.optString("title"))
                    .setDescription(t.optString("sub"))
                    .setIntentUri(Uri.parse(t.optString("link")))
                    .setInternalProviderId(pid)
                    .setLastEngagementTimeUtcMillis(t.optLong("at", System.currentTimeMillis()))
                    .setLastPlaybackPositionMillis((int) Math.min(Integer.MAX_VALUE, t.optLong("pos")))
                    .setDurationMillis((int) Math.min(Integer.MAX_VALUE, t.optLong("dur")))
                    .setPosterArtAspectRatio(TvContractCompat.WatchNextPrograms.ASPECT_RATIO_2_3);
            String img = t.optString("img");
            if (!img.isEmpty()) b.setPosterArtUri(Uri.parse(img));
            try {
                Long row = have.get(pid);
                if (row != null) r.update(TvContractCompat.buildWatchNextProgramUri(row), b.build().toContentValues(), null, null);
                else r.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, b.build().toContentValues());
            } catch (Exception e) { Log.w(TAG, "play next tile: " + e); }
        }
        // Finished or cleared in the app: off Play Next too.
        for (Map.Entry<String, Long> e : have.entrySet()) {
            if (keep.contains(e.getKey())) continue;
            try { r.delete(TvContractCompat.buildWatchNextProgramUri(e.getValue()), null, null); } catch (Exception ignored) {}
        }
    }

    private static Bitmap appIcon(Context c) {
        try {
            Drawable d = c.getPackageManager().getApplicationIcon(c.getPackageName());
            Bitmap bm = Bitmap.createBitmap(160, 160, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bm);
            d.setBounds(0, 0, 160, 160);
            d.draw(canvas);
            return bm;
        } catch (Exception e) { return null; }
    }
}
