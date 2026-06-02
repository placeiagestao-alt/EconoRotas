package com.econorotas.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ImileCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
