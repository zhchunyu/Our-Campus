package cn.edu.sxau.campustwin;

import android.content.Context;
import com.igexin.sdk.GTIntentService;

public class CampusPushService extends GTIntentService {
    @Override public void onReceiveClientId(Context context, String clientid) {
        CampusPushPlugin.registered(context, clientid);
    }
}
