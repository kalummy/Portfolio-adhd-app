package com.addi.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Separate from Auth storage: pending offline revocation survives clearing the Auth session. */
final class NativePushStore {

  static final Object LOCK = new Object();

  private static SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    String alias = "addi.native.push.v1";
    if (!store.containsAlias(alias)) {
      KeyGenerator gen = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES,
        "AndroidKeyStore"
      );
      gen.init(
        new KeyGenParameterSpec.Builder(
          alias,
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256)
          .build()
      );
      gen.generateKey();
    }
    return (SecretKey) store.getKey(alias, null);
  }

  static JSONObject read(Context context) throws Exception {
    String raw = context
      .getSharedPreferences("addi_native_push", 0)
      .getString("ciphertext", null);
    if (raw != null) {
      String[] parts = raw.split(":");
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(
        Cipher.DECRYPT_MODE,
        key(),
        new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP))
      );
      c.updateAAD("addi-push-v1".getBytes(StandardCharsets.UTF_8));
      return new JSONObject(
        new String(
          c.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)),
          StandardCharsets.UTF_8
        )
      );
    }
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    StringBuilder secret = new StringBuilder();
    for (byte b : bytes) secret.append(String.format("%02x", b));
    JSONObject state = new JSONObject()
      .put("installationId", UUID.randomUUID().toString())
      .put("secret", secret.toString())
      .put("revision", 1)
      .put("preferences", disabled())
      .put("active", false)
      .put("owner", "")
      .put("bindingId", UUID.randomUUID().toString())
      .put("token", "");
    save(context, state);
    return state;
  }

  static JSONObject disabled() throws Exception {
    return new JSONObject()
      .put("medication", false)
      .put("visit_day", false)
      .put("mood", false);
  }

  static void save(Context context, JSONObject state) throws Exception {
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(Cipher.ENCRYPT_MODE, key());
    c.updateAAD("addi-push-v1".getBytes(StandardCharsets.UTF_8));
    String encrypted =
      Base64.encodeToString(c.getIV(), Base64.NO_WRAP) +
      ":" +
      Base64.encodeToString(
        c.doFinal(state.toString().getBytes(StandardCharsets.UTF_8)),
        Base64.NO_WRAP
      );
    if (
      !context
        .getSharedPreferences("addi_native_push", 0)
        .edit()
        .putString("ciphertext", encrypted)
        .commit()
    ) throw new Exception();
  }

  static boolean acknowledge(Context context, JSONObject input)
    throws Exception {
    synchronized (LOCK) {
      Object number = input.opt("revision");
      if (!(number instanceof Number)) return false;
      long revision = ((Number) number).longValue();
      if (((Number) number).doubleValue() != revision) return false;
      JSONObject s = read(context);
      if (
        s.getLong("revision") != revision ||
        !s.optString("bindingId").equals(input.optString("bindingId")) ||
        s.optString("owner").isEmpty()
      ) return false;
      s.put("active", true);
      s.remove("pending");
      save(context, s);
      return true;
    }
  }

  static JSONObject identity(JSONObject state) throws Exception {
    return new JSONObject()
      .put("installationId", state.getString("installationId"))
      .put("secret", state.getString("secret"))
      .put("revision", state.getLong("revision"));
  }

  static void token(Context context, String token) throws Exception {
    synchronized (LOCK) {
      JSONObject s = read(context);
      if (token.equals(s.optString("token"))) return;
      s.put("token", token).put("revision", s.getLong("revision") + 1);
      if (s.optBoolean("active")) s.put(
        "pending",
        identity(s)
          .put("action", "rotate")
          .put("bindingId", s.getString("bindingId"))
          .put("token", token)
      );
      save(context, s);
    }
    NativePushJob.schedule(context);
  }

  static void revoke(Context context) throws Exception {
    synchronized (LOCK) {
      JSONObject s = read(context);
      if (s.optString("owner").isEmpty() && !s.optBoolean("active")) return;
      s
        .put("revision", s.getLong("revision") + 1)
        .put("active", false)
        .put("owner", "")
        .put("preferences", disabled());
      s.remove("tap");
      s.put("pending", identity(s).put("action", "revoke"));
      save(context, s);
    }
    NativePushJob.schedule(context);
  }
}
