# کولیفای بله (coolify-bale)

> پل ارتباطی سریع، سبک و امن برای ارسال وب‌هوک‌های اعلان **Coolify** به پیام‌رسان **بله (Bale)**

[English Documentation](README.md) | [مستندات فارسی](README.fa.md)

[![Node.js](https://img.shields.io/badge/Node.js-22%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Author](https://img.shields.io/badge/Author-Erfan%20Vahabpour-blue)](https://github.com/ErfanVahabpour)

---

## فهرست مطالب

1. [معرفی پروژه](#معرفی-پروژه)
2. [معماری سیستم](#معماری-سیستم)
3. [ویژگی‌های کلیدی](#ویژگیهای-کلیدی)
4. [پیش‌نیازها](#پیشنیازها)
5. [مرحله ۱: ساخت بازو در بله و دریافت توکن](#مرحله-۱-ساخت-بازو-در-بله-و-دریافت-توکن)
6. [مرحله ۲: تنظیم فایل محیطی (.env)](#مرحله-۲-تنظیم-فایل-محیطی-env)
7. [مرحله ۳: راه‌اندازی با Docker Compose](#مرحله-۳-راهاندازی-با-docker-compose)
8. [راه‌اندازی بدون داکر (مستقیم با Node.js)](#راهاندازی-بدون-داکر-مستقیم-با-nodejs)
9. [مرحله ۴: تنظیم اعلان در کولیفای](#مرحله-۴-تنظیم-اعلان-در-کولیفای)
10. [امنیت و احراز هویت](#امنیت-و-احراز-هویت)
11. [پشتیبانی از چند مقصد و وب‌هوک مجزا](#پشتیبانی-از-چند-مقصد-و-وبهوک-مجزا)
12. [تست محلی با دستور curl](#تست-محلی-با-دستور-curl)
13. [تنظیم Reverse Proxy و HTTPS](#تنظیم-reverse-proxy-و-https)
14. [استقرار مستقیم درون خود کولیفای](#استقرار-مستقیم-درون-خود-کولیفای)
15. [نکات فنی API بله](#نکات-فنی-api-بله)
16. [راهنمای رفع مشکلات (Troubleshooting)](#راهنمای-رفع-مشکلات-troubleshooting)
17. [به‌روزرسانی](#بهروزرسانی)
18. [مجوز و حق نشر](#مجوز-و-حق-نشر)

---

## معرفی پروژه

ابزار **coolify-bale** یک بریج (پل ارتباطی) مستقل و سبک‌وزن است که رویدادها و اعلان‌های سیستم مدیریت استقرار [Coolify](https://coolify.io) را از طریق وب‌هوک دریافت کرده و آن‌ها را با ساختار مرتب و قالب‌بندی شده به بازوی پیام‌رسان ایرانی [بله (Bale)](https://bale.ai) در قالب چت خصوصی، گروه یا کانال ارسال می‌کند.

> [!IMPORTANT]
> **نیازی به تغییر یا فورک کردن کولیفای نیست!**
> این پروژه کاملاً بدون دستکاری در سورس کولیفای کار می‌کند و از قابلیت پیش‌فرض **Webhook Notifications** در کولیفای بهره می‌برد.

---

## معماری سیستم

```
┌─────────────────┐
│     Coolify     │ (مدیریت سرور و استقرارها)
└────────┬────────┘
         │ درخواست HTTP POST /webhook/:id
         │ سربرگ Authorization: Bearer <secret>
         ▼
┌─────────────────┐
│  coolify-bale   │ (سرویس سبک بر پایه Express 5 و Node 22)
│  Webhook Bridge │ - اعتبارسنجی امن و مقاوم در برابر حمله زمان‌سنجی
│                 │ - ایمن‌سازی ورودی‌ها علیه تزریق HTML
│                 │ - نگاشت ایموجی و رویدادهای مختلف استقرار
└────────┬────────┘
         │ درخواست HTTPS POST به api بله: /bot{TOKEN}/sendMessage
         │ محتوای JSON حاوی chat_id و متن پیام
         ▼
┌─────────────────┐
│  Bale Bot API   │ (https://tapi.bale.ai)
└────────┬────────┘
         ▼
┌─────────────────┐
│  گفتگوی بله     │ (کاربر، گروه توسعه یا کانال اعلان‌ها)
└─────────────────┘
```

---

## ویژگی‌های کلیدی

- **یکپارچگی آسان**: اتصال مستقیم به بخش Webhook Notifications در پنل کولیفای.
- **پشتیبانی از چندین وب‌هوک (Multi-Webhook)**: امکان تعریف چند اندپوینت جداگانه (مثل `/webhook/production` و `/webhook/staging`) با کلیدهای اختصاصی و ارسال به بات‌ها یا کانال‌های مختلف در یک نمونه فعال.
- **امنیت بالا در احراز هویت**: بررسی توکن مخفی از طریق مقایسه هش SHA-256 در زمان ثابت (`timingSafeEqual`) جهت جلوگیری از حملات کانال جانبی (Timing Attacks).
- **قالب‌بندی غنی پیام (HTML)**: استفاده از برچسب‌های استاندارد و تبدیل خودکار کاراکترهای خطرناک به موجودیت‌های امن HTML.
- **تشخیص هوشمند رویدادها**: نمایش ایموجی مناسب برای موفقیت در استقرار (🚀)، خطا در استقرار (❌)، نسخه پشتیبان (💾)، در دسترس بودن سرور (🟢) و...
- **مقاومت در برابر خطای پارامترها**: در صورتی که بله پارامتری مثل پیش‌نمایش لینک یا موجودیت خاصی از HTML را نپذیرد، سیستم به صورت خودکار پیام را به عنوان متن ساده باز ارسال می‌کند تا هیچ اعلانی از دست نرود.
- **محافظت از لو رفتن توکن‌ها**: حذف و سانسور خودکار توکن‌های حساس بات و سکرت‌ها از لاگ‌ها و پاسخ‌های سرور.
- **بهینه‌سازی شده برای محیط پروداکشن**: ایمیج داکر مبتنی بر Alpine با کاربر غیر روت (`node`)، محدودیت حجم پی‌لود (256 کیلوبایت)، ریت‌لیمیت درون‌حافظه‌ای و هندلینگ تمیز خاموش شدن سرور (`SIGTERM`/`SIGINT`).
- **تست‌های کامل خودکار**: دارای ۳۰ تست واحد و یکپارچگی با فریم‌ورک بومی نود بدون پکیج‌های اضافی.

---

## پیش‌نیازها

- **Docker و Docker Compose** (روش پیشنهادی برای سرور)
- *یا* **Node.js 20 به بالا** (ترجیحاً Node.js 22 LTS) و ابزار **npm**

---

## مرحله ۱: ساخت بازو در بله و دریافت توکن

1. اپلیکیشن یا نسخه وب پیام‌رسان **بله** را باز کنید.
2. با شناسه `BotFather@` وارد گفتگو شوید.
3. دستور `newbot/` را بفرستید و طبق راهنما، نام نمایشی و نام کاربری بات را وارد کنید (نام کاربری باید با `bot` خاتمه یابد؛ مانند `coolify_alerts_bot`).
4. بات‌فادر یک **توکن اختصاصی API** (مانند `123456789:AAH...`) به شما می‌دهد.
5. **یافتن شناسه چت (Chat ID)**:
   - اگر می‌خواهید پیام در گفتگوی خصوصی بیاید: یک پیام یا دستور `start/` به بات تازه ایجاد شده بفرستید.
   - اگر می‌خواهید پیام به یک گروه یا کانال فرستاده شود: بات را به گروه/کانال اضافه کرده و دسترسی مدیر (Administrator) به آن بدهید.
   - سپس از طریق مرورگر یا curl آدرس زیر را صدا بزنید تا لیست پیام‌ها و Chat ID را ببینید:
     ```bash
     curl https://tapi.bale.ai/bot<YOUR_BOT_TOKEN>/getUpdates
     ```
   - عدد بخش `"chat":{"id": 123456789}` همان شناسه مقصد شما (`baleChatId`) است.

---

## مرحله ۲: تنظیم فایل محیطی (.env)

ابتدا پروژه را کلون کرده و فایل تنظیمات را بسازید:

```bash
git clone https://github.com/ErfanVahabpour/coolify-bale.git
cd coolify-bale
cp .env.example .env
nano .env
```

### متغیرهای تنظیمات

| متغیر | نوع | مقدار پیش‌فرض | توضیحات |
| :--- | :--- | :--- | :--- |
| `PORT` | عدد | `3000` | پورتی که سرور به آن متصل می‌شود. |
| `HOST` | متن | `0.0.0.0` | آدرس هاست برای گوش دادن به درخواست‌ها. |
| `LOG_REQUESTS` | بولین | `true` | لاگ زدن درخواست‌های ورودی (بدون ذخیره اطلاعات محرمانه). |
| `WEBHOOKS` | آرایه JSON | *اجباری* | لیست مقاصد وب‌هوک و کلیدهای ارتباطی. |
| `INCLUDE_RAW_PAYLOAD`| بولین | `false` | ضمیمه کردن کل جیسون دریافتی از کولیفای در انتهای پیام. |
| `DISABLE_LINK_PREVIEWS`| بولین| `true` | غیرفعال کردن پیش‌نمایش لینک‌ها در چت بله. |
| `RATE_LIMIT_WINDOW_MS`| عدد | `60000` | بازه زمانی محدودیت نرخ درخواست به میلی‌ثانیه. |
| `RATE_LIMIT_MAX` | عدد | `60` | سقف مجاز درخواست در هر بازه به ازای هر IP. |
| `BALE_API_BASE_URL` | متن | `https://tapi.bale.ai` | آدرس پایه سرویس بله. |
| `BALE_REQUEST_TIMEOUT_MS`| عدد | `10000` | تایم‌اوت درخواست به بله به میلی‌ثانیه. |

### نمونه محتوای `.env`

```env
PORT=3000
HOST=0.0.0.0
LOG_REQUESTS=true

WEBHOOKS=[{"id":"production","secret":"my_strong_secret_key_123","baleBotToken":"123456789:ABCDefghIJKlmnoPQRstuvwxYZ","baleChatId":"987654321"},{"id":"staging","secret":"another_secret_key_456","baleBotToken":"987654321:ZYXwvutSRQPonmlKJIhgfeDCBA","baleChatId":"-100123456789"}]

INCLUDE_RAW_PAYLOAD=false
DISABLE_LINK_PREVIEWS=true
```

---

## مرحله ۳: راه‌اندازی با Docker Compose

برای اجرای سرویس در پس‌زمینه با داکر کامپوز:

```bash
docker compose up -d --build
```

مشاهده لاگ‌های زنده کانتینر:

```bash
docker compose logs -f
```

بررسی وضعیت سلامت کانتینر:

```bash
curl http://localhost:3000/health
```

خروجی مورد انتظار:

```json
{"ok":true,"configuredWebhooks":2}
```

برای متوقف کردن کانتینر:

```bash
docker compose down
```

---

## راه‌اندازی بدون داکر (مستقیم با Node.js)

در صورتی که می‌خواهید مستقیماً روی سیستم‌عامل با نود اجرا کنید:

```bash
# نصب پکیج‌های مورد نیاز پروداکشن
npm ci --omit=dev

# اجرای تست‌های خودکار جهت اطمینان از عملکرد
npm test

# اجرای سرور
npm start
```

جهت مدیریت پروسه در پس‌زمینه می‌توانید از **PM2** استفاده فرمایید:

```bash
npm install -g pm2
pm2 start src/server.js --name "coolify-bale"
pm2 save
pm2 startup
```

---

## مرحله ۴: تنظیم اعلان در کولیفای

پس از بالا آمدن بریج، آن را به کولیفای وصل کنید:

1. وارد پنل مدیریت **Coolify** شوید.
2. از منوی کناری به بخش **Keys & Tokens** یا **Notifications** -> **Webhook** بروید.
3. گزینه **Webhook Notifications** را فعال کنید.
4. مقادیر زیر را درج کنید:
   - **Webhook URL**:
     ```
     https://alerts.yourdomain.com/webhook/production
     ```
   - **Authorization Header**:
     ```
     Bearer my_strong_secret_key_123
     ```
5. تیک رویدادهای مورد نظر را بزنید (استقرار موفق، استقرار ناموفق، وضعیت بکاپ و...).
6. دکمه **Save** را زده و سپس روی **Test Notification** کلیک کنید.

---

## امنیت و احراز هویت

کلیه درخواست‌ها به مسیر `POST /webhook/:id` باید دارای هدر احراز هویت باشند:

```http
Authorization: Bearer <secret>
```

- ارسال کلید در URL یا بدنه درخواست پذیرفته نمی‌شود.
- بررسی کلید با توابع ضد نشت زمانی انجام می‌گیرد تا از کشف طول کلید توسط نفوذگران جلوگیری شود.
- در صورت اشتباه بودن یا نبودن هدر، خطای `401 Unauthorized` بازگردانده می‌شود.
- هیچ‌یک از توکن‌ها یا پسوردها در لاگ‌های سیستمی ذخیره نمی‌شوند.

---

## پشتیبانی از چند مقصد و وب‌هوک مجزا

شما می‌توانید با یک نمونه از این بریج، وب‌هوک‌های جداگانه‌ای برای بخش‌های مختلف بسازید:

```json
[
  {
    "id": "production",
    "secret": "prod-secret-123",
    "baleBotToken": "BOT_TOKEN_1",
    "baleChatId": "CHAT_ID_PROD"
  },
  {
    "id": "staging",
    "secret": "stage-secret-456",
    "baleBotToken": "BOT_TOKEN_2",
    "baleChatId": "CHAT_ID_DEV_GROUP"
  }
]
```

- آدرس پروداکشن: `POST /webhook/production`
- آدرس استیجینگ: `POST /webhook/staging`
- اگر شناسه‌ای فرستاده شود که در لیست موجود نیست، پاسخ `404 Not Found` داده می‌شود.

---

## تست محلی با دستور curl

می‌توانید یک اعلان فرضی استقرار کولیفای را شبیه‌سازی کنید:

```bash
curl -X POST http://localhost:3000/webhook/production \
  -H "Authorization: Bearer my_strong_secret_key_123" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "deployment_success",
    "success": true,
    "application_name": "my-app",
    "project_name": "production",
    "server_name": "primary-vps",
    "message": "استقرار نسخه جدید با موفقیت به پایان رسید",
    "fqdn": "https://example.com",
    "deployment_uuid": "dep-9a8b7c6d"
  }'
```

پاسخ سرور:

```json
{ "ok": true }
```

پیام ارسال شده در بله:

```html
🚀 Deployment Success

Application: my-app
Project: production
Server: primary-vps

استقرار نسخه جدید با موفقیت به پایان رسید

🔗 https://example.com

dep-9a8b7c6d
```

---

## تنظیم Reverse Proxy و HTTPS

برای استفاده در پروداکشن، بهتر است از HTTPS استفاده نمایید:

### نمونه Nginx

```nginx
server {
    server_name alerts.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/alerts.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/alerts.yourdomain.com/privkey.pem;
}
```

### نمونه Caddy (دریافت خودکار SSL)

```caddy
alerts.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

## استقرار مستقیم درون خود کولیفای

جالب است بدانید که می‌توانید همین پروژه `coolify-bale` را به عنوان یک برنامه در خود پنل کولیفای اجرا کنید!

1. در کولیفای یک **Application** جدید از نوع **Public Repository** بسازید.
2. آدرس گیت این مخزن (`https://github.com/ErfanVahabpour/coolify-bale.git`) را بدهید.
3. نوع بیلد را روی **Docker Compose** یا **Dockerfile** بگذارید.
4. در تب **Environment Variables** متغیرهای فایل `.env` را اضافه کنید.
5. دامنه مورد نظرتان را ست کنید تا کولیفای به‌طور خودکار سرتیفیکیت SSL لِتس‌انکریپت را صادر کند.

---

## نکات فنی API بله

1. **آدرس متد**: پیام‌ها با متد POST به `https://tapi.bale.ai/bot<TOKEN>/sendMessage` ارسال می‌شوند.
2. **پشتیبانی از تگ‌های HTML**: ساختارهای `<b>`, `<i>`, `<code>`, `<pre>`, `<a href="...">` در بله پشتیبانی می‌شوند. ورودی‌های دریافتی از کولیفای ایمن‌سازی می‌شوند تا تگ‌های ناخواسته ساختار پیام را خراب نکنند.
3. **محدودیت حجم پیام**: بله سقفی در حدود ۴۰۹۶ کاراکتر دارد؛ سیستم طول متن را کنترل کرده و در صورت نیاز انتهای پیام‌های بسیار طولانی را تمیز و با علامت `... (truncated)` کوتاه می‌کند.
4. **ماژولار بودن ارتباط**: تمامی رفتارهای مربوط به بله در فایل مجزای [`src/bale.js`](src/bale.js) قرار دارند تا در صورت هرگونه تغییر در مستندات بله، تغییرات در یک نقطه اعمال شود.

---

## راهنمای رفع مشکلات (Troubleshooting)

| مشکل | علت احتمالی | راه‌حل |
| :--- | :--- | :--- |
| `HTTP 401 Unauthorized` | نبود هدر یا اشتباه بودن کلید سکرت | مطمئن شوید سربرگ `Authorization: Bearer <secret>` با مقدار درون `.env` یکی است. |
| `HTTP 404 Not Found` | اشتباه بودن شناسه وب‌هوک در URL | چک کنید شناسه در آدرس `/webhook/<id>` دقیقاً با یکی از idهای موجود در آرایه `WEBHOOKS` همخوانی داشته باشد. |
| `HTTP 502 Bad Gateway` | عدم پاسخ‌گویی یا رد پیام توسط بله | لاگ‌های کانتینر را بررسی کنید. از درستی توکن بات، شناسه چت و استارت بودن بات در چت اطمینان حاصل کنید. |
| `HTTP 413 Payload Too Large` | حجم بیش از حد بدنه درخواست (بالای 256KB) | بررسی کنید کولیفای متن‌های لاگ خیلی حجیم نفرستد. |
| `HTTP 429 Too Many Requests` | فرستادن درخواست بیشتر از حد مجاز ریت‌لیمیت | مقادیر `RATE_LIMIT_MAX` یا `RATE_LIMIT_WINDOW_MS` را در `.env` افزایش دهید. |

---

## به‌روزرسانی

برای آپدیت سرویس به آخرین نسخه:

```bash
git pull origin main
docker compose up -d --build
```

---

## مجوز و حق نشر

این پروژه یک نرم‌افزار متن‌باز است که تحت مجوز [MIT](LICENSE) منتشر شده است.

**توسعه‌دهنده**: [عرفان وهاب‌پور (Erfan Vahabpour)](https://github.com/ErfanVahabpour)
