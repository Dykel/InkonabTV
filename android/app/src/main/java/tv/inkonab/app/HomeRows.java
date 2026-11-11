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
 * Android TV home screen: the app's own rows (Live TV, Movies, Series) and the system's
 * Play Next row (films and episodes to resume). Each tile opens the app on that channel,
 * film or series through an inkonabtv:// link (MainActivity → app.js openLink).
 * Android adds the app's first row (Live TV) by itself and asks the viewer once for each other
 * row, one question at a time. Google TV shows Play Next only.
 *
 * rows: { live: [tile], movies: [tile], series: [tile], resume: [tile] }
 * tile: { id, title, sub, img, link, pos (ms), dur (ms), at (last watched, ms), episode }
 */
final class HomeRows {
    private static final String TAG = "InkonabHome";
    private static final String PREFS = "homeRows";
    private static final String[][] ROWS = { { "live", "Live TV" }, { "movies", "Movies" }, { "series", "Series" } };
    private static final int MAX_TILES = 25;

    private HomeRows() {}

    static boolean supported(Context c) {
        return Build.VERSION.SDK_INT >= 26 && c.getPackageManager().hasSystemFeature("android.software.leanback");
    }

    /** Writes every row; returns { supported, ask: [the channel id the viewer is asked to add] }. */
    static synchronized JSONObject update(Context c, JSONObject rows) throws JSONException {
        JSONObject out = new JSONObject();
        out.put("supported", supported(c));
        JSONArray ask = new JSONArray();
        out.put("ask", ask);
        if (!supported(c)) return out;
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        fromOneRow(c, p);
        for (int i = 0; i < ROWS.length; i++) {
            String key = ROWS[i][0];
            JSONArray tiles = rows.optJSONArray(key);
            if (tiles == null || tiles.length() == 0) {
                // Nothing to show (or turned off in Settings): the row is emptied, which hides it,
                // and keeps its place for when it comes back.
                long old = p.getLong(key, -1);
                if (old >= 0) try { c.getContentResolver().delete(TvContractCompat.buildPreviewProgramsUriForChannel(old), null, null); } catch (Exception ignored) {}
                continue;
            }
            long id = channel(c, p, key, ROWS[i][1]);
            if (id < 0) continue;
            fill(c, id, key, tiles);
            try { TvContractCompat.requestChannelBrowsable(c, id); } catch (Exception ignored) {}
            // Not shown yet (any row after the first): Android asks the viewer, once per row and
            // one row per update, so the questions don't pile up.
            // At least a minute apart: two updates close together would stack two questions, and
            // the one underneath would close unanswered.
            long now = System.currentTimeMillis();
            if (ask.length() == 0 && !p.getBoolean("asked." + key, false) && now - p.getLong("askedAt", 0) > 60000 && !browsable(c, id)) {
                ask.put(id);
                p.edit().putBoolean("asked." + key, true).putLong("askedAt", now).apply();
            }
        }
        watchNext(c, rows.optJSONArray("resume"));
        return out;
    }

    /** 1.0.25 had one InkonabTV+ row: it becomes the Live TV row (it keeps its place on the home screen). */
    private static void fromOneRow(Context c, SharedPreferences p) {
        long id = p.getLong("main", -1);
        if (id < 0) return;
        ContentResolver r = c.getContentResolver();
        if (p.getLong("live", -1) < 0 && exists(r, id)) {
            try {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(TvContractCompat.Channels.COLUMN_DISPLAY_NAME, "Live TV");
                v.put(TvContractCompat.Channels.COLUMN_APP_LINK_INTENT_URI, "inkonabtv://open?row=live");
                r.update(TvContractCompat.buildChannelUri(id), v, null, null);
                p.edit().putLong("live", id).putBoolean("asked.live", true).remove("main").remove("asked.main").apply();
                return;
            } catch (Exception e) { Log.w(TAG, "keep row: " + e); }
        }
        try { r.delete(TvContractCompat.buildChannelUri(id), null, null); } catch (Exception ignored) {}
        p.edit().remove("main").remove("asked.main").apply();
    }

    private static boolean browsable(Context c, long id) {
        try (Cursor cur = c.getContentResolver().query(TvContractCompat.buildChannelUri(id),
                new String[] { TvContractCompat.Channels.COLUMN_BROWSABLE }, null, null, null)) {
            return cur != null && cur.moveToFirst() && cur.getInt(0) == 1;
        } catch (Exception e) { return true; } // can't tell: don't ask
    }

    // ---------- the app's rows ----------

    private static long channel(Context c, SharedPreferences p, String key, String name) {
        ContentResolver r = c.getContentResolver();
        long id = p.getLong(key, -1);
        if (id >= 0 && exists(r, id)) return id;
        Channel ch = new Channel.Builder()
                .setType(TvContractCompat.Channels.TYPE_PREVIEW)
                .setDisplayName(name)
                .setAppLinkIntentUri(Uri.parse("inkonabtv://open?row=" + key))
                .build();
        try {
            Uri uri = r.insert(TvContractCompat.Channels.CONTENT_URI, ch.toContentValues());
            if (uri == null) return -1;
            id = ContentUris.parseId(uri);
            Bitmap logo = appIcon(c);
            if (logo != null) ChannelLogoUtils.storeChannelLogo(c, id, logo);
            p.edit().putLong(key, id).putBoolean("asked." + key, false).apply();
            return id;
        } catch (Exception e) {
            Log.w(TAG, "row " + key + ": " + e);
            return -1;
        }
    }

    private static boolean exists(ContentResolver r, long id) {
        try (Cursor cur = r.query(TvContractCompat.buildChannelUri(id), new String[] { TvContractCompat.Channels._ID }, null, null, null)) {
            return cur != null && cur.moveToFirst();
        } catch (Exception e) { return false; }
    }

    private static void fill(Context c, long channelId, String key, JSONArray tiles) {
        ContentResolver r = c.getContentResolver();
        try { r.delete(TvContractCompat.buildPreviewProgramsUriForChannel(channelId), null, null); } catch (Exception e) { Log.w(TAG, "clear " + key + ": " + e); }
        boolean live = "live".equals(key);
        for (int i = 0; i < tiles.length() && i < MAX_TILES; i++) {
            JSONObject t = tiles.optJSONObject(i);
            if (t == null) continue;
            PreviewProgram.Builder b = new PreviewProgram.Builder();
            b.setChannelId(channelId)
                    .setType(live ? TvContractCompat.PreviewPrograms.TYPE_CHANNEL
                            : t.optBoolean("episode") ? TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE
                            : "series".equals(key) ? TvContractCompat.PreviewPrograms.TYPE_TV_SERIES : TvContractCompat.PreviewPrograms.TYPE_MOVIE)
                    .setTitle(t.optString("title"))
                    .setDescription(t.optString("sub"))
                    .setIntentUri(Uri.parse(t.optString("link")))
                    .setInternalProviderId(t.optString("id"))
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
            catch (Exception e) { Log.w(TAG, "tile " + key + ": " + e); }
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
