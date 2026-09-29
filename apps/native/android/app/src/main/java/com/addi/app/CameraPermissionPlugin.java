package com.addi.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "AddiCameraPermission", permissions = {
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
})
public class CameraPermissionPlugin extends Plugin {
    @PluginMethod public void ensure(PluginCall call) {
        PermissionState state = getPermissionState("camera");
        if (state == PermissionState.GRANTED) { complete(call); return; }
        if (state == PermissionState.DENIED) {
            // Only an explicit press of the existing Allow button reaches here.
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName())));
            } catch (Exception error) { /* Retry remains on the existing permission screen. */ }
            complete(call);
            return;
        }
        requestPermissionForAlias("camera", call, "complete");
    }
    @PermissionCallback private void complete(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("camera") == PermissionState.GRANTED);
        call.resolve(result);
    }
}
