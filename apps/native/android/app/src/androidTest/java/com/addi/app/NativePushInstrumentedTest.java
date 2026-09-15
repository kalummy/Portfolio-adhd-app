package com.addi.app;

import static org.junit.Assert.*;

import android.app.NotificationManager;
import android.app.job.JobScheduler;
import android.content.Context;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.firebase.messaging.RemoteMessage;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativePushInstrumentedTest {

  @Test
  public void encryptedStoreAndNativeDeliveryGuards() throws Exception {
    // Never run fixture replacement on a physical Galaxy or Production package.
    assertTrue(Build.MODEL.contains("sdk") || Build.MODEL.contains("Emulator"));
    Context context =
      InstrumentationRegistry.getInstrumentation().getTargetContext();
    assertEquals("com.addi.app.dev", context.getPackageName());
    android.content.SharedPreferences disk = context.getSharedPreferences(
      "addi_native_push",
      0
    );
    String original = disk.getString("ciphertext", null);
    NotificationManager notifications =
      (NotificationManager) context.getSystemService(
        Context.NOTIFICATION_SERVICE
      );
    try {
      JSONObject state;
      synchronized (NativePushStore.LOCK) {
        disk.edit().clear().commit();
        state = NativePushStore.read(context);
        state
          .put("owner", "synthetic")
          .put("token", "SYNTHETIC_FCM_CANARY")
          .put("active", true)
          .put(
            "preferences",
            new JSONObject()
              .put("medication", true)
              .put("visit_day", true)
              .put("mood", true)
          );
        NativePushStore.save(context, state);
        assertEquals(
          "SYNTHETIC_FCM_CANARY",
          NativePushStore.read(context).getString("token")
        );
      }
      assertFalse(
        disk.getString("ciphertext", "").contains("SYNTHETIC_FCM_CANARY")
      );
      // Capacitor represents small JSON numbers as Integer, not Long.
      JSONObject ack = new JSONObject()
        .put("revision", (int) state.getLong("revision"))
        .put("bindingId", state.getString("bindingId"));
      assertTrue(NativePushStore.acknowledge(context, ack));
      assertTrue(NativePushStore.read(context).getBoolean("active"));
      assertFalse(
        NativePushStore.acknowledge(
          context,
          new JSONObject()
            .put("revision", 0)
            .put("bindingId", state.getString("bindingId"))
        )
      );
      notifications.cancelAll();
      NativeMessagingService.channel(context);
      Map<String, String> data = new HashMap<>();
      data.put("installation_id", state.getString("installationId"));
      data.put("binding_id", state.getString("bindingId"));
      data.put("delivery_id", "synthetic-delivery");
      data.put("kind", "medication");
      data.put("route", "/");
      data.put("title", "복용 알림");
      data.put("body", "오늘의 복용 여부를 확인해보세요.");
      data.put("expires_at", Long.toString(System.currentTimeMillis() + 60000));
      NativeMessagingService.deliver(
        context,
        new RemoteMessage.Builder("synthetic").setData(data).build()
      );
      assertEquals(1, notifications.getActiveNotifications().length);
      assertEquals(
        R.drawable.ic_notification_icon,
        notifications
          .getActiveNotifications()[0].getNotification()
          .getSmallIcon()
          .getResId()
      );
      assertEquals(
        context.getPackageName(),
        notifications.getActiveNotifications()[0].getPackageName()
      );
      NativeMessagingService.deliver(
        context,
        new RemoteMessage.Builder("synthetic").setData(data).build()
      );
      assertEquals(1, notifications.getActiveNotifications().length);
      for (String fault : new String[] {
        "wrong_binding",
        "expired",
        "external_route",
        "disabled",
        "revoked",
      }) {
        Map<String, String> bad = new HashMap<>(data);
        bad.put("delivery_id", UUID.randomUUID().toString());
        if (fault.equals("wrong_binding")) bad.put(
          "binding_id",
          UUID.randomUUID().toString()
        );
        if (fault.equals("expired")) bad.put("expires_at", "1");
        if (fault.equals("external_route")) bad.put(
          "route",
          "https://example.invalid"
        );
        synchronized (NativePushStore.LOCK) {
          JSONObject s = NativePushStore.read(context);
          if (fault.equals("disabled")) s
            .getJSONObject("preferences")
            .put("medication", false);
          if (fault.equals("revoked")) s.put("active", false);
          NativePushStore.save(context, s);
        }
        NativeMessagingService.deliver(
          context,
          new RemoteMessage.Builder("synthetic").setData(bad).build()
        );
        assertEquals(fault, 1, notifications.getActiveNotifications().length);
      }
    } finally {
      notifications.cancelAll();
      ((JobScheduler) context.getSystemService(
          Context.JOB_SCHEDULER_SERVICE
        )).cancel(7301);
      synchronized (NativePushStore.LOCK) {
        if (original == null) disk.edit().clear().commit();
        else disk.edit().putString("ciphertext", original).commit();
      }
    }
  }
}
