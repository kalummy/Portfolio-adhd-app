package com.addi.app;

import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Selection feedback honors the device touch-feedback setting. No vibration waveform. */
@CapacitorPlugin(name = "AddiNavigationHaptics")
public class NavigationHapticsPlugin extends Plugin {
    @PluginMethod
    public void selection(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            getBridge().getWebView().performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK);
            call.resolve();
        });
    }
}
