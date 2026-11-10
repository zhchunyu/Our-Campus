package cn.edu.sxau.campustwin;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Pattern;

/** The native boundary accepts only public APK objects belonging to this project. */
final class CampusUpdateUrlPolicy {
    private static final String HOST = "hkdblizadnkskxslyjyq.supabase.co";
    private static final String PREFIX = "/storage/v1/object/public/app-releases/android/";
    private static final Pattern APK_PATH = Pattern.compile(Pattern.quote(PREFIX) + "[A-Za-z0-9._-]+\\.apk");

    private CampusUpdateUrlPolicy() {}

    static boolean isAllowed(String value) {
        if (value == null || value.isEmpty()) return false;
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.isOpaque()
                || !HOST.equalsIgnoreCase(uri.getHost()) || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null) return false;
            String authority = uri.getRawAuthority();
            if (!HOST.equalsIgnoreCase(authority) && !(HOST + ":443").equalsIgnoreCase(authority)) return false;
            String path = uri.getRawPath();
            return path != null && APK_PATH.matcher(path).matches()
                && !path.substring(PREFIX.length()).contains("..");
        } catch (URISyntaxException invalid) {
            return false;
        }
    }
}
