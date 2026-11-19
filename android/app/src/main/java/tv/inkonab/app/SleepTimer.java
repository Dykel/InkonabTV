package tv.inkonab.app;

import android.app.Activity;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Sleep timer (Settings → Playback): when no key has been pressed for that many minutes, a
 * "Still watching?" card counts down 60 seconds; any key keeps watching, otherwise onStop runs.
 */
final class SleepTimer {
    private final Activity act;
    private final long limitMs;
    private final Runnable onStop;
    private final Handler main = new Handler(Looper.getMainLooper());
    private long last = SystemClock.elapsedRealtime();
    private TextView card;
    private int left;

    SleepTimer(Activity act, int minutes, Runnable onStop) {
        this.act = act;
        this.limitMs = minutes * 60000L;
        this.onStop = onStop;
        if (limitMs > 0) main.postDelayed(check, 5000);
    }

    /** A key or touch: start counting again, and hide the card if it is up. Returns true if it was up. */
    boolean touch() {
        last = SystemClock.elapsedRealtime();
        if (card == null) return false;
        ((ViewGroup) card.getParent()).removeView(card);
        card = null;
        main.removeCallbacks(tick);
        return true;
    }

    void stop() { main.removeCallbacksAndMessages(null); }

    private final Runnable check = new Runnable() {
        @Override public void run() {
            if (card == null && SystemClock.elapsedRealtime() - last >= limitMs) show();
            main.postDelayed(this, 5000);
        }
    };

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (card == null) return;
            left--;
            if (left <= 0) {
                stop();
                onStop.run();
                return;
            }
            paint();
            main.postDelayed(this, 1000);
        }
    };

    private void show() {
        ViewGroup root = act.findViewById(android.R.id.content);
        card = new TextView(act);
        card.setTextColor(0xFFFFFFFF);
        card.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        card.setGravity(Gravity.CENTER);
        int p = dp(18);
        card.setPadding(p * 2, p, p * 2, p);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xF2101417);
        bg.setCornerRadius(dp(18));
        card.setBackground(bg);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        lp.topMargin = dp(36);
        root.addView(card, lp);
        left = 60;
        paint();
        main.postDelayed(tick, 1000);
    }

    private void paint() {
        card.setText(act.getString(R.string.sleep_ask, left));
    }

    private int dp(int v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, act.getResources().getDisplayMetrics());
    }
}
