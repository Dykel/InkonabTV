package tv.inkonab.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

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
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Full-screen player started from the web UI (see NativePlayerPlugin).
 *
 * Payload: { live, index, version, startAt,
 *            channels: [{ title, subtitle, img, radio, versions: [{ url, label }] }] }
 * VOD sends a single channel with a single version. Live sends the whole category
 * so the remote can zap (up/down) and switch quality (left/right).
 */
@OptIn(markerClass = UnstableApi.class)
public class PlayerActivity extends AppCompatActivity {
    public static final String EXTRA = "payload";
    private static final int ACCENT = 0xFFFBC50C;

    private ExoPlayer player;
    private PlayerView view;
    private JSONArray channels;
    private int index;
    private int version;
    private boolean live;
    private boolean ended;
    private boolean controlsShown;

    private View topBar;
    private TextView titleView, subView, qualityView, errorView;
    private ImageView radioArt;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();

        long startAtMs = 0;
        try {
            JSONObject p = new JSONObject(getIntent().getStringExtra(EXTRA));
            channels = p.getJSONArray("channels");
            index = p.optInt("index", 0);
            version = p.optInt("version", 0);
            live = p.optBoolean("live", false);
            startAtMs = (long) (p.optDouble("startAt", 0) * 1000);
        } catch (Exception e) {
            finish();
            return;
        }

        buildUi();

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent("InkonabTV/1.0 (Android)")
            .setAllowCrossProtocolRedirects(true) // the provider redirects HTTPS → HTTP
            .setConnectTimeoutMs(20000)
            .setReadTimeoutMs(20000);
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
            .setEnableDecoderFallback(true);
        player = new ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
            .build();
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) errorView.setVisibility(View.GONE);
                if (state == Player.STATE_ENDED && !live) {
                    ended = true;
                    finishWithResult();
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                showError(live
                    ? "Can't play this channel.\nUse ▲ ▼ to change channel or ◀ ▶ to try another quality."
                    : "Can't play this file (" + error.getErrorCodeName() + ").");
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (controlsShown && !live) view.hideController();
                else finishWithResult();
            }
        });

        load(startAtMs);
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
        FrameLayout.LayoutParams artLp = new FrameLayout.LayoutParams(dp(260), dp(200), Gravity.CENTER);
        root.addView(radioArt, artLp);

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
        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setSingleLine(true);
        subView = new TextView(this);
        subView.setTextColor(0xFFC2CED1);
        subView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        subView.setSingleLine(true);
        texts.addView(titleView);
        texts.addView(subView);
        bar.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        qualityView = chip("", true);
        qualityView.setOnClickListener(v -> switchVersion(1));
        bar.addView(qualityView);
        if (live && channels.length() > 1) {
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
            topBar.setVisibility(visibility);
            controlsShown = visibility == View.VISIBLE;
        });

        errorView = new TextView(this);
        errorView.setTextColor(Color.WHITE);
        errorView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(dp(32), dp(24), dp(32), dp(24));
        GradientDrawable eb = new GradientDrawable();
        eb.setColor(0xCC000000);
        eb.setCornerRadius(dp(18));
        errorView.setBackground(eb);
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setContentView(root);
    }

    private TextView chip(String text, boolean accent) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextColor(accent ? 0xFF1D1600 : Color.WHITE);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        t.setMinWidth(dp(48));
        t.setPadding(dp(14), dp(8), dp(14), dp(8));
        t.setFocusable(true);
        t.setClickable(true);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(accent ? ACCENT : 0x33FFFFFF);
        bg.setCornerRadius(dp(24));
        t.setBackground(bg);
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

    // Show the channel name for a few seconds after zapping, without the playback controls.
    private final Runnable hideTopBar = () -> { if (!controlsShown) topBar.setVisibility(View.GONE); };

    private void flashTopBar() {
        topBar.setVisibility(View.VISIBLE);
        main.removeCallbacks(hideTopBar);
        main.postDelayed(hideTopBar, 3500);
    }

    private void showError(String msg) {
        errorView.setText(msg);
        errorView.setVisibility(View.VISIBLE);
    }

    // ---------- playback ----------

    private JSONObject channel() throws JSONException {
        return channels.getJSONObject(index);
    }

    private void load(long startAtMs) {
        try {
            JSONObject ch = channel();
            JSONArray versions = ch.getJSONArray("versions");
            version = Math.max(0, Math.min(version, versions.length() - 1));
            JSONObject v = versions.getJSONObject(version);
            String url = v.getString("url");

            titleView.setText(ch.optString("title"));
            subView.setText(ch.optString("subtitle"));
            String label = v.optString("label", "");
            qualityView.setText(versions.length() > 1 ? label + "  " + (version + 1) + "/" + versions.length() : label);
            qualityView.setVisibility(label.isEmpty() && versions.length() < 2 ? View.GONE : View.VISIBLE);
            errorView.setVisibility(View.GONE);
            showRadioArt(ch);

            MediaItem.Builder item = new MediaItem.Builder().setUri(Uri.parse(url));
            String path = Uri.parse(url).getPath();
            if (path != null && path.toLowerCase().endsWith(".m3u8")) item.setMimeType(MimeTypes.APPLICATION_M3U8);
            player.setMediaItem(item.build(), startAtMs);
            player.prepare();
            player.play();
            if (live) flashTopBar(); else view.showController();
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
        final int forIndex = index;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(img).openConnection();
                c.setInstanceFollowRedirects(true);
                try (InputStream in = c.getInputStream()) {
                    Bitmap b = BitmapFactory.decodeStream(in);
                    main.post(() -> { if (index == forIndex) radioArt.setImageBitmap(b); });
                }
            } catch (Exception ignored) {
            }
        }).start();
    }

    private void zap(int step) {
        if (!live || channels.length() < 2) return;
        index = (index + step + channels.length()) % channels.length();
        version = 0;
        load(0);
    }

    private boolean hasVersions() {
        try {
            return channel().getJSONArray("versions").length() > 1;
        } catch (JSONException e) {
            return false;
        }
    }

    private void switchVersion(int step) {
        try {
            int n = channel().getJSONArray("versions").length();
            if (n < 2) return;
            version = (version + step + n) % n;
            load(live ? 0 : player.getCurrentPosition());
        } catch (JSONException ignored) {
        }
    }

    // ---------- remote / keyboard ----------

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN && live) {
            // ▲/▼ always change channel, like a TV remote. ◀/▶ change quality while the
            // controls are hidden; once shown (OK), they move between the player buttons.
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_CHANNEL_UP:
                case KeyEvent.KEYCODE_PAGE_UP:
                case KeyEvent.KEYCODE_DPAD_UP:
                    zap(-1); return true;
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                case KeyEvent.KEYCODE_PAGE_DOWN:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    zap(1); return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if (!controlsShown && hasVersions()) { switchVersion(-1); return true; } break;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if (!controlsShown && hasVersions()) { switchVersion(1); return true; } break;
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
        data.putExtra("index", index);
        data.putExtra("version", version);
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
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
