// Android Keystore AES-GCM; keys never enter JS or ordinary uni storage.
// No plaintext fallback. H5/iOS explicitly report unsupported secure persistence.
const alias = "callphone.secure.v1";
function bridge(): any {
  if (
    typeof plus === "undefined" ||
    uni.getSystemInfoSync().platform !== "android"
  )
    throw new Error("当前平台不支持安全保存，请使用 Android 应用");
  return plus.android;
}
function context() {
  const a = bridge();
  const invoke = (object: any, method: string, ...args: any[]) =>
    a.invoke(object, method, ...args);
  const activity = a.runtimeMainActivity();
  const prefs = invoke(activity, "getSharedPreferences", alias, 0);
  const keyStore = invoke(
    "java.security.KeyStore",
    "getInstance",
    "AndroidKeyStore",
  );
  invoke(keyStore, "load", null);
  if (!invoke(keyStore, "containsAlias", alias)) {
    const builder = a.newObject(
      "android.security.keystore.KeyGenParameterSpec$Builder",
      alias,
      3,
    );
    invoke(builder, "setBlockModes", ["GCM"]);
    invoke(builder, "setEncryptionPaddings", ["NoPadding"]);
    invoke(builder, "setKeySize", 256);
    const generator = invoke(
      "javax.crypto.KeyGenerator",
      "getInstance",
      "AES",
      "AndroidKeyStore",
    );
    invoke(generator, "init", invoke(builder, "build"));
    invoke(generator, "generateKey");
  }
  const key = invoke(keyStore, "getKey", alias, null);
  const bytes = (text: string) =>
    invoke(a.newObject("java.lang.String", text), "getBytes", "UTF-8");
  const encode = (data: any) =>
    String(invoke("android.util.Base64", "encodeToString", data, 2));
  const decode = (data: string) =>
    invoke("android.util.Base64", "decode", data, 2);
  function cipher(mode: number, iv?: string) {
    const cipher = invoke(
      "javax.crypto.Cipher",
      "getInstance",
      "AES/GCM/NoPadding",
    );
    if (iv)
      invoke(
        cipher,
        "init",
        mode,
        key,
        a.newObject("javax.crypto.spec.GCMParameterSpec", 128, decode(iv)),
      );
    else invoke(cipher, "init", mode, key);
    return cipher;
  }
  return { a, invoke, activity, prefs, bytes, encode, decode, cipher };
}
export const secureStore = {
  available() {
    return (
      typeof plus !== "undefined" &&
      uni.getSystemInfoSync().platform === "android"
    );
  },
  read<T>(slot: string): T | undefined {
    const { a, invoke, prefs, bytes, decode, cipher } = context();
    const stored = invoke(prefs, "getString", slot, null);
    if (!stored) return undefined;
    const value = JSON.parse(String(stored));
    if (value.version !== 1 || !value.iv || !value.data)
      throw new Error("安全存储格式不正确，原数据已保留");
    const decrypt = cipher(2, value.iv);
    invoke(decrypt, "updateAAD", bytes(slot));
    const plain = invoke(decrypt, "doFinal", decode(value.data));
    return JSON.parse(
      String(
        invoke(a.newObject("java.lang.String", plain, "UTF-8"), "toString"),
      ),
    );
  },
  write(slot: string, value: unknown) {
    const { invoke, prefs, bytes, encode, cipher } = context();
    const encrypt = cipher(1);
    invoke(encrypt, "updateAAD", bytes(slot));
    const data = encode(
      invoke(encrypt, "doFinal", bytes(JSON.stringify(value))),
    );
    const payload = JSON.stringify({
      version: 1,
      iv: encode(invoke(encrypt, "getIV")),
      data,
    });
    const editor = invoke(prefs, "edit");
    invoke(editor, "putString", slot, payload);
    if (!invoke(editor, "commit"))
      throw new Error("安全保存失败，请释放设备空间后重试");
  },
  remove(slot: string) {
    const { invoke, prefs } = context();
    const editor = invoke(prefs, "edit");
    invoke(editor, "remove", slot);
    if (!invoke(editor, "commit")) throw new Error("安全存储清理失败，请重试");
  },
};
// Copy recordings to app-private storage before acknowledging durable queue writes.
// Android protects this directory from other apps; never copy into shared external storage.
export function preserveRecording(path: string, uploadId: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(uploadId)) throw new Error("录音任务标识无效");
  const { a, invoke, activity } = context();
  const directory = a.newObject(
    "java.io.File",
    invoke(activity, "getNoBackupFilesDir"),
    "callphone-recordings",
  );
  if (!invoke(directory, "exists") && !invoke(directory, "mkdirs"))
    throw new Error("无法安全保存录音");
  const target = a.newObject("java.io.File", directory, uploadId + ".audio");
  const sourcePath = path.startsWith("_")
    ? plus.io.convertLocalFileSystemURL(path)
    : path.replace(/^file:\/\//, "");
  const source = a.newObject("java.io.File", sourcePath);
  if (!invoke(source, "isFile") || Number(invoke(source, "length")) <= 0)
    throw new Error("本机录音文件不可用");
  const input = a.newObject("java.io.FileInputStream", source);
  let output: any;
  try {
    output = a.newObject("java.io.FileOutputStream", target);
    const inputChannel = invoke(input, "getChannel"),
      outputChannel = invoke(output, "getChannel");
    const size = Number(invoke(inputChannel, "size"));
    let offset = 0;
    while (offset < size) {
      const copied = Number(
        invoke(
          inputChannel,
          "transferTo",
          offset,
          size - offset,
          outputChannel,
        ),
      );
      if (copied <= 0) throw new Error("录音保存未完成，请重试");
      offset += copied;
    }
    invoke(invoke(output, "getFD"), "sync");
    return String(invoke(target, "getAbsolutePath"));
  } finally {
    invoke(input, "close");
    if (output) invoke(output, "close");
  }
}
export function removePreservedRecording(path: string) {
  const { a, invoke, activity } = context();
  const directory = a.newObject(
    "java.io.File",
    invoke(activity, "getNoBackupFilesDir"),
    "callphone-recordings",
  );
  const file = a.newObject("java.io.File", path);
  const parent = String(invoke(directory, "getCanonicalPath"));
  if (!String(invoke(file, "getCanonicalPath")).startsWith(parent + "/"))
    throw new Error("录音清理路径无效");
  if (invoke(file, "exists") && !invoke(file, "delete"))
    throw new Error("录音清理失败");
}
