package com.addi.app;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Read-only IME state. Capacitor SystemBars retains ownership of inset application. */
@CapacitorPlugin(name = "AddiImeState")
public class ImeStatePlugin extends Plugin {
    @PluginMethod
    public void getState(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
            JSObject result = new JSObject();
            result.put("visible", insets != null && insets.isVisible(WindowInsetsCompat.Type.ime()));
            call.resolve(result);
        });
    }
}
