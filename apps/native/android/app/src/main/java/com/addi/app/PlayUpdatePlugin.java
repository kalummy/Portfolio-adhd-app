package com.addi.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;

/** Uses Play's availability and existing store UX. Dev/sideloaded APKs never start an update. */
@CapacitorPlugin(name = "AddiPlayUpdate")
public class PlayUpdatePlugin extends Plugin {
    private boolean playInstalled() {
        if (!"com.addi.app".equals(getContext().getPackageName())) return false;
        try {
            String installer = Build.VERSION.SDK_INT >= 30
                ? getContext().getPackageManager().getInstallSourceInfo(getContext().getPackageName()).getInstallingPackageName()
                : getContext().getPackageManager().getInstallerPackageName(getContext().getPackageName());
            return "com.android.vending".equals(installer);
        } catch (Exception error) { return false; }
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", playInstalled());
        if (!playInstalled()) { result.put("status", "unsupported"); call.resolve(result); return; }
        AppUpdateManagerFactory.create(getContext()).getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                result.put("status", info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE ? "available" : "current");
                call.resolve(result);
            }).addOnFailureListener(error -> { result.put("status", "unknown"); call.resolve(result); });
    }
    @PluginMethod public void open(PluginCall call) {
        if (!playInstalled()) { call.reject("play_update_unavailable"); return; }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + getContext().getPackageName()));
            intent.setPackage("com.android.vending");
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) { call.reject("play_update_unavailable"); }
    }
}
