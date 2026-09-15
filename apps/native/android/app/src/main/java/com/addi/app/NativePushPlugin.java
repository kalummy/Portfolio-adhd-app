package com.addi.app;

import android.app.NotificationManager;
import android.content.Intent;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.UUID;
import org.json.JSONObject;

@CapacitorPlugin(name = "AddiNativePush")
public class NativePushPlugin extends Plugin {
  private static com.google.android.gms.tasks.Task<Void> tokenDeletion;

  @Override
  public void load() {
    NativeMessagingService.channel(getContext());
    NativePushJob.schedule(getContext());
    capture(getActivity().getIntent());
  }

  private void capture(Intent intent) {
    if (intent == null) return;
    String route = intent.getStringExtra("addi_route"),
      binding = intent.getStringExtra("addi_binding");
    if (!NativeMessagingService.allowed(route)) return;
    try {
      synchronized (NativePushStore.LOCK) {
        JSONObject s = NativePushStore.read(getContext());
        if (
          !s.optBoolean("active") || !s.optString("bindingId").equals(binding)
        ) return;
        s.put("tap", route);
        NativePushStore.save(getContext(), s);
      }
      notifyListeners("tap", new JSObject(), true);
    } catch (Exception ignored) {}
    intent.removeExtra("addi_route");
    intent.removeExtra("addi_binding");
  }

  @Override
  protected void handleOnNewIntent(Intent intent) {
    super.handleOnNewIntent(intent);
    capture(intent);
  }

  @PluginMethod
  public void snapshot(PluginCall call) {
    try {
      synchronized (NativePushStore.LOCK) {
        call.resolve(
          JSObject.fromJSONObject(NativePushStore.read(getContext()))
        );
      }
    } catch (Exception ignored) {
      call.reject("push_storage_unavailable");
    }
  }

  @PluginMethod
  public void prepare(PluginCall call) {
    try {
      synchronized (NativePushStore.LOCK) {
        JSONObject s = NativePushStore.read(getContext());
        String owner = call.getString("owner");
        if (
          owner == null || !owner.matches("[a-f0-9]{64}")
        ) throw new Exception();
        if (!owner.equals(s.optString("owner"))) {
          s
            .put("owner", owner)
            .put("bindingId", UUID.randomUUID().toString())
            .put("preferences", NativePushStore.disabled())
            .put("active", false);
          s.remove("tap");
          ((NotificationManager) getContext().getSystemService(
              android.content.Context.NOTIFICATION_SERVICE
            )).cancelAll();
        } else if (call.getObject("preferences") != null) {
          JSONObject p = call.getObject("preferences");
          if (p.length() != 3) throw new Exception();
          for (String k : new String[] { "medication", "visit_day", "mood" })
            if (!(p.get(k) instanceof Boolean)) throw new Exception();
          s.put("preferences", p);
        }
        s.put("revision", s.getLong("revision") + 1);
        NativePushStore.save(getContext(), s);
        call.resolve(JSObject.fromJSONObject(s));
      }
    } catch (Exception ignored) {
      call.reject("push_prepare_failed");
    }
  }

  @PluginMethod
  public void acknowledge(PluginCall call) {
    try {
      JSObject result = new JSObject();
      result.put(
        "accepted",
        NativePushStore.acknowledge(getContext(), call.getData())
      );
      call.resolve(result);
    } catch (Exception ignored) {
      call.reject("push_storage_unavailable");
    }
  }

  @PluginMethod
  public void takeTap(PluginCall call) {
    try {
      synchronized (NativePushStore.LOCK) {
        JSONObject s = NativePushStore.read(getContext());
        JSObject result = new JSObject();
        result.put(
          "route",
          s.optBoolean("active") ? s.optString("tap", "") : ""
        );
        s.remove("tap");
        NativePushStore.save(getContext(), s);
        call.resolve(result);
      }
    } catch (Exception ignored) {
      call.reject("push_storage_unavailable");
    }
  }

  @PluginMethod
  public void clearBinding(PluginCall call) {
    try {
      NativePushStore.revoke(getContext());
      ((NotificationManager) getContext().getSystemService(
          android.content.Context.NOTIFICATION_SERVICE
        )).cancelAll();
      FirebaseMessaging.getInstance().setAutoInitEnabled(false);
      call.resolve();
    } catch (Exception ignored) {
      call.reject("push_logout_failed");
    }
  }

  @PluginMethod
  public void deleteToken(PluginCall call) {
    synchronized (NativePushStore.LOCK) {
      if (tokenDeletion == null || tokenDeletion.isComplete()) tokenDeletion = FirebaseMessaging.getInstance().deleteToken();
      tokenDeletion.addOnCompleteListener(task -> {
        if (task.isSuccessful()) call.resolve(); else call.reject("push_token_delete_failed");
      });
    }
  }
  @PluginMethod
  public void waitForTokenDeletion(PluginCall call) {
    synchronized (NativePushStore.LOCK) {
      if (tokenDeletion == null || tokenDeletion.isComplete()) call.resolve();
      else tokenDeletion.addOnCompleteListener(task -> call.resolve());
    }
  }

  @PluginMethod
  public void storeToken(PluginCall call) {
    try {
      String token = call.getString("token");
      if (
        token == null || !token.matches("[A-Za-z0-9_:\\-.]{20,4096}")
      ) throw new Exception();
      NativePushStore.token(getContext(), token);
      call.resolve();
    } catch (Exception ignored) {
      call.reject("push_token_failed");
    }
  }
}
