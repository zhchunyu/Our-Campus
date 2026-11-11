package cn.edu.sxau.campustwin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CampusUpdates")
public class CampusUpdatesPlugin extends Plugin {
    @PluginMethod
    @SuppressWarnings("deprecation")
    public void getInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("packageId", info.packageName);
            result.put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : (long) info.versionCode);
            result.put("versionName", info.versionName);
            result.put("platform", "android");
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException unavailable) {
            call.reject("无法读取当前应用版本", "VERSION_INFO_UNAVAILABLE", unavailable);
        }
    }

    @PluginMethod
    public void openDownload(PluginCall call) {
        String url = call.getString("url");
        if (!CampusUpdateUrlPolicy.isAllowed(url)) {
            call.reject("更新下载地址无效", "INVALID_UPDATE_URL");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("当前应用页面不可用", "NO_ACTIVITY");
            return;
        }
        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) {
                call.reject("当前应用页面不可用", "NO_ACTIVITY");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            try {
                activity.startActivity(intent);
                call.resolve();
            } catch (ActivityNotFoundException unavailable) {
                call.reject("未找到可以打开下载地址的浏览器", "NO_BROWSER", unavailable);
            } catch (SecurityException denied) {
                call.reject("无法打开下载地址", "DOWNLOAD_OPEN_FAILED", denied);
            }
        });
    }
}
