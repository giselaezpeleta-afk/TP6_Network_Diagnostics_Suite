package com.networkdiagnosticssuite.ssh

import android.app.Activity
import android.content.Intent
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import android.util.Base64
import com.facebook.react.bridge.*
import com.jcraft.jsch.*
import com.networkdiagnosticssuite.BuildConfig
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SSHDiagnosticsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val encryptedFile = File(context.filesDir, "ssh-credential.enc")
  private val alias = "tp6.ssh.credential"
  private var pendingImport: Promise? = null

  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != 6103) return
      val promise = pendingImport ?: return
      pendingImport = null
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) { promise.resolve(false); return }
      worker.execute {
        try {
          val bytes = reactApplicationContext.contentResolver.openInputStream(uri)?.use { stream ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(4096)
            while (true) {
              val count = stream.read(buffer)
              if (count < 0) break
              if (output.size() + count > 65536) throw IllegalArgumentException()
              output.write(buffer, 0, count)
            }
            output.toByteArray()
          } ?: throw IllegalArgumentException()
          saveKey(bytes)
          promise.resolve(true)
        } catch (_: Exception) { promise.reject("SSH_IMPORT", "No se pudo importar la clave. Usá una clave OpenSSH sin frase de protección.") }
      }
    }
  }

  init { context.addActivityEventListener(listener) }
  override fun getName() = "SSHDiagnostics"

  private fun encryptionKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!store.containsAlias(alias)) {
      KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
        init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .setKeySize(256).build())
        generateKey()
      }
    }
    return store.getKey(alias, null) as SecretKey
  }

  private fun saveKey(bytes: ByteArray) {
    val client = JSch()
    try {
      // Se valida el formato antes de reemplazar una credencial existente.
      client.addIdentity("credential", bytes, null, null)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
      val ciphertext = cipher.doFinal(bytes)
      val file = AtomicFile(encryptedFile)
      val output = file.startWrite()
      try {
        output.write(cipher.iv.size)
        output.write(cipher.iv)
        output.write(ciphertext)
        file.finishWrite(output)
      } catch (error: Exception) { file.failWrite(output); throw error }
    } finally { bytes.fill(0); client.removeAllIdentity() }
  }

  private fun readKey(): ByteArray {
    val stored = encryptedFile.readBytes()
    val length = stored[0].toInt() and 255
    require(length == 12 && stored.size > 1 + length + 16)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, stored.copyOfRange(1, 1 + length)))
    return cipher.doFinal(stored.copyOfRange(1 + length, stored.size))
  }

  @ReactMethod fun hasKey(promise: Promise) {
    worker.execute {
      try {
        // Solo en debug: permite provisionar la clave de prueba vía run-as.
        // Se cifra inmediatamente y se elimina la copia temporal privada de la app.
        val prepared = File(reactApplicationContext.filesDir, "ssh-import")
        if (BuildConfig.DEBUG && prepared.exists()) {
          try { require(prepared.length() in 1..65536); saveKey(prepared.readBytes()) }
          finally { check(prepared.delete()) { "No se pudo eliminar la copia temporal." } }
        }
        promise.resolve(encryptedFile.exists())
      } catch (_: Exception) { promise.reject("SSH_KEY", "No se pudo guardar la clave en Keystore.") }
    }
  }

  @ReactMethod fun importKey(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null || pendingImport != null) { promise.reject("SSH_IMPORT", "No se puede abrir el selector de archivos ahora."); return }
    pendingImport = promise
    try {
      activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        type = "*/*"; addCategory(Intent.CATEGORY_OPENABLE)
      }, 6103)
    } catch (_: Exception) { pendingImport = null; promise.reject("SSH_IMPORT", "No se pudo abrir el selector de archivos.") }
  }

  @ReactMethod fun execute(host: String, port: Int, username: String, fingerprint: String, command: String, promise: Promise) {
    if (command !in setOf("uptime", "ip -s link") || port !in 1..65535 || username.isBlank() ||
        !fingerprint.matches(Regex("SHA256:[A-Za-z0-9+/]{43}"))) {
      promise.reject("SSH_PARAMETERS", "Revisá puerto, usuario y huella SHA256 del servidor."); return
    }
    worker.execute {
      val client = JSch()
      var session: Session? = null
      var channel: ChannelExec? = null
      var privateKey: ByteArray? = null
      val repository = FingerprintRepository(fingerprint)
      try {
        if (!encryptedFile.exists()) { promise.reject("SSH_KEY", "Importá una clave SSH primero."); return@execute }
        privateKey = readKey()
        client.addIdentity("credential", privateKey, null, null)
        client.hostKeyRepository = repository
        session = client.getSession(username, host, port).apply {
          setConfig("StrictHostKeyChecking", "yes")
          setConfig("PreferredAuthentications", "publickey")
          timeout = 5000
          connect(5000)
        }
        channel = session.openChannel("exec") as ChannelExec
        channel.setCommand(command)
        channel.setInputStream(null)
        val input = channel.inputStream
        channel.connect(5000)
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        val deadline = System.nanoTime() + 10_000_000_000L
        while (true) {
          while (input.available() > 0) {
            val count = input.read(buffer)
            if (count < 0) break
            if (output.size() + count > 65536) throw IllegalStateException()
            output.write(buffer, 0, count)
          }
          if (channel.isClosed && input.available() == 0) break
          if (System.nanoTime() > deadline) throw IllegalStateException()
          Thread.sleep(20)
        }
        if (channel.exitStatus != 0) { promise.reject("SSH_COMMAND", "El servidor rechazó o no pudo ejecutar el comando.") }
        else { promise.resolve(output.toString("UTF-8")) }
      } catch (_: Exception) {
        // No se devuelve el texto de errores de librería: podría incluir credenciales.
        promise.reject("SSH_CONNECTION", if (repository.mismatch) "La huella del servidor SSH no coincide. Conexión rechazada." else "No se pudo conectar por SSH. Revisá el equipo, la clave y la huella del servidor.")
      } finally { channel?.disconnect(); session?.disconnect(); client.removeAllIdentity(); privateKey?.fill(0) }
    }
  }

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(listener)
    pendingImport?.reject("SSH_CANCEL", "Importación cancelada.")
    pendingImport = null
    worker.shutdownNow()
    super.invalidate()
  }
}

// La huella debe obtenerse por un canal confiable (en el laboratorio, Docker).
// Nunca se acepta automáticamente un servidor desconocido o una huella distinta.
private class FingerprintRepository(private val expected: String) : HostKeyRepository {
  var mismatch = false
  override fun check(host: String?, key: ByteArray?): Int {
    if (key == null) return HostKeyRepository.NOT_INCLUDED
    val digest = MessageDigest.getInstance("SHA-256").digest(key)
    val actual = "SHA256:" + Base64.encodeToString(digest, Base64.NO_WRAP or Base64.NO_PADDING)
    if (MessageDigest.isEqual(actual.toByteArray(), expected.toByteArray())) return HostKeyRepository.OK
    mismatch = true
    return HostKeyRepository.CHANGED
  }
  override fun add(hostkey: HostKey?, ui: UserInfo?) { throw UnsupportedOperationException() }
  override fun remove(host: String?, type: String?) {}
  override fun remove(host: String?, type: String?, key: ByteArray?) {}
  override fun getKnownHostsRepositoryID() = "TP6 fingerprint pin"
  override fun getHostKey(): Array<HostKey> = emptyArray()
  override fun getHostKey(host: String?, type: String?): Array<HostKey> = emptyArray()
}
