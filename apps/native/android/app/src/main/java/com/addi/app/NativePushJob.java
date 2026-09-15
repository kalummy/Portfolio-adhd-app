package com.addi.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** Capability-only maintenance: cannot enable a preference, read data, send, or transfer ownership. */
public class NativePushJob extends JobService {

  static void schedule(Context c) {
    ((JobScheduler) c.getSystemService(JOB_SCHEDULER_SERVICE)).schedule(
      new JobInfo.Builder(7301, new ComponentName(c, NativePushJob.class))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
        .build()
    );
  }

  static boolean flush(Context c) {
    try {
      JSONObject pending;
      synchronized (NativePushStore.LOCK) {
        pending = NativePushStore.read(c).optJSONObject("pending");
        if (pending == null) return true;
        pending = new JSONObject(pending.toString());
      }
      String action = pending.getString("action");
      pending.remove("action");
      if (!action.equals("rotate") && !action.equals("revoke")) return true;
      HttpURLConnection connection = (HttpURLConnection) URI.create(
        "https://ohobxicxchkaisxxswkk.supabase.co/functions/v1/native-push/" +
          action
      )
        .toURL()
        .openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(10000);
      connection.setReadTimeout(10000);
      connection.setInstanceFollowRedirects(false);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json");
      try (java.io.OutputStream out = connection.getOutputStream()) {
        out.write(pending.toString().getBytes(StandardCharsets.UTF_8));
      }
      int status = connection.getResponseCode();
      connection.disconnect();
      if (status < 200 || status >= 300) return false;
      synchronized (NativePushStore.LOCK) {
        JSONObject s = NativePushStore.read(c);
        JSONObject current = s.optJSONObject("pending");
        if (
          current != null &&
          current.optLong("revision") == pending.getLong("revision")
        ) {
          s.remove("pending");
          NativePushStore.save(c, s);
        }
      }
      return true;
    } catch (Exception ignored) {
      return false;
    }
  }

  @Override
  public boolean onStartJob(JobParameters params) {
    new Thread(() -> jobFinished(params, !flush(this))).start();
    return true;
  }

  @Override
  public boolean onStopJob(JobParameters params) {
    return true;
  }
}
