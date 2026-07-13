# Domain Setup & DNS Automation

## Current Configuration

| Service | Domain | Target | Status |
|---------|--------|--------|:------:|
| **ClouDNS** | `leak-detector.scrutari.cloud-ip.cc` | `scrutari-submit-1783887159.netlify.app` (CNAME) | ✅ DNS resolving |
| **Netlify** | `scrutari-submit-1783887159.netlify.app` | — | ✅ Active |

### DNS Resolution
```
leak-detector.scrutari.cloud-ip.cc
    ↓ CNAME
scrutari-submit-1783887159.netlify.app
    ↓ A/AAAA
Netlify load balancer (35.157.26.135, 2a05:d014:58f:6200::259)
```

### Next Step
Add the domain in the Netlify dashboard to enable SSL:
```
https://app.netlify.com/sites/scrutari-submit-1783887159/settings/domain
```
Click "Add custom domain" → enter `leak-detector.scrutari.cloud-ip.cc`

---

## ClouDNS API

### Authentication
Get API credentials at: `https://www.cloudns.net/api/login/get-api-token/`

### Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/dns/zones.json` | List all DNS zones |
| GET | `/api/dns/records.json?zone-name=DOMAIN` | List records in a zone |
| POST | `/api/dns/add-record.json` | Add a new DNS record |
| POST | `/api/dns/delete-record.json` | Delete a DNS record |
| POST | `/api/dns/update-record.json` | Update an existing record |

### Add CNAME Record
```bash
curl -X POST "https://www.cloudns.net/api/dns/add-record.json" \
  -d "auth-id=YOUR_ID" \
  -d "auth-password=YOUR_TOKEN" \
  -d "zone-name=scrutari.cloud-ip.cc" \
  -d "record-type=CNAME" \
  -d "host=leak-detector" \
  -d "record=scrutari-submit-1783887159.netlify.app" \
  -d "ttl=60"
```

### Update Existing Record
```bash
curl -X POST "https://www.cloudns.net/api/dns/update-record.json" \
  -d "auth-id=YOUR_ID" \
  -d "auth-password=YOUR_TOKEN" \
  -d "zone-name=scrutari.cloud-ip.cc" \
  -d "record-id=RECORD_ID" \
  -d "record-type=CNAME" \
  -d "host=leak-detector" \
  -d "record=NEW_TARGET.netlify.app" \
  -d "ttl=60"
```

### Deploy Hook Script
```bash
#!/bin/bash
# Run after each Netlify deploy to keep DNS in sync
ZONE="scrutari.cloud-ip.cc"
RECORD_ID=$(curl -s "https://www.cloudns.net/api/dns/records.json?auth-id=$ID&auth-password=$TOKEN&zone-name=$ZONE" | \
  python3 -c "import sys,json; rs=json.load(sys.stdin); print([r['id'] for r in rs if r['host']=='leak-detector'][0])")

curl -X POST "https://www.cloudns.net/api/dns/update-record.json" \
  -d "auth-id=$ID&auth-password=$TOKEN&zone-name=$ZONE&record-id=$RECORD_ID" \
  -d "record-type=CNAME&host=leak-detector&record=$(npx netlify api getSite -d '{\"site_id\":\"07a114de-1ed2-4268-b692-8e3690e4e51f\"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['ssl_url'].replace('https://',''))")&ttl=60"
```

---

## Alternative DNS Services

| Service | Free? | CAPTCHA | CNAME | API | Notes |
|---------|:-----:|:-------:|:-----:|:---:|-------|
| **ClouDNS.net** | ✅ | 🟡 Sometimes | ✅ | ✅ | 1 free zone, 50 records |
| **DuckDNS** | ✅ | 🔴 Currently broken | ✅ | ✅ | CAPTCHA loop issues |
| **FreeDNS (afraid.org)** | ✅ | 🟡 Sometimes | ✅ | ✅ | Public domains (mooo.com) |
| **Cloudflare** | ✅ | ✅ None | ✅ | ✅ | Best features, needs own domain |
| **sslip.io** | ✅ | ✅ None | ❌ IP only | ❌ | No registration needed |
