package tv.inkonab.app;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
        // Honour a fixed viewport width (native.js sets width=1600 on TVs) and scale it to the screen.
        WebSettings s = getBridge().getWebView().getSettings();
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        // "Always on" VPN mode: reconnect at start when Android has already allowed it.
        tv.inkonab.app.vpn.VpnManager vpn = tv.inkonab.app.vpn.VpnManager.get();
        vpn.init(this);
        if ("always".equals(vpn.mode()) && vpn.consentIntent(this) == null) vpn.connect(null);
    }
}
