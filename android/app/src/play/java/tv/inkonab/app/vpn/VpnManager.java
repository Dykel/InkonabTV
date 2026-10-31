package tv.inkonab.app.vpn;

import android.content.Context;
import android.content.Intent;

/**
 * Google Play version: no VPN. Same API as the sideload version's VpnManager (src/full), so the
 * player and the plugin are shared; it always reports "off" and never asks for VPN permission.
 */
public final class VpnManager {
    public enum State { DISCONNECTED, CONNECTING, CONNECTED, FAILED }

    public interface Listener { void onVpn(State state, String detail); }
    public interface Done { void done(boolean ok, String detail); }

    public static final boolean AVAILABLE = false;
    private static final VpnManager instance = new VpnManager();

    public static VpnManager get() { return instance; }

    public void init(Context c) {}
    public String mode() { return "off"; }
    public String country() { return ""; }
    public void setMode(String m) {}
    public void setCountry(String c) {}
    public State state() { return State.DISCONNECTED; }
    public String detail() { return ""; }
    public boolean isUp() { return false; }
    public String serverLabel() { return ""; }
    public boolean busy() { return false; }
    public boolean autoStarted() { return false; }
    public long speedKbps() { return 0; }
    public boolean needVpn() { return false; }
    public boolean shouldUseForProvider() { return false; }
    public void markGood() {}
    public void forgetNeed() {}
    public String rememberedLabel() { return ""; }
    public void forget() {}
    public String nextLabel() { return ""; }
    public void pauseForDirect() {}
    public void connectForPlayback(Done done) { if (done != null) done.done(false, "VPN not available"); }
    public void addListener(Listener l) {}
    public void removeListener(Listener l) {}
    public Intent consentIntent(Context c) { return null; }
    public void connect(Done done) { if (done != null) done.done(false, "VPN not available"); }
    public void switchServer(Done done) { if (done != null) done.done(false, "VPN not available"); }
    public void disconnect() {}
}
