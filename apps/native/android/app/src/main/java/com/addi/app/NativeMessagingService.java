package com.addi.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Data messages are displayed natively in every process state; no WebView or browser dependency. */
public class NativeMessagingService extends FirebaseMessagingService {

  static final String CHANNEL = "addi_reminders_v1";

  static boolean allowed(String route) {
    return (
      "/".equals(route) || "/moods/new".equals(route) || "/visits".equals(route)
    );
  }

  static void channel(Context c) {
    NotificationManager m = (NotificationManager) c.getSystemService(
      NOTIFICATION_SERVICE
    );
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel channel = new NotificationChannel(
        CHANNEL,
        "아디 리마인더",
        NotificationManager.IMPORTANCE_DEFAULT
      );
      channel.setDescription("복약·감정 기록·내원 알림");
      m.createNotificationChannel(channel);
    }
  }

  @Override
  public void onNewToken(String token) {
    try {
      NativePushStore.token(this, token);
      PushNotificationsPlugin.onNewToken(token);
    } catch (Exception ignored) {
      /* fail closed; retry getToken on next authenticated launch */
    }
  }

  @Override
  public void onMessageReceived(RemoteMessage message) {
    deliver(this, message);
  }

  static void deliver(Context context, RemoteMessage message) {
    try {
      synchronized (NativePushStore.LOCK) {
        JSONObject s = NativePushStore.read(context);
        Map<String, String> d = message.getData();
        String route = d.get("route"),
          kind = d.get("kind"),
          delivery = d.get("delivery_id");
        if (
          !s.optBoolean("active") ||
          !s.optString("installationId").equals(d.get("installation_id")) ||
          !s.optString("bindingId").equals(d.get("binding_id")) ||
          !allowed(route) ||
          delivery == null ||
          delivery.length() > 200
        ) return;
        if (
          !(("medication".equals(kind) && "/".equals(route)) ||
            ("mood".equals(kind) && "/moods/new".equals(route)) ||
            ("visit_day".equals(kind) && "/visits".equals(route)))
        ) return;
        long expires = Long.parseLong(d.get("expires_at"));
        if (
          expires <= System.currentTimeMillis() ||
          expires > System.currentTimeMillis() + 120000 ||
          !s.getJSONObject("preferences").optBoolean(kind)
        ) return;
        if (
          Build.VERSION.SDK_INT >= 33 &&
          ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
          ) !=
          PackageManager.PERMISSION_GRANTED
        ) return;
        JSONArray seen = s.optJSONArray("seen");
        if (seen == null) seen = new JSONArray();
        for (int i = 0; i < seen.length(); i++) if (
          delivery.equals(seen.getString(i))
        ) return;
        seen.put(delivery);
        while (seen.length() > 64) seen.remove(0);
        s.put("seen", seen);
        NativePushStore.save(context, s);
        channel(context);
        Intent intent = new Intent(context, MainActivity.class)
          .setAction("com.addi.app.dev.NOTIFICATION")
          .setData(
            android.net.Uri.parse(
              "addi-internal://notification/" + android.net.Uri.encode(delivery)
            )
          )
          .addFlags(
            Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP
          )
          .putExtra("addi_route", route)
          .putExtra("addi_binding", s.getString("bindingId"));
        PendingIntent tap = PendingIntent.getActivity(
          context,
          0,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String title = d.get("title"),
          body = d.get("body");
        if (
          title == null ||
          body == null ||
          title.length() > 80 ||
          body.length() > 200
        ) return;
        NotificationCompat.Builder notification =
          new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification_icon)
            .setColor(0xFF50D9BA)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true);
        ((NotificationManager) context.getSystemService(
            Context.NOTIFICATION_SERVICE
          )).notify(delivery, 0, notification.build());
      }
    } catch (Exception ignored) {
      /* No raw payload, identity, or token is logged. */
    }
  }
}
