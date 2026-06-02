package com.econorotas.app;

import android.content.Context;
import android.content.SharedPreferences;

final class ImileCaptureStore {
    static final String RIDER_PACKAGE = "com.imile.redelivery";
    private static final String PREFS = "econorotas_imile_capture";
    private static final String KEY_ACTIVE = "active";
    private static final String KEY_CAPTURE = "capture_xml";
    private static final int MAX_CAPTURE_CHARS = 4_000_000;

    private ImileCaptureStore() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void start(Context context) {
        prefs(context).edit().putBoolean(KEY_ACTIVE, true).putString(KEY_CAPTURE, "").apply();
    }

    static void stop(Context context) {
        prefs(context).edit().putBoolean(KEY_ACTIVE, false).apply();
    }

    static boolean isActive(Context context) {
        return prefs(context).getBoolean(KEY_ACTIVE, false);
    }

    static String getCapture(Context context) {
        return prefs(context).getString(KEY_CAPTURE, "");
    }

    static void appendPage(Context context, String pageXml) {
        SharedPreferences shared = prefs(context);
        String current = shared.getString(KEY_CAPTURE, "");
        String next = current + pageXml;
        if (next.length() > MAX_CAPTURE_CHARS) {
            next = next.substring(next.length() - MAX_CAPTURE_CHARS);
        }
        shared.edit().putString(KEY_CAPTURE, next).apply();
    }

    static String wrapCapture(String pagesXml) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<imileCapture source=\"android_accessibility\">\n"
            + pagesXml
            + "\n</imileCapture>";
    }
}
