package com.addi.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Ciphertext only on disk; non-exportable AES key in AndroidKeyStore. No fallback/logging. */
@CapacitorPlugin(name = "AddiSecureStorage")
public class AddiSecureStoragePlugin extends Plugin {
    private static final String ALIAS = "addi.native.auth.v1";
    private SharedPreferences prefs() { return getContext().getSharedPreferences("addi_native_auth", Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    private String name(PluginCall call) throws Exception {
        String value = call.getString("key");
        if (value == null || !value.matches("addi-native-[a-zA-Z0-9_-]{1,160}")) throw new Exception();
        return value;
    }
    @PluginMethod public synchronized void get(PluginCall call) {
        try {
            String name = name(call), stored = prefs().getString(name, null);
            JSObject result = new JSObject();
            if (stored == null) { result.put("value", org.json.JSONObject.NULL); call.resolve(result); return; }
            String[] parts = stored.split(":", -1);
            if (parts.length != 3 || !"v1".equals(parts[0])) throw new Exception();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[1], Base64.NO_WRAP)));
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) { call.reject("secure_storage_unavailable"); }
    }
    @PluginMethod public synchronized void set(PluginCall call) {
        try {
            String name = name(call), value = call.getString("value");
            if (value == null || value.length() > 262144) throw new Exception();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            String encrypted = "v1:" + Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":"
                + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!prefs().edit().putString(name, encrypted).commit()) throw new Exception();
            call.resolve();
        } catch (Exception error) { call.reject("secure_storage_unavailable"); }
    }
    @PluginMethod public synchronized void remove(PluginCall call) {
        try {
            if (!prefs().edit().remove(name(call)).commit()) throw new Exception();
            call.resolve();
        } catch (Exception error) { call.reject("secure_storage_unavailable"); }
    }
    @PluginMethod public synchronized void clearVerifiers(PluginCall call) {
        SharedPreferences.Editor editor = prefs().edit();
        for (String name : prefs().getAll().keySet()) {
            if (name.startsWith("addi-native-dev-auth-") && (name.contains("code-verifier") || name.contains("flow"))) editor.remove(name);
        }
        if (editor.commit()) call.resolve(); else call.reject("secure_storage_unavailable");
    }
    @PluginMethod public synchronized void clear(PluginCall call) {
        if (prefs().edit().clear().commit()) call.resolve(); else call.reject("secure_storage_unavailable");
    }
}
