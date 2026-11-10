package cn.edu.sxau.campustwin;

/** Runs with the JDK alone; no Android runtime or JUnit dependency is required. */
public final class CampusUpdateUrlPolicyTest {
    private static final String BASE = "https://hkdblizadnkskxslyjyq.supabase.co/storage/v1/object/public/app-releases/android/";
    private static int assertions;

    public static void main(String[] args) throws Exception {
        expect(true, BASE + "OurCampus-1.17.apk");
        expect(true, BASE + "v1_17-release.apk");
        expect(true, BASE.replace(".co/", ".co:443/") + "1.17.apk");
        expect(true, BASE.replace("https://", "HTTPS://").replace("supabase", "SUPABASE") + "1.17.apk");
        String[] blocked = {
            null, "", " ", BASE, BASE + ".apk?", BASE + "a.apk#", BASE + "a.apk?token=x", BASE + "a.apk#x",
            BASE.replace("https://", "http://") + "a.apk",
            BASE.replace("https://", "intent://") + "a.apk",
            BASE.replace("https://", "file://") + "a.apk",
            BASE.replace("https://", "//") + "a.apk",
            BASE.replace("https://", "https://user@") + "a.apk",
            BASE.replace("https://", "https://user:password@") + "a.apk",
            BASE.replace(".co/", ".co.evil.example/") + "a.apk",
            BASE.replace(".co/", ".co./") + "a.apk",
            BASE.replace("hkdblizadnkskxslyjyq", "other-project") + "a.apk",
            BASE.replace(".co/", ".co:80/") + "a.apk",
            BASE.replace(".co/", ".co:444/") + "a.apk",
            BASE.replace(".co/", ".co:/") + "a.apk",
            BASE.replace(".co/", ".co:0443/") + "a.apk",
            BASE.replace("/public/", "/sign/") + "a.apk",
            BASE.replace("/android/", "/ios/") + "a.apk",
            BASE + "../a.apk", BASE + "a..apk", BASE + "a..b.apk", BASE + "nested/a.apk",
            BASE + "%2e%2e.apk", BASE + "a%2f.apk", BASE + "a%5c.apk", BASE + "a\\b.apk",
            BASE + "a.apk/", BASE + "a.apk.exe", BASE + "a.APK", BASE + "校园.apk",
            BASE + "a b.apk", " " + BASE + "a.apk", BASE + "a.apk\n", BASE + "a.apk\r\n",
            BASE.replace("https://", "https:\\") + "a.apk"
        };
        for (String url : blocked) expect(false, url);
        System.out.println("CampusUpdateUrlPolicyTest: " + assertions + " assertions passed");
    }

    private static void expect(boolean expected, String url) {
        boolean actual = CampusUpdateUrlPolicy.isAllowed(url);
        assertions++;
        if (actual != expected) {
            throw new AssertionError("Expected " + expected + " for URL: " + url + "; got " + actual);
        }
    }
}