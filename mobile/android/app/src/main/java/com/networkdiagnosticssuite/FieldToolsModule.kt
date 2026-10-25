package com.networkdiagnosticssuite

import android.Manifest
import android.app.Activity
import android.content.*
import android.content.pm.PackageManager
import android.graphics.*
import android.graphics.pdf.PdfDocument
import android.location.*
import android.net.*
import android.os.*
import android.provider.MediaStore
import android.util.AtomicFile
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.facebook.react.ReactPackage
import com.facebook.react.uimanager.ViewManager
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import org.json.JSONObject
import java.io.File
import java.net.*
import java.util.UUID
import java.util.concurrent.*

/** Adaptadores Android: la evidencia permanece en el directorio privado de la app. */
class FieldToolsModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private var photoPromise: Promise? = null
  private var photoFile: File? = null
  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != 6201) return
      val promise = photoPromise ?: return
      val file = photoFile
      photoPromise = null; photoFile = null
      if (resultCode == Activity.RESULT_OK && file != null && file.length() > 0) {
        promise.resolve("file://${file.absolutePath}")
      } else { file?.delete(); promise.reject("PHOTO_CANCELLED", "Captura cancelada. No se guardó ninguna foto.") }
    }
  }
  init { context.addActivityEventListener(listener) }
  override fun getName() = "FieldTools"

  // Un único ejecutor serializa lectura/escritura; AtomicFile evita archivos truncados.
  @ReactMethod fun readStore(promise: Promise) { worker.execute {
    try {
      val file = File(context.filesDir, "field-store.json")
      promise.resolve(if (file.exists()) AtomicFile(file).openRead().bufferedReader().use { it.readText() } else null)
    } catch (e: Exception) { promise.reject("STORE_READ", "No se pudo leer el almacenamiento local.", e) }
  } }
  @ReactMethod fun writeStore(value: String, promise: Promise) { worker.execute {
    val file = AtomicFile(File(context.filesDir, "field-store.json"))
    try {
      JSONObject(value) // Validar antes de reemplazar el archivo anterior.
      val stream = file.startWrite()
      try { stream.write(value.toByteArray(Charsets.UTF_8)); file.finishWrite(stream) }
      catch (e: Exception) { file.failWrite(stream); throw e }
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("STORE_WRITE", "No se pudo guardar. El registro anterior se conserva.", e) }
  } }

  @ReactMethod fun takePhoto(promise: Promise) { main.post {
    if (photoPromise != null) { promise.reject("PHOTO_BUSY", "Ya hay una captura en curso."); return@post }
    val activity = context.currentActivity
    if (activity == null) { promise.reject("PHOTO_ACTIVITY", "Abrí la app para tomar una foto."); return@post }
    try {
      val dir = File(context.filesDir, "evidence").apply { mkdirs() }
      val file = File(dir, "${UUID.randomUUID()}.jpg")
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
      val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      intent.clipData = ClipData.newRawUri("Evidencia", uri)
      photoPromise = promise; photoFile = file
      activity.startActivityForResult(intent, 6201)
    } catch (e: Exception) { photoPromise = null; photoFile?.delete(); photoFile = null; promise.reject("PHOTO", "No se pudo abrir la cámara.", e) }
  } }

  private fun ownFile(uri: String, directory: String): File {
    val file = File(Uri.parse(uri).path ?: "").canonicalFile
    val root = File(context.filesDir, directory).canonicalFile
    require(file.parentFile == root && file.isFile) { "Archivo fuera de la app." }
    return file
  }
  @ReactMethod fun retryLastCodePhoto(promise: Promise) {
    // No elegir por fecha: una foto de instalación también vive en evidence.
    val uri = context.getSharedPreferences("code-reader", Context.MODE_PRIVATE).getString("last-photo", null)
    if (uri == null) promise.reject("QR_PHOTO", "Primero fotografiá un código con el lector QR.")
    else scanPhoto(uri,promise)
  }
  @ReactMethod fun scanPhoto(uri: String, promise: Promise) { main.post {
    try {
      val codeFile = ownFile(uri, "evidence")
      context.getSharedPreferences("code-reader", Context.MODE_PRIVATE).edit().putString("last-photo", uri).apply()
      val image = InputImage.fromFilePath(context, Uri.fromFile(codeFile))
      // Un QR fotografiado desde una pantalla puede producir falsos positivos
      // lineales. Buscar QR primero; usar otros formatos solo si no hay un QR.
      val scanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
      scanner.process(image).addOnSuccessListener { codes ->
        val value = codes.firstOrNull { !it.rawValue.isNullOrBlank() }?.rawValue
        if (value != null) promise.resolve(value)
        else worker.execute {
          try {
            val file = ownFile(uri,"evidence")
            val bitmap = BitmapFactory.decodeFile(file.path) ?: throw IllegalArgumentException("Foto ilegible.")
            try {
              val options = zxingcpp.BarcodeReader.Options(
                formats = setOf(zxingcpp.BarcodeReader.Format.QR_CODE),
                tryHarder = true, tryRotate = true, tryInvert = true, tryDownscale = true
              )
              val reader = zxingcpp.BarcodeReader(options)
              fun findCode(): String? {
                // Una foto de monitor contiene una trama de píxeles (muaré).
                // El filtrado al reducirla permitió leer la captura real que
                // fallaba a resolución completa. Nunca reemplazar el original.
                val longest = maxOf(bitmap.width,bitmap.height)
                for (limit in listOf(1200,1000,800,longest).map { minOf(it,longest) }.distinct()) {
                  val sample = if (limit == longest) bitmap else Bitmap.createScaledBitmap(
                    bitmap, maxOf(1,(bitmap.width.toDouble()*limit/longest).toInt()),
                    maxOf(1,(bitmap.height.toDouble()*limit/longest).toInt()),true
                  )
                  try {
                    for (rotation in listOf(0,90,180,270)) {
                      val result = reader.read(sample,rotation = rotation).firstOrNull { it.error == null && !it.text.isNullOrBlank() }
                      if (result != null) return result.text
                    }
                  } finally { if (sample !== bitmap) sample.recycle() }
                }
                return null
              }
              // La misma captura real fallaba al aplicar solo la orientación EXIF.
              // No aceptar una lectura DataBar hasta agotar las orientaciones QR.
              var decoded = findCode()
              if (decoded == null) { options.formats = emptySet(); decoded = findCode() }
              if (decoded.isNullOrBlank()) promise.reject("QR_EMPTY","No se encontró un código. Enfocá un solo QR completo, con su margen blanco.")
              else promise.resolve(decoded)
            } finally { bitmap.recycle() }
          } catch (e: Exception) { promise.reject("QR_DECODE","No se pudo leer la foto del código.",e) }
        }
      }.addOnFailureListener { promise.reject("QR", "No se pudo leer el código.", it) }
        .addOnCompleteListener { scanner.close() }
    } catch (e: Exception) { promise.reject("QR", "No se pudo abrir la foto del código.", e) }
  } }

  @ReactMethod fun locate(promise: Promise) { main.post {
    if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
        context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("GPS_PERMISSION", "Permití el acceso a tu ubicación."); return@post
    }
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    var settled = false
    var listener: LocationListener? = null
    val timeout = Runnable {
      if (!settled) { settled = true; listener?.let { manager.removeUpdates(it) }; promise.reject("GPS_TIMEOUT", "No se obtuvo una ubicación actual en 30 segundos. Activá Ubicación y acercate a una ventana.") }
    }
    listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        if (settled) return
        // Nunca sustituir la medición por coordenadas fijas o una posición antigua.
        if (SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos > 60_000_000_000L) return
        settled = true; main.removeCallbacks(timeout); manager.removeUpdates(this)
        promise.resolve(Arguments.createMap().apply {
          putDouble("latitude", location.latitude); putDouble("longitude", location.longitude)
          putDouble("accuracy", location.accuracy.toDouble()); putDouble("timestamp", location.time.toDouble())
        })
      }
      override fun onProviderEnabled(provider: String) {}
      override fun onProviderDisabled(provider: String) {}
      @Deprecated("Android compatibility") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    }
    try {
      val precise = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter {
        manager.isProviderEnabled(it) && (it != LocationManager.GPS_PROVIDER || precise)
      }
      if (providers.isEmpty()) throw IllegalStateException("Activá Ubicación en el teléfono.")
      providers.forEach { manager.requestLocationUpdates(it, 0L, 0f, listener!!, Looper.getMainLooper()) }
      main.postDelayed(timeout, 30000)
    } catch (e: Exception) { settled = true; listener?.let { manager.removeUpdates(it) }; promise.reject("GPS", e.message ?: "No se pudo obtener la ubicación.") }
  } }

  @ReactMethod fun discover(promise: Promise) { worker.execute {
    val pool = Executors.newFixedThreadPool(16)
    try {
      val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val network = cm.allNetworks.firstOrNull { cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true }
        ?: throw IllegalStateException("Conectate a una red Wi-Fi para descubrir equipos.")
      val link = cm.getLinkProperties(network) ?: throw IllegalStateException("No se pudo leer la subred Wi-Fi.")
      val address = link.linkAddresses.firstOrNull { it.address is Inet4Address }
        ?: throw IllegalStateException("La red Wi-Fi no tiene IPv4.")
      val prefix = address.prefixLength
      require(prefix in 24..30) { "Esta versión admite subredes Wi-Fi /24 a /30 (máximo 254 equipos)." }
      val bytes = address.address.address
      val own = bytes.fold(0L) { n, b -> (n shl 8) or (b.toLong() and 255) }
      val mask = (0xffffffffL shl (32 - prefix)) and 0xffffffffL
      val first = own and mask
      val last = first or (mask xor 0xffffffffL)
      val futures = (first + 1 until last).filter { it != own }.map { number -> pool.submit<WritableMap?> {
        val ip = (3 downTo 0).joinToString(".") { ((number shr (it * 8)) and 255).toString() }
        // ARP-like: provocar tráfico TCP en la LAN, sin requerir root ni leer /proc/net.
        // Solo un handshake exitoso confirma actividad; un timeout no demuestra ausencia.
        val ports = listOf(80, 443, 22, 2222).filter { port ->
          try { network.socketFactory.createSocket().use { it.connect(InetSocketAddress(ip, port), 250) }; true }
          catch (_: Exception) { false }
        }
        if (ports.isEmpty()) null else Arguments.createMap().apply {
          putString("ip", ip); putNull("mac"); putNull("hostname")
          putArray("ports", Arguments.fromList(ports)); putString("source", "TCP / ARP-like")
          putBoolean("gateway", link.routes.any { it.isDefaultRoute && it.gateway?.hostAddress == ip })
        }
      } }
      val result = Arguments.createArray()
      futures.forEach { it.get()?.let { row -> result.pushMap(row) } }
      promise.resolve(Arguments.createMap().apply {
        putString("subnet", "${(3 downTo 0).joinToString(".") { ((first shr (it * 8)) and 255).toString() }}/$prefix")
        putString("localIp", address.address.hostAddress); putArray("devices", result)
      })
    } catch (e: Exception) { promise.reject("DISCOVERY", e.message ?: "No se pudo explorar la LAN.") }
    finally { pool.shutdownNow() }
  } }

  @ReactMethod fun generatePdf(json: String, promise: Promise) { worker.execute {
    val document = PdfDocument()
    try {
      val data = JSONObject(json)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(30,30,35); textSize = 12f }
      var pageNumber = 1
      var page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
      var y = 50f
      fun nextPage() { document.finishPage(page); page = document.startPage(PdfDocument.PageInfo.Builder(595,842,++pageNumber).create()); y = 50f }
      fun line(text: String) {
        // Partir por ancho real evita que notas extensas se corten fuera de la hoja.
        text.split('\n').forEach { paragraph ->
          var remaining = paragraph
          if (remaining.isEmpty()) y += 18
          while (remaining.isNotEmpty()) {
            if (y > 790) nextPage()
            val count = paint.breakText(remaining, true, 495f, null).coerceAtLeast(1)
            page.canvas.drawText(remaining.take(count),50f,y,paint); y += 18; remaining = remaining.drop(count)
          }
        }
      }
      paint.textSize = 20f; line("Reporte de instalación"); paint.textSize = 12f
      line("Network Diagnostics Suite"); line("ID: ${data.getString("id")}")
      line("Fecha: ${data.getString("createdAt")}"); line("Sitio: ${data.getString("site")}")
      line("Equipo: ${data.getString("equipment")}"); line("Notas: ${data.getString("notes")}")
      val gps = data.getJSONObject("location")
      line("GPS: ${gps.getDouble("latitude")}, ${gps.getDouble("longitude")}")
      line("Precisión: ${gps.getDouble("accuracy")} m; medición: ${gps.getDouble("timestamp").toLong()}")
      val photos = data.getJSONArray("photos")
      require(photos.length() > 0) { "El reporte necesita al menos una foto." }
      for (i in 0 until photos.length()) {
        val file = ownFile(photos.getString(i), "evidence")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.path, bounds)
        require(bounds.outWidth > 0) { "Foto ilegible." }
        val opts = BitmapFactory.Options().apply { inSampleSize = (maxOf(bounds.outWidth,bounds.outHeight) / 1600).coerceAtLeast(1) }
        val original = BitmapFactory.decodeFile(file.path, opts) ?: throw IllegalArgumentException("Foto ilegible.")
        // Las cámaras suelen guardar el sensor horizontal y la rotación en EXIF.
        val orientation = android.media.ExifInterface(file.path).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1)
        val matrix = Matrix().apply {
          when (orientation) {
            2 -> setScale(-1f,1f)
            3 -> setRotate(180f)
            4 -> setScale(1f,-1f)
            5 -> { setRotate(90f); postScale(-1f,1f) }
            6 -> setRotate(90f)
            7 -> { setRotate(270f); postScale(-1f,1f) }
            8 -> setRotate(270f)
          }
        }
        val bitmap = Bitmap.createBitmap(original,0,0,original.width,original.height,matrix,true)
        if (bitmap !== original) original.recycle()
        if (y > 370) nextPage()
        line("Evidencia fotográfica ${i + 1}")
        val scale = minOf(495f / bitmap.width, 360f / bitmap.height)
        page.canvas.drawBitmap(bitmap,null,RectF(50f,y,50f+bitmap.width*scale,y+bitmap.height*scale),paint)
        y += bitmap.height*scale + 24; bitmap.recycle()
      }
      document.finishPage(page)
      val dir = File(context.filesDir,"reports").apply { mkdirs() }
      val id = data.getString("id"); require(id.matches(Regex("[a-zA-Z0-9-]{1,100}")))
      val file = File(dir,"$id.pdf")
      file.outputStream().use { document.writeTo(it) }
      promise.resolve("file://${file.absolutePath}")
    } catch (e: Exception) { promise.reject("PDF", e.message ?: "No se pudo generar el PDF.") }
    finally { document.close() }
  } }
  @ReactMethod fun sharePdf(uri: String, promise: Promise) { main.post {
    try {
      val file = ownFile(uri,"reports")
      val content = FileProvider.getUriForFile(context,"${context.packageName}.files",file)
      val intent = Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM,content)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val chooser = Intent.createChooser(intent,"Compartir reporte").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(chooser); promise.resolve(null)
    } catch (e: Exception) { promise.reject("PDF_SHARE","No se pudo compartir el reporte.",e) }
  } }
  @ReactMethod fun readAttachment(uri: String, promise: Promise) { worker.execute {
    try {
      val file = if (uri.endsWith(".pdf")) ownFile(uri,"reports") else ownFile(uri,"evidence")
      require(file.length() <= 15 * 1024 * 1024) { "El adjunto supera 15 MB." }
      promise.resolve(android.util.Base64.encodeToString(file.readBytes(), android.util.Base64.NO_WRAP))
    } catch (e: Exception) { promise.reject("ATTACHMENT",e.message,e) }
  } }
  override fun invalidate() {
    context.removeActivityEventListener(listener); worker.shutdownNow(); super.invalidate()
  }
}

class FieldToolsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(FieldToolsModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
