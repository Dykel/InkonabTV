package tv.inkonab.app.vpn;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.VpnService;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Connects the app-only VPN through free VPN Gate servers with failover:
 * tries servers best-first (20 s each), skips ones that failed this session, and when a
 * working connection drops it moves on to the next server by itself.
 *
 * Mode (saved): "off", "auto" (connect when a channel won't play), "always".
 *
 * The server a channel last played through is remembered (and tried first next time), and
 * the remaining servers are ordered one country at a time, so each retry tries a new country.
 * Free channels (MBC PLAY) refuse VPN addresses: pauseForDirect() drops the VPN for them and
 * provider channels bring it back (shouldUseForProvider()).
 */
public final class VpnManager {
    public enum State { DISCONNECTED, CONNECTING, CONNECTED, FAILED }

    public interface Listener { void onVpn(State state, String detail); }
    public interface Done { void done(boolean ok, String detail); }

    private static final String TAG = "InkonabVPN";
    private static final long CONNECT_TIMEOUT = 20000;
    private static final int MAX_TRIES = 8;
    private static VpnManager instance;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
    private final Set<String> bad = new HashSet<>();
    private Context app;
    private State state = State.DISCONNECTED;
    private String detail = "";
    private List<VpnGate.Server> servers;
    private VpnGate.Server current;
    private int tries;
    private boolean wanted;    // the viewer (or auto mode) wants the VPN up
    private boolean autoStarted; // connected by the player for a failing channel (automatic mode)
    private Done pending;
    private boolean resume;      // dropped for a free channel; reconnect for the next provider stream
    private final Runnable timeout = () -> {
        if (state == State.CONNECTING) {
            Log.w(TAG, "Timeout on " + (current == null ? "?" : current.label()));
            failCurrent("timeout");
        }
    };

    public static synchronized VpnManager get() {
        if (instance == null) instance = new VpnManager();
        return instance;
    }

    public void init(Context c) { if (app == null) app = c.getApplicationContext(); }

    private SharedPreferences prefs() { return app.getSharedPreferences("vpn", Context.MODE_PRIVATE); }
    public String mode() { return prefs().getString("mode", "auto"); }
    public String country() { return prefs().getString("country", ""); }
    public void setMode(String m) { prefs().edit().putString("mode", m).apply(); if ("off".equals(m)) disconnect(); }
    public void setCountry(String c) { prefs().edit().putString("country", c == null ? "" : c).apply(); servers = null; }

    public State state() { return state; }
    public String detail() { return detail; }
    public boolean isUp() { return state == State.CONNECTED; }
    public String serverLabel() { return current == null ? "" : current.label(); }
    public boolean busy() { return state == State.CONNECTED || state == State.CONNECTING; }
    public boolean autoStarted() { return autoStarted; }

    // ---------- learned behaviour (saved) ----------

    /** Provider streams have needed the VPN on this device before. */
    public boolean needVpn() { return prefs().getBoolean("need", false); }

    /** Use the VPN before playing a provider stream (not MBC PLAY). */
    public boolean shouldUseForProvider() {
        String m = mode();
        return !"off".equals(m) && ("always".equals(m) || needVpn() || resume);
    }

    /** A stream just played through the current server: remember it for next time. */
    public void markGood() {
        main.post(() -> {
            if (state != State.CONNECTED || current == null) return;
            try {
                JSONObject j = new JSONObject();
                j.put("host", current.host).put("ip", current.ip).put("country", current.country)
                    .put("cc", current.countryCode).put("config", current.config);
                prefs().edit().putString("good", j.toString()).putBoolean("need", true).apply();
            } catch (Exception ignored) { }
        });
    }

    /** The provider plays fine directly again: stop connecting for it automatically. */
    public void forgetNeed() { prefs().edit().putBoolean("need", false).apply(); }

    private VpnGate.Server remembered() {
        try {
            JSONObject j = new JSONObject(prefs().getString("good", ""));
            return new VpnGate.Server(j.optString("host"), j.optString("ip"), j.optString("country"), j.optString("cc"), j.optString("config"));
        } catch (Exception e) {
            return null;
        }
    }

    /** The remembered server (where a stream last played), or "". */
    public String rememberedLabel() {
        VpnGate.Server r = remembered();
        return r == null ? "" : r.label();
    }

    /** Forget the remembered server and that provider streams need the VPN. */
    public void forget() { prefs().edit().remove("good").putBoolean("need", false).apply(); }

    /** Label of the server that will be tried first. */
    public String nextLabel() {
        VpnGate.Server r = remembered();
        return r != null && !bad.contains(r.id()) ? r.label() : "";
    }

    /** Drop the VPN for a free channel; provider channels will reconnect it. */
    public void pauseForDirect() {
        main.post(() -> {
            boolean was = state == State.CONNECTED || state == State.CONNECTING || resume;
            disconnectNow();
            resume = was;
        });
    }

    /** Remembered server first, then the best server of each country in turn (preferred country first). */
    private List<VpnGate.Server> ordered(List<VpnGate.Server> list) {
        VpnGate.Server good = remembered();
        String pref = country();
        Map<String, List<VpnGate.Server>> byCountry = new LinkedHashMap<>();
        if (good != null) byCountry.put(good.countryCode, new ArrayList<>());
        if (!pref.isEmpty()) byCountry.put(pref, new ArrayList<>());
        for (VpnGate.Server s : list) {
            List<VpnGate.Server> g = byCountry.get(s.countryCode);
            if (g == null) byCountry.put(s.countryCode, g = new ArrayList<>());
            g.add(s);
        }
        List<VpnGate.Server> out = new ArrayList<>();
        if (good != null && !good.config.isEmpty()) out.add(good);
        for (int round = 0; ; round++) {
            boolean any = false;
            for (List<VpnGate.Server> g : byCountry.values()) {
                if (round < g.size()) {
                    VpnGate.Server s = g.get(round);
                    if (good == null || !s.ip.equals(good.ip)) out.add(s);
                    any = true;
                }
            }
            if (!any) break;
        }
        return out;
    }

    /** Connect on behalf of the player; automatic mode turns it off again afterwards. */
    public void connectForPlayback(Done done) {
        main.post(() -> { if (state != State.CONNECTED) autoStarted = true; });
        connect(done);
    }

    public void addListener(Listener l) { listeners.add(l); }
    public void removeListener(Listener l) { listeners.remove(l); }

    /** Intent to show Android's one-time "allow VPN" dialog, or null when already allowed. */
    public Intent consentIntent(Context c) { return VpnService.prepare(c); }

    /** Connect (or reuse an existing connection). Requires consent to have been granted. */
    public void connect(Done done) {
        main.post(() -> {
            if (state == State.CONNECTED) { if (done != null) done.done(true, serverLabel()); return; }
            if (done != null) pending = done;
            if (state == State.CONNECTING) return;
            wanted = true;
            tries = 0;
            set(State.CONNECTING, "Finding a free server…");
            new Thread(() -> {
                try {
                    List<VpnGate.Server> list = ordered(VpnGate.servers(app, ""));
                    main.post(() -> { servers = list; next(); });
                } catch (Exception e) {
                    main.post(() -> finish(false, "Couldn't load the free server list"));
                }
            }, "vpngate").start();
        });
    }

    /** Drop the current server and connect to the next one (a channel failed through it). */
    public void switchServer(Done done) {
        main.post(() -> {
            if (state != State.CONNECTED) { connect(done); return; }
            pending = done;
            tries = 0;
            set(State.CONNECTING, "Trying another server…");
            failCurrent("channel failed");
        });
    }

    public void disconnect() {
        main.post(() -> { resume = false; disconnectNow(); });
    }

    private void disconnectNow() {
        wanted = false;
        autoStarted = false;
        main.removeCallbacks(timeout);
        current = null;
        Intent i = new Intent(app, InkonabVpnService.class).setAction(InkonabVpnService.ACTION_STOP);
        try { app.startService(i); } catch (Exception ignored) { }
        set(State.DISCONNECTED, "");
        finish(false, "Disconnected");
    }

    private void next() {
        if (!wanted) return;
        VpnGate.Server pick = null;
        if (servers != null) for (VpnGate.Server s : servers) if (!bad.contains(s.id())) { pick = s; break; }
        if (pick == null && servers != null && !servers.isEmpty()) { bad.clear(); pick = servers.get(0); }
        if (pick == null || tries >= MAX_TRIES) { finish(false, "No free server answered"); return; }
        tries++;
        current = pick;
        set(State.CONNECTING, "Connecting to VPN · " + pick.label());
        Intent i = new Intent(app, InkonabVpnService.class)
            .setAction(InkonabVpnService.ACTION_CONNECT)
            .putExtra(InkonabVpnService.EXTRA_CONFIG, pick.config)
            .putExtra(InkonabVpnService.EXTRA_NAME, pick.label());
        try {
            if (android.os.Build.VERSION.SDK_INT >= 26) app.startForegroundService(i); else app.startService(i);
        } catch (Exception e) {
            finish(false, "VPN couldn't start: " + e.getMessage());
            return;
        }
        main.removeCallbacks(timeout);
        main.postDelayed(timeout, CONNECT_TIMEOUT);
    }

    private void failCurrent(String why) {
        if (current != null) bad.add(current.id());
        Log.w(TAG, "Server failed (" + why + "), trying the next one");
        next();
    }

    /** Called by the service (any thread). */
    void onServiceState(State s, String info) {
        main.post(() -> {
            if (s == State.CONNECTED) {
                main.removeCallbacks(timeout);
                tries = 0;
                resume = false;
                set(State.CONNECTED, info);
                finish(true, info);
            } else if (s == State.FAILED) {
                if (!wanted) return;
                main.removeCallbacks(timeout);
                // A dropped or refused connection: fail over to the next server.
                set(State.CONNECTING, "Server lost, switching…");
                failCurrent(info);
            } else if (s == State.DISCONNECTED && !wanted) {
                set(State.DISCONNECTED, "");
            }
        });
    }

    private void finish(boolean ok, String info) {
        if (!ok && wanted && state != State.CONNECTED) {
            wanted = false;
            Intent i = new Intent(app, InkonabVpnService.class).setAction(InkonabVpnService.ACTION_STOP);
            try { app.startService(i); } catch (Exception ignored) { }
            set(State.FAILED, info);
        }
        Done d = pending;
        pending = null;
        if (d != null) d.done(ok, info);
    }

    private void set(State s, String info) {
        state = s;
        detail = info == null ? "" : info;
        for (Listener l : listeners) l.onVpn(s, detail);
    }
}
