package com.econorotas.app;

import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ImileCapture")
public class ImileCapturePlugin extends Plugin {
    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void startCapture(PluginCall call) {
        ImileCaptureStore.start(getContext());

        Intent launchIntent = getContext()
            .getPackageManager()
            .getLaunchIntentForPackage(ImileCaptureStore.RIDER_PACKAGE);

        if (launchIntent == null) {
            call.reject("Rider Delivery nao esta instalado neste Android.");
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launchIntent);
        call.resolve();
    }

    @PluginMethod
    public void stopCapture(PluginCall call) {
        ImileCaptureStore.stop(getContext());
        JSObject result = new JSObject();
        result.put("xml", ImileCaptureStore.wrapCapture(ImileCaptureStore.getCapture(getContext())));
        call.resolve(result);
    }

    @PluginMethod
    public void getCapture(PluginCall call) {
        JSObject result = new JSObject();
        result.put("active", ImileCaptureStore.isActive(getContext()));
        result.put("xml", ImileCaptureStore.wrapCapture(ImileCaptureStore.getCapture(getContext())));
        call.resolve(result);
    }
}
