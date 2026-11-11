# Android 1.17 原签名打包与发布交接

本次目标包名为 `cn.edu.sxau.campustwin`，`versionName=1.17`、`versionCode=18`。本次实施电脑缺少 Android SDK Platform 36、项目所需的 Gradle 8.14.3 缓存，以及手机当前安装包对应的原签名，因此尚未生成可交付 APK，也未上传或发布本次新版。

## 1. 在原打包电脑准备环境

使用 Windows、JDK 21、Android SDK Platform 36、Android SDK Build Tools 36.0.0 和 Platform Tools。配置 `JAVA_HOME`、`ANDROID_HOME`，并将 JDK 的 `bin`、SDK 的 `platform-tools` 加入当前终端的 `PATH`。项目 wrapper 固定为 Gradle 8.14.3，首次运行需要网络下载；保留 wrapper、compileSdk 和依赖版本。

在仓库根目录进入项目：

```powershell
Set-Location .\04-应用开发\OurCampus
java -version
if (!(Test-Path -LiteralPath .env.local)) {
    throw '请先从原项目安全恢复已有 .env.local，再继续打包'
}
```

`.env.local` 必须使用原项目已有配置，不要提交或粘贴到公开文档。使用仓库锁文件安装依赖；不要用临时配置代替正式项目配置。

## 2. 配置手机现有应用使用的原签名

先在原打包电脑找到当时实际使用的 keystore、alias、store password 和 key password。即使历史安装包由 `assembleDebug` 使用 debug key 生成，本次也应将**同一个原 key** 配置为 release 签名。签名文件的名称、打包任务的名字不能代替证书核对。

首次配置时复制空白样例：

```powershell
if (!(Test-Path -LiteralPath .\android\signing.local.properties)) {
    Copy-Item -LiteralPath .\android\signing.example.properties -Destination .\android\signing.local.properties
}
```

在本机 `android/signing.local.properties` 填入四项：

| 配置键 | 内容 | 可替代的进程环境变量 |
| --- | --- | --- |
| `KEYSTORE_FILE` | 原 keystore 路径；相对路径从 `android` 目录解析 | `OURCAMPUS_KEYSTORE_FILE` |
| `KEY_ALIAS` | 原 key alias | `OURCAMPUS_KEY_ALIAS` |
| `STORE_PASSWORD` | 原 keystore 密码 | `OURCAMPUS_STORE_PASSWORD` |
| `KEY_PASSWORD` | 原 key 密码 | `OURCAMPUS_KEY_PASSWORD` |

本机文件中非空的值优先于对应环境变量。路径在 properties 文件中建议使用正斜杠；包含非 ASCII 字符的路径可通过环境变量传入，避免 Java properties 编码差异。四项必须完整且文件存在，release 构建才会使用该签名；缺失时明确报错：

> 请在原打包电脑配置原签名，不能使用临时debug签名发布升级包

本机签名配置和 Android 私钥文件已被根 `.gitignore` 排除，空白样例保留在仓库中。私钥和密码应留在原电脑或既有安全保管渠道；不要新建替代签名，不要把私钥或密码发进聊天、日志、Git 或公开下载桶。

## 3. 同步网页资源并构建 release APK

在项目目录依次执行；任一步失败都先处理错误：

```powershell
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci 失败' }
npm run android:sync
if ($LASTEXITCODE -ne 0) { throw 'Android 资源同步失败' }
Push-Location .\android
try {
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE -ne 0) { throw 'release 构建失败' }
} finally {
    Pop-Location
}
$releaseApk = (Resolve-Path -LiteralPath .\android\app\build\outputs\apk\release\app-release.apk).Path
```

`android:sync` 会重新构建网页并同步到 Capacitor。现有 `npm run android:apk` 调用的是 `assembleDebug`；本次交付使用上面的原签名 release 流程。

原签名配置完成后，也可执行等价快捷命令 `npm run android:release`。上面的分步命令保留用于定位依赖安装、资源同步或原生构建错误。

## 4. 核对包名、版本和实际手机证书

继续在项目目录操作：

```powershell
$buildTools = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0'
$apkSigner = Join-Path $buildTools 'apksigner.bat'
& (Join-Path $buildTools 'aapt.exe') dump badging $releaseApk | Select-String '^package:'
& $apkSigner verify --verbose --print-certs $releaseApk
if ($LASTEXITCODE -ne 0) { throw '新 APK 签名验证失败' }
```

包信息必须显示 `cn.edu.sxau.campustwin`、`versionCode='18'` 和 `versionName='1.17'`。再连接**仍安装旧版的真实手机**，开启 USB 调试，仅连接目标设备：

```powershell
adb devices
$installedApkLine = (adb shell pm path cn.edu.sxau.campustwin | Select-String '^package:' | Select-Object -First 1).Line
if (!$installedApkLine) { throw '目标手机未找到现有应用' }
$installedApkPath = $installedApkLine.Substring('package:'.Length).Trim()
$installedApkCopy = Join-Path $env:TEMP 'OurCampus-installed-before-update.apk'
adb pull $installedApkPath $installedApkCopy
if ($LASTEXITCODE -ne 0) { throw '读取手机现有 APK 失败' }
& $apkSigner verify --verbose --print-certs $installedApkCopy
if ($LASTEXITCODE -ne 0) { throw '手机现有 APK 签名验证失败' }
```

比较两份 APK 输出的签名证书 SHA-256，必须与实际手机安装包对应的原签名一致。也应检查手机现有包的 versionCode，确认可升级到 18；如果现有 versionCode 已达到或超过 18，先协调新的版本号再构建。

仓库中 `docs/apk/OurCampus-1.16-校园装扮与全屏地图.apk` 的证书 SHA-256 为：

```text
501005b09c563a900b6b2b30729725306bf0af4ccabcddc2d0d64d3b842b43e0
```

这只是仓库旧 APK 的参考指纹，**不能代表手机当前安装包**。手机可能使用队友或另一台电脑打出的不同签名，最终以真实手机核对结果为准；签名不一致时停止交付，找回对应原 key。

## 5. 在旧手机完成覆盖安装验证

发布前，保留旧手机上的现有应用和数据，执行覆盖安装：

```powershell
adb install -r $releaseApk
if ($LASTEXITCODE -ne 0) { throw '覆盖安装失败，停止发布并检查原签名和版本号' }
```

确认原应用可直接升级、账号和已有数据保留；进入应用检查当前版本为 1.17，并验证头像与主页、各板块头像、返回层级和设置中的检查更新。离线进入应用应可正常使用，手动检查失败应能反馈并重试。1.16 首次需要手动覆盖安装具备更新功能的 1.17，之后才可发现后续已发布版本。

如果出现 `INSTALL_FAILED_UPDATE_INCOMPATIBLE` 或其他安装错误，保留错误信息并核对签名、版本与设备状态。不要通过卸载旧版绕过覆盖升级失败，也不要换新签名继续发布。

## 6. 记录哈希、大小，再交给有发布权限的维护者

只对通过旧手机覆盖安装验证的最终 APK 计算：

```powershell
$releaseHash = (Get-FileHash -LiteralPath $releaseApk -Algorithm SHA256).Hash.ToLowerInvariant()
$releaseBytes = (Get-Item -LiteralPath $releaseApk).Length
$releaseHash
$releaseBytes
if ($releaseBytes -gt 52428800) {
    throw 'APK 超过 app-releases 的 50 MiB 限额，停止上传并先处理体积'
}
```

本次 Storage 限额为 **50 MiB（52,428,800 字节）**，最终 APK 大小必须不超过该值。不要省略大小检查，也不要将超限文件登记为可用更新。

后续发布顺序如下，本交接文档本身不执行上传或发布：

1. 有权限的维护者将最终 APK 上传到独立 `app-releases` 桶，路径使用 `android/OurCampus-1.17.apk`。文件名只使用英文字母、数字、点、下划线、连字符，不能包含连续两个点。
2. 直接访问对应项目的公开 HTTPS 下载地址，重新下载后核对 SHA-256 与字节数；地址不得附带账号信息、查询参数或片段。
3. 记录包名、`1.17 / 18`、实际手机与新包证书核对结果、APK SHA-256、字节数、覆盖安装结果和更新说明。文件、版本、哈希及大小必须对应同一份最终 APK。
4. 全部核对通过后，再由有权限的维护者写入并发布稳定版更新元数据。先上传并验证文件，再发布元数据；普通客户端账号不能上传或发布。
5. 后续每次更新沿用同一原签名并递增 versionCode。对尚无真实验证结果的事项保留待验证状态，不把本机网页预览当作真实手机安装通过。
