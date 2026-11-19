package tv.inkonab.app;

import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Multiview: up to four live channels at once, in a grid.
 * The focused tile has the sound; OK opens Full screen / Change channel / Remove; OK on the empty
 * tile adds a channel; Back closes. Gets the same live payload as {@link PlayerActivity} (staged in
 * {@link PlayerActivity#pending}) plus "tiles" (channel keys) and "maxConn".
 * Result: "tiles" (JSON array of channel keys), "focus" (key with the sound), "full" (key to open
 * in the normal player, if chosen).
 */
@OptIn(markerClass = UnstableApi.class)
public class MultiviewActivity extends AppCompatActivity {
    private static final int MAX = 4;
    private static final int ACCENT = 0xFFFBC50C;

    private static final class Group {
        final String name; final int[] items;
        Group(String name, int[] items) { this.name = name; this.items = items; }
    }

    private final class Tile {
        int ch = -1;                 // index in channels; -1: the "Add channel" tile
        FrameLayout box;
        PlayerView view;
        ExoPlayer player;
        TextView label, state, add;
        ProgressBar spin;
        int tries;
    }

    private JSONArray channels;
    private final List<Group> groups = new ArrayList<>();
    private String template = "";
    private int maxConn;
    // Four places, made once: a playing video is never moved (a moved SurfaceView went black).
    private final Tile[] slots = new Tile[MAX];
    private LinearLayout rows, row1, row2;
    private int focused;
    private final Handler main = new Handler(Looper.getMainLooper());
    private SleepTimer sleep;
    private int sleepMin;
    private DefaultHttpDataSource.Factory http;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat ic = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        ic.hide(WindowInsetsCompat.Type.systemBars());
        ic.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);

        List<Integer> start = new ArrayList<>();
        try {
            JSONObject p = new JSONObject(PlayerActivity.pending);
            sleepMin = p.optInt("sleep", 0);
            PlayerActivity.pending = null;
            channels = p.getJSONArray("channels");
            template = p.optString("template", "");
            maxConn = p.optInt("maxConn", 0);
            JSONArray gs = p.optJSONArray("groups");
            if (gs != null) for (int i = 0; i < gs.length(); i++) {
                JSONObject g = gs.getJSONObject(i);
                JSONArray it = g.getJSONArray("items");
                int[] items = new int[it.length()];
                for (int j = 0; j < items.length; j++) items[j] = it.getInt(j);
                groups.add(new Group(g.optString("name"), items));
            }
            JSONArray keys = p.optJSONArray("tiles");
            if (keys != null) for (int k = 0; k < keys.length() && start.size() < MAX; k++) {
                int at = indexOfKey(keys.optString(k));
                if (at >= 0 && !start.contains(at)) start.add(at);
            }
        } catch (Exception e) {
            finish();
            return;
        }

        http = new DefaultHttpDataSource.Factory()
            .setUserAgent("InkonabTV/1.0 (Android)")
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(10000)
            .setReadTimeoutMs(10000);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        rows = new LinearLayout(this);
        rows.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(4);
        rows.setPadding(pad, pad, pad, pad);
        root.addView(rows, new FrameLayout.LayoutParams(-1, -1));
        TextView hint = new TextView(this);
        hint.setText(R.string.mv_hint);
        hint.setTextColor(0xFFC9D0D6);
        hint.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        hint.setBackground(pill(0xB8080A0C));
        hint.setPadding(dp(12), dp(4), dp(12), dp(4));
        FrameLayout.LayoutParams hl = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        hl.bottomMargin = dp(14);
        root.addView(hint, hl);
        main.postDelayed(() -> hint.animate().alpha(0f).setDuration(600), 6000);
        setContentView(root);

        buildSlots();
        for (int k = 0; k < start.size(); k++) { slots[k].ch = start.get(k); startTile(slots[k]); }
        layoutTiles();
        focusTile(0);
        limitNote();

        sleep = new SleepTimer(this, sleepMin, () -> done(null));

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { done(null); }
        });
    }

    private int indexOfKey(String key) {
        if (key == null || key.isEmpty()) return -1;
        for (int i = 0; i < channels.length(); i++) if (key.equals(channels.optJSONObject(i).optString("gkey"))) return i;
        return -1;
    }

    // ---------- layout: one row of 2, or 2 rows of 2; empty places show "Add channel" ----------
    private void buildSlots() {
        row1 = new LinearLayout(this);
        row2 = new LinearLayout(this);
        rows.addView(row1);
        rows.addView(row2);
        rows.setGravity(Gravity.CENTER);
        for (int k = 0; k < MAX; k++) {
            Tile t = slots[k] = new Tile();
            buildTile(t);
            LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(0, -1, 1f);
            cl.setMargins(dp(3), dp(3), dp(3), dp(3));
            (k < 2 ? row1 : row2).addView(t.box, cl);
            final int at = k;
            t.box.setOnClickListener(v -> activate(at));
            t.box.setOnFocusChangeListener((v, has) -> { paintFocus(); if (has && slots[at].ch >= 0) setAudio(at); });
        }
    }

    private int filled() { int n = 0; for (Tile t : slots) if (t.ch >= 0) n++; return n; }

    private void layoutTiles() {
        // Two rows once a third place is needed (3 or 4 channels, or a channel in the lower row).
        boolean two = filled() >= 2 || slots[2].ch >= 0 || slots[3].ch >= 0;
        int w = getResources().getDisplayMetrics().widthPixels;
        row1.setLayoutParams(two ? new LinearLayout.LayoutParams(-1, 0, 1f) : new LinearLayout.LayoutParams(-1, (w / 2) * 9 / 16));
        row2.setVisibility(two ? View.VISIBLE : View.GONE);
        if (two) row2.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1f));
        for (int k = 0; k < MAX; k++) {
            Tile t = slots[k];
            boolean on = t.ch >= 0, inUse = k < 2 || two;
            t.view.setVisibility(on ? View.VISIBLE : View.GONE);
            t.label.setVisibility(on ? View.VISIBLE : View.GONE);
            t.add.setVisibility(on ? View.GONE : View.VISIBLE);
            if (!on) showState(t, null, false);
            // One row: the right-hand place is the "Add channel" tile.
            t.box.setVisibility(inUse ? View.VISIBLE : View.GONE);
            t.box.setFocusable(inUse);
            paintLabel(t);
        }
        paintFocus();
    }

    private void buildTile(Tile t) {
        FrameLayout box = t.box = new FrameLayout(this);
        box.setFocusable(true);
        box.setFocusableInTouchMode(false);
        box.setClickable(true);
        box.setBackground(round(0xFF0B0D10, 0));
        t.view = new PlayerView(this);
        t.view.setUseController(false);
        t.view.setShutterBackgroundColor(Color.BLACK);
        box.addView(t.view, new FrameLayout.LayoutParams(-1, -1));
        t.add = new TextView(this);
        t.add.setText(R.string.mv_add);
        t.add.setTextColor(0xFF9DB1B6);
        t.add.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        t.add.setGravity(Gravity.CENTER);
        box.addView(t.add, new FrameLayout.LayoutParams(-1, -1));
        t.spin = new ProgressBar(this);
        t.spin.setVisibility(View.GONE);
        box.addView(t.spin, new FrameLayout.LayoutParams(dp(36), dp(36), Gravity.CENTER));
        t.state = new TextView(this);
        t.state.setTextColor(Color.WHITE);
        t.state.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        t.state.setGravity(Gravity.CENTER);
        t.state.setVisibility(View.GONE);
        box.addView(t.state, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER));
        t.label = new TextView(this);
        t.label.setTextColor(Color.WHITE);
        t.label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.label.setTypeface(Typeface.DEFAULT_BOLD);
        t.label.setSingleLine(true);
        t.label.setBackground(pill(0xB8080A0C));
        t.label.setPadding(dp(10), dp(3), dp(10), dp(3));
        FrameLayout.LayoutParams ll = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
        ll.setMargins(dp(10), 0, dp(10), dp(10));
        box.addView(t.label, ll);
    }

    private void paintLabel(Tile t) {
        if (t.ch < 0) { t.label.setText(""); return; }
        String name = channels.optJSONObject(t.ch).optString("title");
        t.label.setText((slots[focused] == t ? "🔊 " : "") + name);
    }

    private void paintFocus() {
        for (Tile t : slots) t.box.setBackground(round(0xFF0B0D10, t.box.hasFocus() ? ACCENT : t.ch < 0 ? 0x40FFFFFF : 0));
    }

    // ---------- playback ----------
    private String urlFor(int ch) {
        JSONObject c = channels.optJSONObject(ch);
        JSONArray vs = c.optJSONArray("versions");
        JSONObject v = vs != null && vs.length() > 0 ? vs.optJSONObject(0) : new JSONObject();
        String u = v.optString("url", "");
        return !u.isEmpty() ? u : template.replace("{id}", v.optString("id"));
    }

    private void startTile(Tile t) {
        stopTile(t);
        if (t.ch < 0) return;
        // Four decoders at once: keep each picture small (a quarter of the screen), and let a
        // stream fall back to software decoding when the TV's video decoders are all in use.
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true);
        DefaultLoadControl buffers = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(30000, 30000, 1500, 1000)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build();
        ExoPlayer p = t.player = new ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http))
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(12)))
            .setLoadControl(buffers)
            .build();
        p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon().setMaxVideoSize(1280, 720).build());
        p.setWakeMode(C.WAKE_MODE_NETWORK);
        p.setVolume(slots[focused] == t ? 1f : 0f);
        t.view.setPlayer(p);
        showState(t, null, true);
        p.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int s) {
                if (s == Player.STATE_READY) { t.tries = 0; showState(t, null, false); }
                else if (s == Player.STATE_BUFFERING) showState(t, null, true);
            }
            @Override public void onPlayerError(PlaybackException e) { failed(t, e); }
        });
        p.setMediaItem(MediaItem.fromUri(urlFor(t.ch)));
        p.prepare();
        p.setPlayWhenReady(true);
    }

    private void failed(Tile t, PlaybackException e) {
        if (t.player == null) return;
        int code = e.errorCode;
        boolean decoder = code == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED || code == PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED
            || code == PlaybackException.ERROR_CODE_DECODING_FAILED || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES;
        if (!decoder && t.tries < 2) {
            t.tries++;
            int ch = t.ch;
            stopTile(t);
            showState(t, null, true);
            main.postDelayed(() -> { if (t.ch == ch && t.player == null) startTile(t); }, 3000);
            return;
        }
        stopTile(t);
        showState(t, getString(decoder ? R.string.mv_decoders : R.string.mv_cant_play), false);
    }

    private void stopTile(Tile t) {
        if (t.player != null) {
            t.player.release();
            t.player = null;
        }
        if (t.view != null) t.view.setPlayer(null);
    }

    private void showState(Tile t, String msg, boolean loading) {
        if (t.spin != null) t.spin.setVisibility(loading ? View.VISIBLE : View.GONE);
        if (t.state != null) {
            t.state.setText(msg == null ? "" : msg);
            t.state.setVisibility(msg == null ? View.GONE : View.VISIBLE);
        }
    }

    private void setAudio(int i) {
        focused = i;
        for (int k = 0; k < MAX; k++) {
            Tile t = slots[k];
            if (t.player != null) t.player.setVolume(k == i ? 1f : 0f);
            paintLabel(t);
        }
    }

    private void focusTile(int i) {
        main.post(() -> {
            slots[i].box.requestFocus();
            if (slots[i].ch >= 0) setAudio(i);
            paintFocus();
        });
    }

    private void limitNote() {
        if (maxConn > 0 && filled() > maxConn)
            Toast.makeText(this, getString(R.string.mv_limit, maxConn), Toast.LENGTH_LONG).show();
    }

    // ---------- menus ----------
    private void activate(int i) {
        Tile t = slots[i];
        if (t.ch < 0) { pick(i); return; }
        String name = channels.optJSONObject(t.ch).optString("title");
        String[] items = { getString(R.string.mv_full), getString(R.string.mv_change), getString(R.string.mv_remove) };
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(name)
            .setItems(items, (d, w) -> {
                if (w == 0) done(channels.optJSONObject(t.ch).optString("gkey"));
                else if (w == 1) pick(i);
                else remove(i);
            })
            .show();
    }

    private void remove(int i) {
        Tile t = slots[i];
        stopTile(t);
        t.ch = -1;
        layoutTiles();
        int to = i;
        for (int k = 0; k < MAX; k++) if (slots[k].ch >= 0) { to = k; break; }
        focusTile(slots[to].box.getVisibility() == View.VISIBLE ? to : 0);
    }

    /** Channel picker: a group, then a channel, for that place (empty or not). */
    private void pick(int slot) {
        if (groups.isEmpty()) return;
        String[] names = new String[groups.size()];
        for (int g = 0; g < names.length; g++) names[g] = groups.get(g).name + "  (" + groups.get(g).items.length + ")";
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(R.string.mv_add_title)
            .setItems(names, (d, g) -> pickChannel(slot, groups.get(g)))
            .show();
    }

    private void pickChannel(int slot, Group g) {
        int n = Math.min(g.items.length, 500);
        String[] names = new String[n];
        for (int k = 0; k < n; k++) {
            JSONObject c = channels.optJSONObject(g.items[k]);
            String num = c.optString("num");
            names[k] = (num.isEmpty() ? "" : num + "  ") + c.optString("title");
        }
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(g.name)
            .setItems(names, (d, k) -> place(slot, g.items[k]))
            .show();
    }

    private void place(int slot, int ch) {
        for (int k = 0; k < MAX; k++) if (slots[k].ch == ch && k != slot) {
            Toast.makeText(this, R.string.mv_already, Toast.LENGTH_SHORT).show();
            focusTile(k);
            return;
        }
        Tile t = slots[slot];
        boolean added = t.ch < 0;
        t.ch = ch;
        t.tries = 0;
        startTile(t);
        layoutTiles();
        focusTile(slot);
        if (added) limitNote();
    }

    // ---------- closing ----------
    private void done(String fullKey) {
        JSONArray keys = new JSONArray();
        for (Tile t : slots) if (t.ch >= 0) keys.put(channels.optJSONObject(t.ch).optString("gkey"));
        Intent data = new Intent();
        data.putExtra("tiles", keys.toString());
        if (slots[focused].ch >= 0) data.putExtra("focus", channels.optJSONObject(slots[focused].ch).optString("gkey"));
        if (fullKey != null) data.putExtra("full", fullKey);
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (sleep != null && sleep.touch() && e.getAction() == KeyEvent.ACTION_DOWN) return true;
        // Remotes with a Menu / Info key: the tile menu, like OK.
        if (e.getAction() == KeyEvent.ACTION_UP && (e.getKeyCode() == KeyEvent.KEYCODE_MENU || e.getKeyCode() == KeyEvent.KEYCODE_INFO)) {
            View f = getCurrentFocus();
            if (f != null) f.performClick();
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Leaving the app (Home): nothing keeps streaming in the background.
        for (Tile t : slots) if (t != null && t.player != null) t.player.pause();
    }

    @Override
    protected void onStart() {
        super.onStart();
        for (Tile t : slots) if (t != null && t.player != null) t.player.play();
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (sleep != null) sleep.stop();
        for (Tile t : slots) if (t != null) stopTile(t);
        super.onDestroy();
    }

    // ---------- drawing ----------
    private int dp(int v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    private GradientDrawable round(int fill, int stroke) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(10));
        if (stroke != 0) d.setStroke(dp(3), stroke);
        return d;
    }

    private GradientDrawable pill(int fill) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(999));
        return d;
    }
}
