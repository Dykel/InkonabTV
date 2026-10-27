package tv.inkonab.app;

import android.os.Bundle;
import android.view.KeyEvent;
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

    // On a focused text field the WebView swallows the remote's OK button, so the page never sees
    // it. Tell the page; on TV it opens the on-screen keyboard for that field (native.js).
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        // Same for ▲/▼ after the keyboard was closed: an editable field keeps them for its cursor.
        if (e.getAction() == KeyEvent.ACTION_DOWN && (k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_DPAD_DOWN) && getBridge() != null) {
            String dir = k == KeyEvent.KEYCODE_DPAD_UP ? "ArrowUp" : "ArrowDown";
            getBridge().getWebView().evaluateJavascript("window.InkonabTV && InkonabTV.arrow && InkonabTV.arrow('" + dir + "')", null);
        }
        if (e.getAction() == KeyEvent.ACTION_UP && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_NUMPAD_ENTER)
            && getBridge() != null) {
            getBridge().getWebView().evaluateJavascript("window.InkonabTV && InkonabTV.okPressed && InkonabTV.okPressed()", null);
        }
        return super.dispatchKeyEvent(e);
    }
}
