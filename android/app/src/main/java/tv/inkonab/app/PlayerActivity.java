package tv.inkonab.app;

import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
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
import org.json.JSONException;
import org.json.JSONObject;

import tv.inkonab.app.vpn.VpnManager;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.HashSet;
import java.util.List;

/**
 * Full-screen player started from the web UI (see NativePlayerPlugin).
 *
 * Payload (handed over in {@link #pending}, it can be larger than an Intent allows):
 *   { live, template, group, index, version, startAt,
 *     channels: [{ title, subtitle, img, num, radio, gkey, fav, versions: [{ url | id, label }] }],
 *     groups:   [{ key, name, items: [channel index…] }] }
 *   live extras: epg (guide link, {id}), catchup (replay link, {min} {start} {id}), tz, shift;
 *   each channel: epgId (stream whose guide we read), cu (catch-up stream).
 * VOD sends one channel and no groups. Live remote (Apple-style, each panel closes with the
 * opposite arrow or Back): ▼ / OK info panel, ▲ channel strip (▲ again: every group),
 * ◀ channel list, ▶ this channel's programmes, CH+/CH− change channel, digits type a number.
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {
    static String pending;
    private static final int ACCENT = 0xFFFBC50C;
    private static final int MUTED = 0xFF9DB1B6;

    private static final class Group {
        final String key, name;
        final int[] items;
        Group(String key, String name, int[] items) { this.key = key; this.name = name; this.items = items; }
    }

    private ExoPlayer player;
    private PlayerView view;
    private JSONArray channels;
    private final List<Group> groups = new ArrayList<>();
    private String template = "";
    private int group, index, version;
    private boolean live, ended, controlsShown;

    private final ArrayList<String> history = new ArrayList<>();
    // Automatic recovery: copies (version × format) already tried for the current channel.
    private final HashSet<String> tried = new HashSet<>();
    private boolean altFormat, readyOnce;
    private int reconnects;              // quiet reconnects in a row (reset once it plays again)
    private final List<Long> freezes = new ArrayList<>();
    private String epgTpl = "", cuTpl = "", tz = "UTC";
    private double shift;                // "Catch-up time correction" (hours)
    private String replayUrl;            // a past programme playing from the channel's archive
    private String replayTitle = "";
    private int vpnAttempts;             // VPN servers (countries) tried for the current channel
    private boolean vpnTried, directTried, vpnWatch;
    private TextView vpnChip;
    private final VpnManager.Listener vpnListener = (st, detail) -> runOnUiThread(() -> paintVpn(st, detail));
    private static final int REQ_VPN = 42;
    private final JSONObject favChanges = new JSONObject();

    private View topBar;
    private TextView titleView, subView, qualityView, favChip, errorView, numView;
    private ImageView radioArt;
    private LinearLayout side;
    private ListView groupList, chanList;
    private BaseAdapter groupAdapter, chanAdapter;
    private int previewGroup;
    private boolean swallowCenterUp;
    private boolean barActive;   // OK menu: the top bar has focus and the remote moves between its buttons
    private final Runnable barTimeout = this::hideBar;
    private final StringBuilder digits = new StringBuilder();
    private final LogoLoader logos = new LogoLoader();
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        long startAtMs = 0;
        try {
            JSONObject p = new JSONObject(pending);
            pending = null;
            channels = p.getJSONArray("channels");
            live = p.optBoolean("live", false);
            template = p.optString("template", "");
            epgTpl = p.optString("epg", "");
            cuTpl = p.optString("catchup", "");
            tz = p.optString("tz", "UTC");
            shift = p.optDouble("shift", 0);
            group = p.optInt("group", 0);
            index = p.optInt("index", 0);
            version = p.optInt("version", 0);
            startAtMs = (long) (p.optDouble("startAt", 0) * 1000);
            JSONArray gs = p.optJSONArray("groups");
            if (gs != null) {
                for (int i = 0; i < gs.length(); i++) {
                    JSONObject g = gs.getJSONObject(i);
                    JSONArray it = g.getJSONArray("items");
                    int[] items = new int[it.length()];
                    for (int j = 0; j < items.length; j++) items[j] = it.getInt(j);
                    groups.add(new Group(g.optString("key"), g.optString("name"), items));
                }
            }
            if (groups.isEmpty()) {
                int[] all = new int[channels.length()];
                for (int i = 0; i < all.length; i++) all[i] = i;
                groups.add(new Group("", "", all));
            }
            group = clamp(group, groups.size());
            index = clamp(index, groups.get(group).items.length);
        } catch (Exception e) {
            finish();
            return;
        }

        buildUi();

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("InkonabTV/1.0 (Android)")
            .setAllowCrossProtocolRedirects(true) // the provider redirects HTTPS → HTTP
            .setConnectTimeoutMs(10000)
            .setReadTimeoutMs(10000);
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true);
        // Slow or unsteady lines: keep up to 2 minutes ahead, start after 2.5 s, and after a freeze
        // wait for 6 s of video so it doesn't stop again straight away. A lost segment is retried
        // 8 times before it counts as an error.
        DefaultLoadControl buffers = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(30000, 120000, 2500, 6000)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build();
        player = new ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http))
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(8)))
            .setLoadControl(buffers)
            .build();
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_BUFFERING && readyOnce) onFreeze();
                if (state == Player.STATE_READY) {
                    readyOnce = true;
                    reconnects = 0;
                    main.removeCallbacks(watchdog);
                    errorView.setVisibility(View.GONE);
                    onPlaying();
                }
                if (state == Player.STATE_ENDED && replayUrl != null) load(0);
                if (state == Player.STATE_ENDED && !live) {
                    ended = true;
                    finishWithResult();
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                if (reconnect(error)) return;
                onFail(error.getErrorCodeName());
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (sideShown()) hideSide();
                else if (panelShown()) hidePanels();
                else if (barActive) hideBar();
                else if (replayUrl != null) load(0); // leaving a replay goes back to the live channel
                else if (controlsShown && !live) view.hideController();
                else if (live) backOnLive();
                else finishWithResult();
            }
        });

        VpnManager vpn = VpnManager.get();
        vpn.init(this);
        vpn.addListener(vpnListener);
        paintVpn(vpn.state(), vpn.detail());
        load(startAtMs);
    }

    private static int clamp(int v, int n) { return Math.max(0, Math.min(v, Math.max(0, n - 1))); }

    // ---------- data ----------

    private JSONObject channelAt(int flat) {
        try { return channels.getJSONObject(flat); } catch (JSONException e) { return new JSONObject(); }
    }

    private int flatIndex() { return groups.get(group).items[index]; }

    private JSONObject current() { return channelAt(flatIndex()); }

    private String urlOf(JSONObject v) {
        String url = v.optString("url", "");
        if (!url.isEmpty()) return url;
        String u = template.replace("{id}", v.optString("id"));
        if (!altFormat) return u;
        if (u.endsWith(".m3u8")) return u.substring(0, u.length() - 5) + ".ts";
        if (u.endsWith(".ts")) return u.substring(0, u.length() - 3) + ".m3u8";
        return u;
    }

    // ---------- automatic recovery ----------

    /**
     * A stream that played and then dropped (network error, or fell behind a live window)
     * reconnects quietly at the same position, waiting a little longer each time.
     */
    private boolean reconnect(PlaybackException e) {
        boolean net = e.errorCode >= 2000 && e.errorCode < 3000;
        boolean behind = e.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW;
        if (!readyOnce || !(net || behind) || reconnects >= 8) return false;
        reconnects++;
        main.postDelayed(() -> {
            if (isFinishing()) return;
            if (behind) player.seekToDefaultPosition();
            player.prepare();
            player.play();
        }, Math.min(8000, 1000L * reconnects));
        return true;
    }

    // A channel that plays is kept: a freeze is waited out. Only when it goes back to loading
    // more than 3 times within 15 s does it move to another copy of the channel, and when every
    // copy has been tried, to a VPN server in another country (VPN version only).
    private void onFreeze() {
        long now = System.currentTimeMillis();
        while (!freezes.isEmpty() && now - freezes.get(0) > 15000) freezes.remove(0);
        freezes.add(now);
        if (freezes.size() <= 3 || !live) return;
        freezes.clear();
        if (nextCopy()) return;
        tryVpn();
    }

    private boolean nextCopy() {
        JSONArray vs = current().optJSONArray("versions");
        if (vs == null) return false;
        int flat = flatIndex();
        tried.add(flat + ":" + version + ":" + altFormat);
        for (int i = 0; i < vs.length(); i++) {
            if (!tried.contains(flat + ":" + i + ":" + altFormat)) {
                version = i;
                Toast.makeText(this, "Keeps stopping · trying another copy (" + vs.optJSONObject(i).optString("label", "") + ")…", Toast.LENGTH_SHORT).show();
                load(0);
                return true;
            }
        }
        return false;
    }

    // A stream that never starts within 15 s counts as failed.
    private final Runnable watchdog = () -> { if (!readyOnce && live) onFail("timeout"); };

    private void onFail(String why) {
        main.removeCallbacks(watchdog);
        if (live && autoRetry()) return;
        if (tryVpn()) return;
        showError(live
            ? "Can't play this channel (tried every copy and format" + (vpnTried ? ", and VPN servers in " + vpnAttempts + " countries" : "") + ").\n▲ ▼ change channel · ◀ channel list"
            : "Can't play this file (" + why + ").");
    }

    /** Try the channel's other quality copies, then the other stream format (HLS ↔ MPEG-TS). */
    private boolean autoRetry() {
        JSONArray vs = current().optJSONArray("versions");
        if (vs == null) return false;
        int flat = flatIndex();
        tried.add(flat + ":" + version + ":" + altFormat);
        if (tried.size() >= 6) return false; // keep the wait short when a channel is truly down
        for (int i = 0; i < vs.length(); i++) {
            if (!tried.contains(flat + ":" + i + ":" + altFormat)) {
                version = i;
                Toast.makeText(this, "Trying another copy (" + vs.optJSONObject(i).optString("label", "") + ")…", Toast.LENGTH_SHORT).show();
                load(0);
                return true;
            }
        }
        if (!altFormat && vs.optJSONObject(0).optString("url", "").isEmpty()) {
            altFormat = true;
            version = 0;
            Toast.makeText(this, "Trying another stream format…", Toast.LENGTH_SHORT).show();
            load(0);
            return true;
        }
        return false;
    }

    // A channel or quality chosen by the viewer starts a fresh recovery cycle.
    private void freshStart() {
        tried.clear();
        altFormat = false;
        vpnTried = false;
        vpnAttempts = 0;
        directTried = false;
    }

    // ---------- free VPN ----------
    // MBC PLAY (free channels) refuse VPN addresses and always play directly. Provider streams go
    // through the VPN once it has been needed (the working server is remembered); a stream that
    // won't play tries VPN servers country by country until one works.

    private static final int MAX_COUNTRIES = 6;

    private boolean isFree(JSONObject ch) { return ch.optBoolean("free", false); }

    /** Before playing: drop the VPN for MBC PLAY, or bring it up for provider streams that need it. */
    private boolean gateVpn(long startAtMs) {
        VpnManager vpn = VpnManager.get();
        vpn.init(this);
        JSONObject ch = current();
        titleView.setText(live && !ch.optString("num").isEmpty() ? ch.optString("num") + "  " + ch.optString("title") : ch.optString("title"));
        String gname = groups.get(group).name;
        subView.setText(live && !gname.isEmpty() ? gname : ch.optString("subtitle"));
        if (qualityView.getText().length() == 0) qualityView.setVisibility(View.GONE);
        if (isFree(ch)) {
            if (!vpn.busy()) return false;
            showInfo("MBC PLAY plays without the VPN — disconnecting…");
            vpn.pauseForDirect();
            main.postDelayed(() -> startPlayback(startAtMs), 1200);
            return true;
        }
        if (vpn.isUp() || !vpn.shouldUseForProvider() || vpn.consentIntent(this) != null) return false;
        String next = vpn.nextLabel();
        showInfo("Connecting to VPN" + (next.isEmpty() ? "…" : " · " + next + "…"));
        vpnWatch = true;
        vpn.connectForPlayback((ok, detail) -> runOnUiThread(() -> { if (!isFinishing() && player != null) startPlayback(startAtMs); }));
        return true;
    }

    /** A provider stream that won't play: VPN on → try a server in another country, up to 6. */
    private boolean tryVpn() {
        VpnManager vpn = VpnManager.get();
        vpn.init(this);
        String mode = vpn.mode();
        if ("off".equals(mode) || isFree(current())) return false;
        if (vpnAttempts >= MAX_COUNTRIES) {
            // None of them helped: a last direct try, then give up.
            if (vpn.busy() && !directTried && !"always".equals(mode)) {
                directTried = true;
                showInfo("Trying without the VPN…");
                vpn.disconnect();
                main.postDelayed(() -> { tried.clear(); altFormat = false; startPlayback(live ? 0 : player.getCurrentPosition()); }, 1500);
                return true;
            }
            if (vpn.autoStarted() && !vpn.needVpn()) vpn.disconnect();
            return false;
        }
        vpnTried = true;
        vpnAttempts++;
        if (vpn.isUp()) {
            showInfo("Not playing through " + vpn.serverLabel() + "\nTrying a VPN server in another country…");
            vpnWatch = true;
            vpn.switchServer(this::afterVpn);
            return true;
        }
        Intent consent = vpn.consentIntent(this);
        if (consent != null) {
            showInfo("Allow InkonabTV's VPN to play this channel");
            startActivityForResult(consent, REQ_VPN);
        } else {
            connectVpn();
        }
        return true;
    }

    private void connectVpn() {
        String next = VpnManager.get().nextLabel();
        showInfo("Connecting to VPN" + (next.isEmpty() ? "…" : " · " + next + "…"));
        vpnWatch = true;
        VpnManager.get().connectForPlayback(this::afterVpn);
    }

    private void afterVpn(boolean ok, String detail) {
        runOnUiThread(() -> {
            if (isFinishing() || player == null) return;
            if (!ok) {
                vpnWatch = false;
                if ("Disconnected".equals(detail)) return; // we dropped it ourselves (e.g. switched to MBC PLAY)
                VpnManager vpn = VpnManager.get();
                if (vpn.autoStarted() && !vpn.needVpn()) vpn.disconnect();
                showError("Can't play this " + (live ? "channel" : "file") + ", even through the free VPN (" + detail + ").");
                return;
            }
            tried.clear();
            altFormat = false;
            startPlayback(live ? 0 : player.getCurrentPosition());
        });
    }

    /** Playback started: if it went through the VPN, remember that server for next time. */
    private void onPlaying() {
        VpnManager vpn = VpnManager.get();
        if (isFree(current()) || !vpn.isUp()) return;
        vpn.markGood();
        if (vpnWatch) Toast.makeText(this, "Playing through VPN · " + vpn.serverLabel() + " — remembered for next time", Toast.LENGTH_LONG).show();
        vpnWatch = false;
    }

    // Live VPN status in the top bar; while connecting for this channel, also in the message.
    private void paintVpn(VpnManager.State st, String detail) {
        if (vpnChip == null) return;
        VpnManager vpn = VpnManager.get();
        String label;
        int bg;
        switch (st) {
            case CONNECTED: label = "VPN · " + vpn.serverLabel().split(" · ")[0]; bg = 0xFF1F8F55; break;
            case CONNECTING: label = "VPN connecting…"; bg = 0xFFB07A10; break;
            default: label = "VPN off"; bg = 0x33FFFFFF;
        }
        vpnChip.setText(label);
        vpnChip.setBackground(rounded(bg, 24));
        vpnChip.setVisibility("off".equals(vpn.mode()) && st != VpnManager.State.CONNECTED ? View.GONE : View.VISIBLE);
        if (vpnWatch && st == VpnManager.State.CONNECTING && detail != null && detail.startsWith("Connecting to VPN")) showInfo(detail + "…");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_VPN) return;
        if (VpnManager.get().consentIntent(this) == null) connectVpn();
        else showError("The VPN wasn't allowed, so this channel can't be retried through it.");
    }

    private void showInfo(String msg) {
        errorView.setText(msg);
        errorView.setVisibility(View.VISIBLE);
    }

    // ---------- UI ----------

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        view = new PlayerView(this);
        view.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        view.setControllerShowTimeoutMs(3500);
        view.setKeepContentOnPlayerReset(false);
        if (live) {
            view.setShowFastForwardButton(false);
            view.setShowRewindButton(false);
            view.setShowNextButton(false);
            view.setShowPreviousButton(false);
        }
        root.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        radioArt = new ImageView(this);
        radioArt.setScaleType(ImageView.ScaleType.FIT_CENTER);
        radioArt.setVisibility(View.GONE);
        root.addView(radioArt, new FrameLayout.LayoutParams(dp(260), dp(200), Gravity.CENTER));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(28), dp(20), dp(28), dp(40));
        bar.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xC0000000, 0x00000000}));

        TextView back = chip("‹", false);
        back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        back.setOnClickListener(v -> finishWithResult());
        bar.addView(back);

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setPadding(dp(16), 0, dp(16), 0);
        titleView = text(22, Color.WHITE, true);
        subView = text(14, 0xFFC2CED1, false);
        texts.addView(titleView);
        texts.addView(subView);
        bar.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        qualityView = chip("", true);
        qualityView.setOnClickListener(v -> switchVersion(1));
        bar.addView(qualityView);
        vpnChip = chip("VPN off", false);
        vpnChip.setFocusable(false);
        bar.addView(vpnChip);
        favChip = chip("☆", false);
        favChip.setOnClickListener(v -> toggleFav(flatIndex()));
        if (live) {
            bar.addView(favChip);
            TextView list = chip("☰", false);
            list.setOnClickListener(v -> { hideBar(); openSide(); });
            bar.addView(list);
            TextView prev = chip("▲", false);
            prev.setOnClickListener(v -> zap(-1));
            TextView next = chip("▼", false);
            next.setOnClickListener(v -> zap(1));
            bar.addView(prev);
            bar.addView(next);
        }
        topBar = bar;
        root.addView(bar, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        view.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            if (!barActive) topBar.setVisibility(visibility);
            controlsShown = visibility == View.VISIBLE;
        });

        errorView = text(18, Color.WHITE, false);
        errorView.setSingleLine(false);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(dp(32), dp(24), dp(32), dp(24));
        errorView.setBackground(rounded(0xCC000000, 18));
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        numView = text(56, ACCENT, true);
        numView.setPadding(dp(24), dp(8), dp(24), dp(8));
        numView.setBackground(rounded(0x99000000, 18));
        numView.setVisibility(View.GONE);
        FrameLayout.LayoutParams numLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
        numLp.setMargins(0, dp(28), dp(36), 0);
        root.addView(numView, numLp);

        if (live) {
            buildSide(root);
            buildPanels(root);
        }
        setContentView(root);
    }

    private TextView text(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setSingleLine(true);
        t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        return t;
    }

    private GradientDrawable rounded(int color, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    private TextView chip(String label, boolean accent) {
        TextView t = text(15, accent ? 0xFF1D1600 : Color.WHITE, true);
        t.setText(label);
        t.setGravity(Gravity.CENTER);
        t.setMinWidth(dp(48));
        t.setPadding(dp(14), dp(8), dp(14), dp(8));
        t.setFocusable(true);
        t.setClickable(true);
        android.graphics.drawable.StateListDrawable bg = new android.graphics.drawable.StateListDrawable();
        GradientDrawable focused = rounded(accent ? ACCENT : 0x66FFFFFF, 24);
        focused.setStroke(dp(3), Color.WHITE);
        bg.addState(new int[]{android.R.attr.state_focused}, focused);
        bg.addState(new int[]{}, rounded(accent ? ACCENT : 0x33FFFFFF, 24));
        t.setBackground(bg);
        t.setOnFocusChangeListener((v, has) -> {
            v.animate().scaleX(has ? 1.12f : 1f).scaleY(has ? 1.12f : 1f).setDuration(120).start();
            if (has && barActive) { main.removeCallbacks(barTimeout); main.postDelayed(barTimeout, 8000); }
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMarginStart(dp(8));
        t.setLayoutParams(lp);
        return t;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    private void showError(String msg) {
        errorView.setText(msg);
        errorView.setVisibility(View.VISIBLE);
    }

    // Show the channel name for a few seconds after zapping, without the playback controls.
    private final Runnable hideTopBar = () -> { if (!controlsShown && !barActive) topBar.setVisibility(View.GONE); };

    /** OK menu: show the top bar and put the focus on ★ Favorite; ◀/▶ move, OK presses, ▼/Back close. */
    private void showBar() {
        barActive = true;
        view.hideController();
        topBar.setVisibility(View.VISIBLE);
        favChip.requestFocus();
        main.removeCallbacks(barTimeout);
        main.postDelayed(barTimeout, 8000);
    }

    private void hideBar() {
        barActive = false;
        main.removeCallbacks(barTimeout);
        topBar.setVisibility(View.GONE);
        view.requestFocus();
    }

    // Live: Back first clears the screen (only the video stays), then two presses within
    // 2.5 s leave the channel. A channel showing an error closes at once.
    private long backAt;

    private void backOnLive() {
        if (errorView.getVisibility() == View.VISIBLE) { finishWithResult(); return; }
        if (topBar.getVisibility() == View.VISIBLE || controlsShown || numView.getVisibility() == View.VISIBLE) {
            main.removeCallbacks(hideTopBar);
            main.removeCallbacks(applyDigits);
            digits.setLength(0);
            numView.setVisibility(View.GONE);
            topBar.setVisibility(View.GONE);
            view.hideController();
            view.requestFocus();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - backAt < 2500) { finishWithResult(); return; }
        backAt = now;
        Toast.makeText(this, "Press Back again to leave the channel", Toast.LENGTH_SHORT).show();
    }

    private void flashTopBar() {
        topBar.setVisibility(View.VISIBLE);
        main.removeCallbacks(hideTopBar);
        main.postDelayed(hideTopBar, 3500);
    }

    // ---------- guide panels: info (▼), channel strip (▲), programmes (▶) ----------

    private static final class Prog {
        final String title;
        final long start, end;
        final boolean archive;
        Prog(String title, long start, long end, boolean archive) { this.title = title; this.start = start; this.end = end; this.archive = archive; }
    }

    private interface Got { void on(List<Prog> list); }

    private LinearLayout info, infoActs, strip, stripRow, sched;
    private TextView infoTitle, infoTime, infoLeft, infoNext, stripTitle, schedTitle;
    private ProgressBar infoBar;
    private HorizontalScrollView stripScroll;
    private ListView schedList;
    private BaseAdapter schedAdapter;
    private final List<Prog> schedRows = new ArrayList<>();
    private final Map<String, Object[]> epgCache = new HashMap<>();
    private final Runnable panelTimeout = this::hidePanels;

    private String hm(long t) { return android.text.format.DateFormat.getTimeFormat(this).format(new Date(t)); }

    /** The channel's guide (a week back, a few days ahead), cached 20 minutes. */
    @SuppressWarnings("unchecked")
    private void programmes(JSONObject ch, Got got) {
        String id = ch.optString("epgId", "");
        if (id.isEmpty() || epgTpl.isEmpty()) { got.on(new ArrayList<>()); return; }
        Object[] hit = epgCache.get(id);
        if (hit != null && System.currentTimeMillis() - (long) hit[0] < 20 * 60000) { got.on((List<Prog>) hit[1]); return; }
        String link = epgTpl.replace("{id}", id);
        new Thread(() -> {
            List<Prog> out = new ArrayList<>();
            try {
                String at = link;
                HttpURLConnection c = null;
                for (int hops = 0; hops < 4; hops++) { // the provider redirects HTTPS → HTTP
                    c = (HttpURLConnection) new URL(at).openConnection();
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(15000);
                    c.setInstanceFollowRedirects(false);
                    c.setRequestProperty("User-Agent", "InkonabTV/1.0 (Android)");
                    int code = c.getResponseCode();
                    if (code < 300 || code >= 400) break;
                    at = new URL(new URL(at), c.getHeaderField("Location")).toString();
                }
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                try (InputStream in = c.getInputStream()) {
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                }
                JSONArray a = new JSONObject(b.toString("UTF-8")).optJSONArray("epg_listings");
                for (int i = 0; a != null && i < a.length(); i++) {
                    JSONObject e = a.optJSONObject(i);
                    if (e == null) continue;
                    Prog pr = new Prog(b64(e.optString("title")), e.optLong("start_timestamp") * 1000, e.optLong("stop_timestamp") * 1000, e.optInt("has_archive") == 1);
                    if (pr.end > pr.start) out.add(pr);
                }
            } catch (Exception ignored) {
            }
            out.sort((x, y) -> Long.compare(x.start, y.start));
            runOnUiThread(() -> {
                if (!out.isEmpty()) epgCache.put(id, new Object[]{System.currentTimeMillis(), out});
                got.on(out);
            });
        }).start();
    }

    private static String b64(String s) {
        try { return new String(Base64.decode(s, Base64.DEFAULT), "UTF-8"); } catch (Exception e) { return s; }
    }

    private boolean canReplay(JSONObject ch, Prog p) {
        return p.archive && p.end <= System.currentTimeMillis() && !ch.optString("cu").isEmpty() && !cuTpl.isEmpty();
    }

    /** The provider's catch-up link; the start time is written in the server's timezone. */
    private String catchupUrl(String id, Prog p) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd:HH-mm", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone(tz.isEmpty() ? "UTC" : tz));
        String start = f.format(new Date(p.start + (long) (shift * 3600e3)));
        long min = Math.max(1, Math.round((p.end - p.start) / 60000.0 + 2));
        return cuTpl.replace("{min}", String.valueOf(min)).replace("{start}", start).replace("{id}", id);
    }

    private void playReplay(Prog p) {
        replayUrl = catchupUrl(current().optString("cu"), p);
        replayTitle = p.title;
        hidePanels();
        startPlayback(0);
    }

    private LinearLayout panelBox(int orientation) {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(orientation);
        l.setVisibility(View.GONE);
        return l;
    }

    private void buildPanels(FrameLayout root) {
        // Info panel (▼): now / next, progress, and actions.
        info = panelBox(LinearLayout.VERTICAL);
        info.setPadding(dp(26), dp(20), dp(26), dp(20));
        info.setBackground(rounded(0xEE081013, 20));
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView tag = text(12, 0xFF1D1600, true);
        tag.setText("NOW");
        tag.setPadding(dp(8), dp(2), dp(8), dp(2));
        tag.setBackground(rounded(ACCENT, 6));
        infoTitle = text(22, Color.WHITE, true);
        infoTitle.setPadding(dp(12), 0, 0, 0);
        head.addView(tag);
        head.addView(infoTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        info.addView(head);
        infoBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        infoBar.setMax(1000);
        infoBar.setProgressTintList(ColorStateList.valueOf(ACCENT));
        infoBar.setProgressBackgroundTintList(ColorStateList.valueOf(0x55FFFFFF));
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8));
        barLp.setMargins(0, dp(12), 0, dp(6));
        info.addView(infoBar, barLp);
        LinearLayout meta = new LinearLayout(this);
        infoTime = text(14, 0xFFC2CED1, false);
        infoLeft = text(14, 0xFFC2CED1, false);
        meta.addView(infoTime, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        meta.addView(infoLeft);
        info.addView(meta);
        infoNext = text(14, MUTED, false);
        infoNext.setPadding(0, dp(6), 0, dp(12));
        info.addView(infoNext);
        infoActs = new LinearLayout(this);
        infoActs.setGravity(Gravity.CENTER_VERTICAL);
        info.addView(infoActs);
        FrameLayout.LayoutParams infoLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        infoLp.setMargins(dp(36), 0, dp(36), dp(28));
        root.addView(info, infoLp);

        // Channel strip (▲): the group's channels in a row, the video keeps playing.
        strip = panelBox(LinearLayout.VERTICAL);
        strip.setPadding(dp(26), dp(16), dp(26), dp(18));
        strip.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xF2081013, 0xCC081013}));
        stripTitle = text(12, ACCENT, true);
        stripTitle.setLetterSpacing(0.12f);
        stripTitle.setPadding(dp(4), 0, 0, dp(10));
        strip.addView(stripTitle);
        stripScroll = new HorizontalScrollView(this);
        stripScroll.setHorizontalScrollBarEnabled(false);
        stripRow = new LinearLayout(this);
        stripRow.setPadding(dp(6), dp(6), dp(6), dp(6));
        stripScroll.addView(stripRow);
        strip.addView(stripScroll);
        TextView stripHint = text(12, MUTED, false);
        stripHint.setText("OK: watch · ◀ ▶: browse · ▲: all groups · ▼: close");
        stripHint.setPadding(dp(4), dp(8), 0, 0);
        strip.addView(stripHint);
        root.addView(strip, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        // Programmes (▶): today on this channel; past ones replay when the channel keeps them.
        sched = panelBox(LinearLayout.VERTICAL);
        sched.setPadding(dp(22), dp(24), dp(18), dp(16));
        sched.setBackground(new GradientDrawable(GradientDrawable.Orientation.RIGHT_LEFT, new int[]{0xF7081013, 0xE6081013}));
        schedTitle = text(18, ACCENT, true);
        schedTitle.setPadding(dp(4), 0, 0, dp(12));
        sched.addView(schedTitle);
        schedList = list();
        sched.addView(schedList, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        TextView schedHint = text(12, MUTED, false);
        schedHint.setText("OK: watch / replay · ▲ ▼: move · ◀: close");
        schedHint.setPadding(dp(4), dp(10), 0, 0);
        sched.addView(schedHint);
        root.addView(sched, new FrameLayout.LayoutParams(dp(470), ViewGroup.LayoutParams.MATCH_PARENT, Gravity.END));
        schedAdapter = new BaseAdapter() {
            public int getCount() { return schedRows.size(); }
            public Object getItem(int p) { return schedRows.get(p); }
            public long getItemId(int p) { return p; }
            public View getView(int p, View convert, ViewGroup parent) {
                LinearLayout row = convert instanceof LinearLayout ? (LinearLayout) convert : schedRow();
                Prog pr = schedRows.get(p);
                long now = System.currentTimeMillis();
                boolean on = pr.start <= now && pr.end > now, past = pr.end <= now, replay = past && canReplay(current(), pr);
                ((TextView) row.getChildAt(0)).setText(hm(pr.start));
                ((TextView) row.getChildAt(1)).setText(pr.title);
                ((TextView) row.getChildAt(2)).setText(on ? "NOW" : replay ? "⟲ REPLAY" : "");
                row.setBackground(on ? rounded(0x30FBC50C, 12) : null);
                row.setAlpha(past && !replay ? 0.5f : 1f);
                return row;
            }
        };
        schedList.setAdapter(schedAdapter);
        schedList.setOnItemClickListener((a, v, p, id) -> pickProgramme(schedRows.get(p)));
    }

    private LinearLayout schedRow() {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(10), dp(10), dp(10), dp(10));
        TextView time = text(14, MUTED, false);
        time.setMinWidth(dp(64));
        TextView title = text(15, Color.WHITE, true);
        TextView tag = text(11, ACCENT, true);
        tag.setPadding(dp(8), 0, 0, 0);
        row.addView(time);
        row.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(tag);
        return row;
    }

    private boolean infoShown() { return info != null && info.getVisibility() == View.VISIBLE; }
    private boolean stripShown() { return strip != null && strip.getVisibility() == View.VISIBLE; }
    private boolean schedShown() { return sched != null && sched.getVisibility() == View.VISIBLE; }
    private boolean panelShown() { return infoShown() || stripShown() || schedShown(); }

    private void hidePanels() {
        main.removeCallbacks(panelTimeout);
        if (info == null) return;
        info.setVisibility(View.GONE);
        strip.setVisibility(View.GONE);
        sched.setVisibility(View.GONE);
        view.requestFocus();
    }

    private void showPanel(View panel, boolean timeout) {
        hidePanels();
        if (sideShown()) hideSide();
        view.hideController();
        topBar.setVisibility(View.GONE);
        panel.setVisibility(View.VISIBLE);
        if (timeout) main.postDelayed(panelTimeout, 10000);
    }

    private TextView act(String label, View.OnClickListener click) {
        TextView t = chip(label, false);
        t.setOnClickListener(click);
        infoActs.addView(t);
        return t;
    }

    private void openInfo() {
        if (info == null) return;
        JSONObject ch = current();
        showPanel(info, true);
        infoTitle.setText(ch.optString("title"));
        infoTime.setText("");
        infoLeft.setText("");
        infoNext.setText("Loading the guide…");
        infoBar.setProgress(0);
        infoActs.removeAllViews();
        Prog[] now = new Prog[1];
        if (!ch.optString("cu").isEmpty() && !cuTpl.isEmpty()) act("⟲ Start over", v -> {
            if (now[0] != null) playReplay(now[0]); else Toast.makeText(this, "No guide information for this channel.", Toast.LENGTH_SHORT).show();
        });
        act(ch.optBoolean("fav") ? "★ Favorite" : "☆ Favorite", v -> {
            toggleFav(flatIndex());
            ((TextView) v).setText(current().optBoolean("fav") ? "★ Favorite" : "☆ Favorite");
        });
        if (hasVersions()) act("Quality · " + current().optJSONArray("versions").optJSONObject(version).optString("label", ""), v -> { hidePanels(); switchVersion(1); });
        act("☰ Channels", v -> { hidePanels(); openSide(); });
        act("Programmes", v -> openSched());
        infoActs.getChildAt(0).requestFocus();
        int flat = flatIndex();
        programmes(ch, list -> {
            if (!infoShown() || flatIndex() != flat) return;
            long t = System.currentTimeMillis();
            Prog cur = null, next = null;
            for (Prog p : list) {
                if (cur == null && p.start <= t && p.end > t) cur = p;
                else if (next == null && p.start >= (cur != null ? cur.end : t)) next = p;
            }
            now[0] = cur;
            if (cur == null) { infoNext.setText("No guide information for this channel."); return; }
            infoTitle.setText(cur.title);
            infoTime.setText(hm(cur.start) + " – " + hm(cur.end) + "   ·   " + ch.optString("title"));
            infoLeft.setText(Math.max(1, Math.round((cur.end - t) / 60000.0)) + " min left");
            infoBar.setProgress((int) (1000 * (t - cur.start) / (cur.end - cur.start)));
            infoNext.setText(next != null ? "NEXT  " + hm(next.start) + " · " + next.title : "");
        });
    }

    private void openStrip() {
        if (strip == null) return;
        showPanel(strip, true);
        Group g = groups.get(group);
        stripTitle.setText(g.name.isEmpty() ? "CHANNELS" : g.name.toUpperCase(Locale.getDefault()));
        stripRow.removeAllViews();
        // A window around the channel playing keeps big groups quick to open.
        int from = Math.max(0, index - 60), to = Math.min(g.items.length, index + 61);
        View playing = null;
        for (int i = from; i < to; i++) {
            final int at = i;
            JSONObject c = channelAt(g.items[i]);
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setGravity(Gravity.CENTER_HORIZONTAL);
            card.setPadding(dp(10), dp(10), dp(10), dp(8));
            card.setFocusable(true);
            card.setClickable(true);
            android.graphics.drawable.StateListDrawable bg = new android.graphics.drawable.StateListDrawable();
            GradientDrawable focused = rounded(0x665AA9C8, 14);
            focused.setStroke(dp(3), Color.WHITE);
            bg.addState(new int[]{android.R.attr.state_focused}, focused);
            bg.addState(new int[]{}, rounded(i == index ? 0x40FBC50C : 0x1FFFFFFF, 14));
            card.setBackground(bg);
            ImageView logo = new ImageView(this);
            logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
            logos.load(logo, c.optString("img"));
            card.addView(logo, new LinearLayout.LayoutParams(dp(96), dp(54)));
            TextView name = text(13, Color.WHITE, true);
            name.setText((c.optString("num").isEmpty() ? "" : c.optString("num") + "  ") + c.optString("title"));
            name.setGravity(Gravity.CENTER);
            card.addView(name, new LinearLayout.LayoutParams(dp(150), ViewGroup.LayoutParams.WRAP_CONTENT));
            card.setOnFocusChangeListener((v, has) -> v.animate().scaleX(has ? 1.06f : 1f).scaleY(has ? 1.06f : 1f).setDuration(120).start());
            card.setOnClickListener(v -> {
                hidePanels();
                if (at == index) return;
                freshStart();
                index = at;
                version = 0;
                load(0);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMarginEnd(dp(10));
            stripRow.addView(card, lp);
            if (i == index) playing = card;
        }
        View target = playing;
        if (target != null) stripScroll.post(() -> {
            target.requestFocus();
            stripScroll.scrollTo(Math.max(0, target.getLeft() - stripScroll.getWidth() / 2 + target.getWidth() / 2), 0);
        });
    }

    private void openSched() {
        if (sched == null) return;
        JSONObject ch = current();
        showPanel(sched, false);
        schedTitle.setText(ch.optString("title"));
        schedRows.clear();
        schedAdapter.notifyDataSetChanged();
        schedList.requestFocus();
        int flat = flatIndex();
        programmes(ch, all -> {
            if (!schedShown() || flatIndex() != flat) return;
            // Today (and the last 6 hours, for replays just after midnight), at least the next few programmes.
            long t = System.currentTimeMillis();
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0);
            long from = Math.min(c.getTimeInMillis(), t - 6 * 3600000L), to = c.getTimeInMillis() + 86400000L;
            int ahead = 0, nowAt = 0;
            for (Prog p : all) {
                if (p.end <= from) continue;
                if (p.start >= to && ahead >= 6) break;
                if (p.start > t) ahead++;
                if (p.start <= t && p.end > t) nowAt = schedRows.size();
                schedRows.add(p);
            }
            schedAdapter.notifyDataSetChanged();
            if (schedRows.isEmpty()) schedTitle.setText(ch.optString("title") + " · No guide information for this channel.");
            schedList.requestFocus();
            schedList.setSelection(nowAt);
        });
    }

    // Now → back to the channel; past with catch-up → replay (Back returns to the channel).
    private void pickProgramme(Prog p) {
        long t = System.currentTimeMillis();
        JSONObject ch = current();
        if (p.start <= t && p.end > t) { hidePanels(); return; }
        if (p.end <= t) {
            if (canReplay(ch, p)) playReplay(p);
            else Toast.makeText(this, ch.optString("cu").isEmpty() ? "Replay isn’t available on this channel" : "This programme is no longer in the replay archive", Toast.LENGTH_SHORT).show();
            return;
        }
        Toast.makeText(this, p.title + " starts at " + hm(p.start), Toast.LENGTH_SHORT).show();
    }

    // ---------- channel list (groups | channels) ----------

    private void buildSide(FrameLayout root) {
        side = new LinearLayout(this);
        side.setOrientation(LinearLayout.HORIZONTAL);
        side.setPadding(dp(20), dp(22), dp(16), dp(16));
        side.setBackground(new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{0xF7081013, 0xE6081013}));
        side.setVisibility(View.GONE);

        groupList = list();
        chanList = list();
        side.addView(column("GROUPS", groupList), new LinearLayout.LayoutParams(dp(230), ViewGroup.LayoutParams.MATCH_PARENT));
        LinearLayout.LayoutParams chLp = new LinearLayout.LayoutParams(dp(390), ViewGroup.LayoutParams.MATCH_PARENT);
        chLp.setMarginStart(dp(12));
        side.addView(column("CHANNELS · HOLD OK = ★", chanList), chLp);
        root.addView(side, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START));

        groupAdapter = new BaseAdapter() {
            public int getCount() { return groups.size(); }
            public Object getItem(int p) { return groups.get(p); }
            public long getItemId(int p) { return p; }
            public View getView(int p, View convert, ViewGroup parent) {
                LinearLayout row = convert instanceof LinearLayout ? (LinearLayout) convert : groupRow();
                Group g = groups.get(p);
                TextView name = (TextView) row.getChildAt(0), count = (TextView) row.getChildAt(1);
                boolean special = g.key.startsWith("@");
                name.setText((g.key.equals("@fav") ? "★ " : "") + g.name);
                name.setTextColor(p == previewGroup ? Color.WHITE : special ? ACCENT : 0xFFCAD7DA);
                count.setText(String.valueOf(g.items.length));
                row.setBackground(p == previewGroup ? rounded(0x385AA9C8, 10) : null);
                return row;
            }
        };
        chanAdapter = new BaseAdapter() {
            public int getCount() { return groups.get(previewGroup).items.length; }
            public Object getItem(int p) { return channelAt(groups.get(previewGroup).items[p]); }
            public long getItemId(int p) { return p; }
            public View getView(int p, View convert, ViewGroup parent) {
                LinearLayout row = convert instanceof LinearLayout ? (LinearLayout) convert : channelRow();
                JSONObject c = (JSONObject) getItem(p);
                ((TextView) row.getChildAt(0)).setText(c.optString("num"));
                logos.load((ImageView) row.getChildAt(1), c.optString("img"));
                ((TextView) row.getChildAt(2)).setText(c.optString("title"));
                ((TextView) row.getChildAt(3)).setText(c.optBoolean("fav") ? "★" : "");
                ((TextView) row.getChildAt(4)).setText(qualities(c));
                boolean playing = previewGroup == group && p == index;
                row.setBackground(playing ? rounded(0x30FBC50C, 12) : null);
                return row;
            }
        };
        groupList.setAdapter(groupAdapter);
        chanList.setAdapter(chanAdapter);

        groupList.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            public void onItemSelected(AdapterView<?> a, View v, int p, long id) { previewGroupAt(p); }
            public void onNothingSelected(AdapterView<?> a) { }
        });
        groupList.setOnItemClickListener((a, v, p, id) -> {
            previewGroupAt(p);
            chanList.requestFocus();
            chanList.setSelection(0);
        });
        chanList.setOnItemClickListener((a, v, p, id) -> {
            freshStart();
            group = previewGroup;
            index = p;
            version = 0;
            hideSide();
            load(0);
        });
        chanList.setOnItemLongClickListener((a, v, p, id) -> {
            toggleFav(groups.get(previewGroup).items[p]);
            return true;
        });
    }

    private ListView list() {
        ListView l = new ListView(this);
        l.setDivider(null);
        l.setDividerHeight(dp(2));
        l.setSelector(rounded(0x665AA9C8, 10));
        l.setDrawSelectorOnTop(false);
        l.setItemsCanFocus(false);
        l.setFocusable(true);
        l.setVerticalScrollBarEnabled(true);
        return l;
    }

    private LinearLayout column(String title, ListView l) {
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        TextView h = text(11, ACCENT, true);
        h.setLetterSpacing(0.12f);
        h.setText(title);
        h.setPadding(dp(4), 0, 0, dp(10));
        col.addView(h);
        col.addView(l, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        return col;
    }

    private LinearLayout groupRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(10), dp(7), dp(10), dp(7));
        TextView name = text(14, Color.WHITE, false);
        TextView count = text(12, MUTED, false);
        row.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(count);
        return row;
    }

    private LinearLayout channelRow() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(8), dp(4), dp(10), dp(4));
        TextView num = text(12, MUTED, false);
        num.setMinWidth(dp(40));
        ImageView logo = new ImageView(this);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setBackground(rounded(0x14FFFFFF, 8));
        LinearLayout.LayoutParams logoLp = new LinearLayout.LayoutParams(dp(52), dp(32));
        logoLp.setMarginEnd(dp(10));
        TextView name = text(14, Color.WHITE, true);
        TextView star = text(14, ACCENT, true);
        star.setPadding(dp(8), 0, dp(8), 0);
        TextView q = text(11, MUTED, false);
        row.addView(num);
        row.addView(logo, logoLp);
        row.addView(name, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(star);
        row.addView(q);
        return row;
    }

    private String qualities(JSONObject c) {
        JSONArray vs = c.optJSONArray("versions");
        if (vs == null || vs.length() < 2) return c.optBoolean("radio") ? "Radio" : "";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < vs.length(); i++) {
            String l = vs.optJSONObject(i).optString("label").split(" · ")[0];
            if (!l.isEmpty() && out.indexOf(l) < 0) out.append(out.length() > 0 ? " · " : "").append(l);
        }
        return out.toString();
    }

    private void previewGroupAt(int p) {
        if (p == previewGroup) return;
        previewGroup = p;
        groupAdapter.notifyDataSetChanged();
        chanAdapter.notifyDataSetChanged();
        chanList.setSelection(0);
    }

    private boolean sideShown() { return side != null && side.getVisibility() == View.VISIBLE; }

    private void openSide() {
        if (side == null) return;
        previewGroup = group;
        groupAdapter.notifyDataSetChanged();
        chanAdapter.notifyDataSetChanged();
        view.hideController();
        topBar.setVisibility(View.GONE);
        side.setVisibility(View.VISIBLE);
        groupList.setSelection(group);
        chanList.requestFocus();
        chanList.setSelection(index);
    }

    private void hideSide() {
        side.setVisibility(View.GONE);
        view.requestFocus();
    }

    private void toggleFav(int flat) {
        try {
            JSONObject c = channelAt(flat);
            boolean on = !c.optBoolean("fav");
            c.put("fav", on);
            String key = c.optString("gkey");
            if (!key.isEmpty()) favChanges.put(key, on);
            Toast.makeText(this, on ? "★ " + c.optString("title") + " added to Favorites" : "Removed from Favorites", Toast.LENGTH_SHORT).show();
            if (chanAdapter != null) chanAdapter.notifyDataSetChanged();
            if (flat == flatIndex()) favChip.setText(on ? "★" : "☆");
        } catch (JSONException ignored) {
        }
    }

    // ---------- playback ----------

    private void load(long startAtMs) {
        replayUrl = null;
        if (gateVpn(startAtMs)) return;
        startPlayback(startAtMs);
    }

    private void startPlayback(long startAtMs) {
        try {
            JSONObject ch = current();
            JSONArray versions = ch.getJSONArray("versions");
            version = clamp(version, versions.length());
            JSONObject v = versions.getJSONObject(version);
            String url = replayUrl != null ? replayUrl : urlOf(v);

            titleView.setText(live && !ch.optString("num").isEmpty() ? ch.optString("num") + "  " + ch.optString("title") : ch.optString("title"));
            String gname = groups.get(group).name;
            subView.setText(live && !gname.isEmpty() ? gname : ch.optString("subtitle"));
            String label = v.optString("label", "");
            qualityView.setText(versions.length() > 1 ? label + "  " + (version + 1) + "/" + versions.length() : label);
            qualityView.setVisibility(label.isEmpty() && versions.length() < 2 ? View.GONE : View.VISIBLE);
            if (replayUrl != null) {
                titleView.setText(replayTitle);
                subView.setText("Replay · " + ch.optString("title"));
            }
            favChip.setText(ch.optBoolean("fav") ? "★" : "☆");
            errorView.setVisibility(View.GONE);
            showRadioArt(ch);
            if (live) {
                String key = ch.optString("gkey");
                if (!key.isEmpty() && (history.isEmpty() || !history.get(history.size() - 1).equals(key))) history.add(key);
            }

            MediaItem.Builder item = new MediaItem.Builder().setUri(Uri.parse(url));
            // Live: play 25 s behind the edge and never speed up to catch up, so a slow patch
            // eats into that margin instead of freezing the picture.
            if (live && replayUrl == null) item.setLiveConfiguration(new MediaItem.LiveConfiguration.Builder()
                .setTargetOffsetMs(25000).setMinPlaybackSpeed(1f).setMaxPlaybackSpeed(1f).build());
            freezes.clear();
            reconnects = 0;
            String path = Uri.parse(url).getPath();
            if (path != null && path.toLowerCase().endsWith(".m3u8")) item.setMimeType(MimeTypes.APPLICATION_M3U8);
            readyOnce = false;
            main.removeCallbacks(watchdog);
            main.postDelayed(watchdog, 15000);
            player.setMediaItem(item.build(), startAtMs);
            player.prepare();
            player.play();
            if (live && replayUrl == null) flashTopBar(); else view.showController();
        } catch (JSONException e) {
            showError("This item has no playable link.");
        }
    }

    private void showRadioArt(JSONObject ch) {
        boolean radio = ch.optBoolean("radio", false);
        String img = ch.optString("img", "");
        radioArt.setVisibility(radio ? View.VISIBLE : View.GONE);
        radioArt.setImageDrawable(null);
        if (!radio || img.isEmpty()) return;
        final int forIndex = flatIndex();
        new Thread(() -> {
            Bitmap b = LogoLoader.fetch(img);
            if (b != null) main.post(() -> { if (flatIndex() == forIndex) radioArt.setImageBitmap(b); });
        }).start();
    }

    private void zap(int step) {
        int n = groups.get(group).items.length;
        if (!live || n < 2) return;
        index = (index + step + n) % n;
        version = 0;
        freshStart();
        load(0);
    }

    private boolean hasVersions() {
        JSONArray vs = current().optJSONArray("versions");
        return vs != null && vs.length() > 1;
    }

    private void switchVersion(int step) {
        JSONArray vs = current().optJSONArray("versions");
        if (vs == null || vs.length() < 2) return;
        version = (version + step + vs.length()) % vs.length();
        freshStart();
        load(live ? 0 : player.getCurrentPosition());
    }

    // Number keys: type a channel number; it switches after a short pause.
    private final Runnable applyDigits = () -> {
        String want = digits.toString();
        freshStart();
        digits.setLength(0);
        numView.setVisibility(View.GONE);
        if (!jumpTo(want)) Toast.makeText(this, "No channel " + want, Toast.LENGTH_SHORT).show();
    };

    private void digit(int d) {
        if (digits.length() >= 4) digits.setLength(0);
        digits.append(d);
        numView.setText(digits);
        numView.setVisibility(View.VISIBLE);
        main.removeCallbacks(applyDigits);
        main.postDelayed(applyDigits, 1300);
    }

    private boolean jumpTo(String num) {
        int[] cur = groups.get(group).items;
        for (int i = 0; i < cur.length; i++) {
            if (num.equals(channelAt(cur[i]).optString("num"))) { index = i; version = 0; load(0); return true; }
        }
        for (int g = 0; g < groups.size(); g++) {
            if (groups.get(g).key.startsWith("@fav") || groups.get(g).key.startsWith("@recent")) continue;
            int[] items = groups.get(g).items;
            for (int i = 0; i < items.length; i++) {
                if (num.equals(channelAt(items[i]).optString("num"))) { group = g; index = i; version = 0; load(0); return true; }
            }
        }
        return false;
    }

    // ---------- remote / keyboard ----------

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
        boolean center = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER || code == KeyEvent.KEYCODE_NUMPAD_ENTER;

        // The OK press that opened the list must not also "click" the first channel.
        if (center && !down && swallowCenterUp) { swallowCenterUp = false; return true; }
        if (!live || replayUrl != null) return super.dispatchKeyEvent(e);
        if (down && panelShown()) { main.removeCallbacks(panelTimeout); main.postDelayed(panelTimeout, 10000); }

        if (infoShown() || stripShown() || schedShown()) {
            if (down) {
                if (infoShown() && code == KeyEvent.KEYCODE_DPAD_UP) { hidePanels(); return true; }
                if (infoShown() && code == KeyEvent.KEYCODE_DPAD_DOWN) return true;
                if (stripShown() && code == KeyEvent.KEYCODE_DPAD_DOWN) { hidePanels(); return true; }
                if (stripShown() && code == KeyEvent.KEYCODE_DPAD_UP) { hidePanels(); openSide(); return true; }
                if (schedShown() && code == KeyEvent.KEYCODE_DPAD_LEFT) { hidePanels(); return true; }
                if (schedShown() && code == KeyEvent.KEYCODE_DPAD_RIGHT) return true;
            }
            return super.dispatchKeyEvent(e);
        }

        if (barActive && !sideShown()) {
            if (down && (code == KeyEvent.KEYCODE_DPAD_DOWN || code == KeyEvent.KEYCODE_DPAD_UP)) {
                if (code == KeyEvent.KEYCODE_DPAD_DOWN) hideBar();
                return true;
            }
            return super.dispatchKeyEvent(e); // ◀/▶ move between buttons, OK presses one
        }

        if (sideShown()) {
            if (down && code == KeyEvent.KEYCODE_DPAD_LEFT && chanList.hasFocus()) {
                groupList.requestFocus();
                groupList.setSelection(previewGroup);
                return true;
            }
            if (down && code == KeyEvent.KEYCODE_DPAD_RIGHT && groupList.hasFocus()) {
                chanList.requestFocus();
                chanList.setSelection(previewGroup == group ? index : 0);
                return true;
            }
            return super.dispatchKeyEvent(e);
        }

        if (down) {
            if (code >= KeyEvent.KEYCODE_0 && code <= KeyEvent.KEYCODE_9) { digit(code - KeyEvent.KEYCODE_0); return true; }
            if (code >= KeyEvent.KEYCODE_NUMPAD_0 && code <= KeyEvent.KEYCODE_NUMPAD_9) { digit(code - KeyEvent.KEYCODE_NUMPAD_0); return true; }
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                case KeyEvent.KEYCODE_GUIDE:
                    if (controlsShown) break; // OK on a visible player button
                    if (e.getRepeatCount() == 0) {
                        swallowCenterUp = center;
                        if (code == KeyEvent.KEYCODE_GUIDE) openSched(); else openInfo();
                    }
                    return true;
                case KeyEvent.KEYCODE_INFO:
                    openInfo();
                    return true;
                case KeyEvent.KEYCODE_MENU:
                    view.showController();
                    return true;
                // CH+/CH− change channel. ▼ info panel, ▲ channel strip, ◀ channel list, ▶ programmes.
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                case KeyEvent.KEYCODE_PAGE_UP:
                    zap(-1); return true;
                case KeyEvent.KEYCODE_CHANNEL_UP:
                case KeyEvent.KEYCODE_PAGE_DOWN:
                    zap(1); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (!controlsShown) { openInfo(); return true; } break;
                case KeyEvent.KEYCODE_DPAD_UP:
                    if (!controlsShown) { openStrip(); return true; } break;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if (!controlsShown) { openSide(); return true; } break;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if (!controlsShown) { openSched(); return true; } break;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    // ---------- result ----------

    private void finishWithResult() {
        Intent data = new Intent();
        if (player != null) {
            long dur = player.getDuration();
            data.putExtra("position", player.getCurrentPosition() / 1000.0);
            data.putExtra("duration", dur > 0 ? dur / 1000.0 : 0);
        }
        data.putExtra("ended", ended);
        data.putExtra("group", group);
        data.putExtra("index", index);
        data.putExtra("version", version);
        data.putExtra("history", new JSONArray(history).toString());
        data.putExtra("fav", favChanges.toString());
        setResult(RESULT_OK, data);
        finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        main.removeCallbacksAndMessages(null);
        VpnManager.get().removeListener(vpnListener);
        logos.shutdown();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
