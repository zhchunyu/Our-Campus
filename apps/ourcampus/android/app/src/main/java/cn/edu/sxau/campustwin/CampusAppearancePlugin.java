package cn.edu.sxau.campustwin;

import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CampusAppearance")
public class CampusAppearancePlugin extends Plugin {
    @PluginMethod
    public void finishStartup(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            // SystemBars reads this attribute again on configuration changes.
            getActivity().getTheme().applyStyle(R.style.AppTheme_ReadySurface, true);
            int background = ContextCompat.getColor(getContext(), R.color.app_background);
            getActivity().getWindow().getDecorView().setBackgroundColor(background);
            getBridge().getWebView().setBackgroundColor(background);
            call.resolve();
        });
    }
}
