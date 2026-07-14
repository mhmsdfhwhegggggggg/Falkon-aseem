# Falkon Aseem

Falkon Aseem هو نظام إدارة وأتمتة Telegram يتكون من خادم **Express/tRPC**، ولوحة **React/Vite**، وتطبيق Android أصلي مغلف بواسطة **Capacitor**. تطبيق Android عميل فقط؛ يجب نشر `api-server` وتشغيله دائمًا كي تعمل الحسابات والمهام.

## حالة الإصدار

الإصدار الحالي يربط تطبيق Android افتراضيًا بالخادم التالي:

```text
http://85.155.190.130
```

بسبب استخدام الخادم الحالي HTTP، يسمح Android بالاتصال غير المشفر **لهذا العنوان فقط** عبر `network_security_config.xml`، ويمنعه افتراضيًا لبقية الوجهات. يوصى بشدة بوضع الخادم خلف HTTPS ثم إزالة استثناء HTTP قبل التوزيع العام.

> يجب نشر كود الخادم الموجود في هذا المستودع على الخادم الحقيقي قبل استخدام APK الجديد. نسخة الخادم التي كانت منشورة وقت إعداد هذا الإصدار لم تكن تحتوي عقد المصادقة الجديد `auth.login`، ولذلك لن يستطيع التطبيق تسجيل الدخول إلى أن يتم تحديث الخادم.

## المتطلبات

| المكوّن | المتطلب |
|---|---|
| Node.js | 22 أو إصدار LTS متوافق |
| pnpm | 10.13.1 |
| PostgreSQL | قاعدة بيانات متاحة للخادم |
| Android | JDK 21، Android SDK، منصة وأدوات بناء API 35+ |
| Telegram | `TELEGRAM_API_ID` و`TELEGRAM_API_HASH` صالحان |

## إعداد الخادم

انسخ نموذج البيئة ولا تضع القيم الحقيقية في Git:

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
```

المتغيرات الأمنية الرئيسية هي:

| المتغير | الغرض |
|---|---|
| `ADMIN_SECRET_KEY` | كلمة مرور دخول الإدارة؛ يجب أن تكون طويلة وعشوائية |
| `ADMIN_TOKEN_KEY` | مفتاح HMAC مستقل بطول 32 محرفًا على الأقل |
| `DATA_ENCRYPTION_KEY` | مفتاح AES-256 بطول 32 بايت، Hex أو Base64 |
| `DATABASE_URL` | اتصال PostgreSQL |
| `CORS_ALLOWED_ORIGINS` | أصول لوحات الويب الإضافية المفصولة بفواصل |

يشفّر الخادم `session_str` و`api_hash` باستخدام **AES-256-GCM**. عند أول تشغيل بالمفتاح الجديد، تُرحّل القيم النصية القديمة تلقائيًا إلى الصيغة المشفرة. يجب نسخ قاعدة البيانات احتياطيًا قبل أول نشر، والاحتفاظ بمفتاح التشفير في مدير أسرار دائم؛ فقدانه يجعل الجلسات المخزنة غير قابلة للفك.

للبناء والتشغيل:

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server build
NODE_ENV=production pnpm --filter @workspace/api-server start
```

ينبغي تشغيل الخادم خلف reverse proxy يدعم HTTPS، وتمرير عنوان العميل الصحيح، وإدارة العملية عبر systemd أو حاوية/منصة نشر. لا توجد بيانات SSH أو صلاحيات نشر للخادم داخل المستودع.

## فحوص الجودة

```bash
pnpm run typecheck
pnpm -r run test
pnpm -r run build
pnpm audit --prod
```

## بناء Android Release

أنشئ مفتاح توقيع مرة واحدة واحفظه خارج المستودع. مفتاح التوقيع هو هوية جميع تحديثات التطبيق اللاحقة، ولا يمكن استبداله دون مسار ترحيل متجر رسمي.

```bash
export ANDROID_HOME=/path/to/android-sdk
export JAVA_HOME=/path/to/jdk-21
export FALKON_KEYSTORE_PATH=/secure/path/falkon-release.jks
export FALKON_KEYSTORE_PASSWORD='...'
export FALKON_KEY_ALIAS='falkon-release'
export FALKON_KEY_PASSWORD='...'
export FALKON_VERSION_CODE=1
export FALKON_VERSION_NAME=1.0.0

pnpm --filter @workspace/web-dashboard android:lint
pnpm --filter @workspace/web-dashboard android:apk
pnpm --filter @workspace/web-dashboard android:aab
```

المخرجات القياسية:

```text
artifacts/web-dashboard/android/app/build/outputs/apk/release/app-release.apk
artifacts/web-dashboard/android/app/build/outputs/bundle/release/app-release.aab
```

يُستخدم APK للتثبيت المباشر، بينما AAB هو الملف الموصى به للنشر في Google Play. ملفات `*.jks` و`*.keystore` وملفات خصائص التوقيع مستثناة من Git.

## بنية الأمان

| المجال | التطبيق الحالي |
|---|---|
| دخول الإدارة | تحقق خادمي ومقارنة ثابتة الزمن |
| الجلسة | Bearer token موقّع بـHMAC ومحدود العمر، محفوظ في `sessionStorage` |
| إجراءات tRPC | جميع الإجراءات التشغيلية محمية؛ الدخول والترخيص العام فقط مستثنيان |
| محاولات الدخول | محدد معدل مستقل لمسار تسجيل الدخول |
| CORS | أصول Capacitor والخادم والقائمة الصريحة فقط |
| أسرار Telegram | AES-256-GCM مع IV عشوائي ووسم مصادقة وترحيل للبيانات القديمة |
| Android backup | معطل، مع قواعد منع استخراج البيانات الحديثة |
| HTTP | مسموح فقط لعنوان الخادم المحدد حاليًا |
| توقيع Android | Release keystore خارج المستودع |

## تدوير الأسرار

احتوت نسخة سابقة من إعداد `.replit` في تاريخ المستودع العام على قيم إدارة وTelegram. أزيلت القيم من الحالة الحالية، لكن الحذف لا يمحو سجل Git القديم. يجب **تغيير كلمة الإدارة وبيانات Telegram المتأثرة فورًا**، وعدم إعادة استخدامها. إذا لزم حذفها من التاريخ نفسه، نفّذ إعادة كتابة مدروسة للتاريخ بالتنسيق مع جميع مستخدمي المستودع.

كذلك ينبغي إلغاء أي رمز وصول GitHub تم إرساله عبر قنوات غير مخصصة للأسرار بعد الانتهاء من الرفع، وإنشاء رمز جديد محدود الصلاحيات عند الحاجة.
