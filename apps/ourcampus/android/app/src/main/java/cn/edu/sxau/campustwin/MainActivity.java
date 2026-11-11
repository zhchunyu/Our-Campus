package cn.edu.sxau.campustwin;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean dispatchingBack = false;
    @Override
    @SuppressWarnings("deprecation")
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(CampusPushPlugin.class);
        registerPlugin(CampusAppearancePlugin.class);
        registerPlugin(CampusUpdatesPlugin.class);
        super.onCreate(savedInstanceState);
        // The web startup video owns the initial dark surface. Once it
        // finishes, CampusAppearance restores the light surface behind insets.
        getWindow().getDecorView().setBackgroundColor(Color.rgb(14, 19, 22));
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
        }
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.rgb(14, 19, 22));
        }
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (dispatchingBack) return;
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView == null) { finish(); return; }
                dispatchingBack = true;
                webView.evaluateJavascript(
                    "typeof window.__ourCampusBack === 'function' ? (window.__ourCampusBack() ? 'handled' : 'root') : 'unavailable'",
                    result -> {
                        dispatchingBack = false;
                        if (isFinishing() || isDestroyed() || "\"handled\"".equals(result)) return;
                        if ("\"unavailable\"".equals(result) && webView.canGoBack()) { webView.goBack(); return; }
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                );
            }
        });
    }
}
