package tv.inkonab.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Small async image loader for channel logos in the player's channel list. */
final class LogoLoader {
    private static final int MAX_W = 160;
    private final LruCache<String, Bitmap> cache = new LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap b) { return b.getByteCount(); }
    };
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private final Handler main = new Handler(Looper.getMainLooper());

    void load(ImageView view, String url) {
        view.setTag(url);
        view.setImageDrawable(null);
        if (url == null || url.isEmpty()) return;
        Bitmap hit = cache.get(url);
        if (hit != null) { view.setImageBitmap(hit); return; }
        pool.execute(() -> {
            Bitmap b = fetch(url);
            if (b == null) return;
            cache.put(url, b);
            main.post(() -> { if (url.equals(view.getTag())) view.setImageBitmap(b); });
        });
    }

    static Bitmap fetch(String url) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setInstanceFollowRedirects(true);
            try (InputStream in = c.getInputStream()) {
                Bitmap b = BitmapFactory.decodeStream(in);
                if (b != null && b.getWidth() > MAX_W) {
                    b = Bitmap.createScaledBitmap(b, MAX_W, Math.max(1, b.getHeight() * MAX_W / b.getWidth()), true);
                }
                return b;
            }
        } catch (Exception e) {
            return null;
        }
    }

    void shutdown() { pool.shutdownNow(); }
}
