package cn.edu.sxau.campustwin;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.igexin.sdk.PushManager;
import java.lang.ref.WeakReference;
import java.util.UUID;

@CapacitorPlugin(name = "CampusPush", permissions = {
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class CampusPushPlugin extends Plugin {
    private static WeakReference<CampusPushPlugin> active = new WeakReference<>(null);
    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("ourcampus_push", Context.MODE_PRIVATE);
    }
    private boolean configured() {
        try {
            String id = getContext().getPackageManager().getApplicationInfo(getContext().getPackageName(), PackageManager.GET_META_DATA)
                .metaData.getString("OURCAMPUS_PUSH_APP_ID", "");
            return id != null && !id.trim().isEmpty();
        } catch (Exception ignored) { return false; }
    }
    private boolean permitted() {
        return (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED)
            && NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }
    private boolean vivoConfigured() {
        try {
            return configured() && getContext().getPackageManager().getApplicationInfo(getContext().getPackageName(), PackageManager.GET_META_DATA)
                .metaData.getBoolean("OURCAMPUS_VIVO_PUSH_ENABLED", false);
        } catch (Exception ignored) { return false; }
    }
    private boolean hasRequiredConsent() {
        return !vivoConfigured() || preferences(getContext()).getBoolean("vivoConsent", false);
    }
    private JSObject status() {
        SharedPreferences store = preferences(getContext());
        String installation = store.getString("installation", null);
        if (installation == null) {
            installation = UUID.randomUUID().toString();
            store.edit().putString("installation", installation).apply();
        }
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("configured", configured());
        result.put("vivoConfigured", vivoConfigured());
        result.put("enabled", store.getBoolean("enabled", false) && hasRequiredConsent());
        result.put("permission", permitted() ? "granted" : "denied");
        result.put("installationId", installation);
        result.put("cid", store.getString("cid", ""));
        return result;
    }
    private void initializePush() {
        if (!configured() || !permitted() || !hasRequiredConsent()) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel("campus_public", "校园信息", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("校园公共通知和订阅更新");
            getContext().getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        PushManager.getInstance().preInit(getContext());
        // 只投递用户主动订阅的校园消息，关闭不需要的扩展数据用途。
        PushManager.getInstance().setIndividuationPush(getContext(), false);
        PushManager.getInstance().setScenePush(getContext(), false);
        PushManager.getInstance().setEmergencyPush(getContext(), false);
        PushManager.getInstance().setLinkMerge(getContext(), false);
        PushManager.getInstance().setImsiEnable(getContext(), false);
        PushManager.getInstance().initialize(getContext());
        PushManager.getInstance().turnOnPush(getContext());
    }
    @Override public void load() {
        active = new WeakReference<>(this);
        if (preferences(getContext()).getBoolean("enabled", false)) initializePush();
        rememberNotice(getActivity().getIntent());
    }
    @PluginMethod public void getStatus(PluginCall call) { call.resolve(status()); }
    @PluginMethod public void enable(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("consent", false))) { call.reject("请先同意使用推送服务"); return; }
        if (!configured()) { call.reject("安装包尚未配置个推 AppID，请联系项目管理员重新打包"); return; }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "permissionResult"); return;
        }
        finishEnable(call);
    }
    @PermissionCallback private void permissionResult(PluginCall call) { finishEnable(call); }
    private void finishEnable(PluginCall call) {
        if (!permitted()) { call.resolve(status()); return; }
        preferences(getContext()).edit().putBoolean("enabled", true).putBoolean("vivoConsent", vivoConfigured()).apply();
        initializePush();
        call.resolve(status());
    }
    @PluginMethod public void disable(PluginCall call) {
        preferences(getContext()).edit().putBoolean("enabled", false).putBoolean("vivoConsent", false).apply();
        if (configured()) PushManager.getInstance().turnOffPush(getContext());
        call.resolve(status());
    }
    @PluginMethod public void openSettings(PluginCall call) {
        Intent intent = new Intent(Build.VERSION.SDK_INT >= 26 ? Settings.ACTION_APP_NOTIFICATION_SETTINGS : Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        if (Build.VERSION.SDK_INT >= 26) intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        else intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent); call.resolve();
    }
    private void rememberNotice(Intent intent) {
        if (intent == null) return;
        String id = intent.getStringExtra("campusNoticeId");
        if (id == null || !id.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) return;
        preferences(getContext()).edit().putString("pendingNotice", id).apply();
        intent.removeExtra("campusNoticeId");
        JSObject value = new JSObject(); value.put("id", id);
        notifyListeners("noticeOpened", value, true);
    }
    @Override protected void handleOnNewIntent(Intent intent) { rememberNotice(intent); }
    @PluginMethod public void consumePendingNotice(PluginCall call) {
        SharedPreferences store = preferences(getContext());
        JSObject result = new JSObject(); result.put("id", store.getString("pendingNotice", ""));
        store.edit().remove("pendingNotice").apply(); call.resolve(result);
    }
    static void registered(Context context, String cid) {
        if (cid == null || cid.isEmpty()) return;
        preferences(context).edit().putString("cid", cid).apply();
        CampusPushPlugin plugin = active.get();
        if (plugin != null) plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("registration", plugin.status(), true));
    }
}
